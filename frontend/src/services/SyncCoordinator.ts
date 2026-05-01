/**
 * Sync Coordinator - FIFO Queue Processor
 * Handles offline-to-online synchronization with retry logic
 */

import { db } from '../db/db';
import { syncAPI } from './api';
import { snapshotService } from './SnapshotService';
import { silentUpdate } from './conflictUtils';
import { checkStorageQuota } from '../utils/storage';
import { snapshotWorker } from './SnapshotWorker'; // FASE 3: Import SnapshotWorker

export interface SyncQueueEntry {
  id: string;
  table_name: string;
  action: 'create' | 'update' | 'delete';
  payload: any;
  timestamp: string;
  retry_count?: number;
}

const MAX_RETRIES = 5;
const SYNC_BATCH_SIZE = 10;
const BASE_BACKOFF_MS = 2000; // 2 seconds
const MAX_BACKOFF_MS = 30000; // 30 seconds max

// Log deduplication: prevent spamming same error
const logHistory = new Map<string, { count: number; lastSeen: number }>();
const LOG_DEDUP_WINDOW_MS = 10000; // 10 seconds
const LOG_DEDUP_MAX_COUNT = 3;

function dedupLog(prefix: string, message: string, ...args: any[]): void {
  const key = `${prefix}:${message}`;
  const now = Date.now();
  const entry = logHistory.get(key);
  
  if (!entry || now - entry.lastSeen > LOG_DEDUP_WINDOW_MS) {
    logHistory.set(key, { count: 1, lastSeen: now });
    console.log(prefix, message, ...args);
  } else {
    entry.count++;
    entry.lastSeen = now;
    if (entry.count <= LOG_DEDUP_MAX_COUNT) {
      console.log(prefix, message, ...args);
    } else if (entry.count === LOG_DEDUP_MAX_COUNT + 1) {
      console.log(prefix, `[x${entry.count}] ${message} (suppressed)`, ...args);
    }
  }
}

export class SyncCoordinator {
  private isProcessing = false;
  private isSyncing = false;
  private abortController: AbortController | null = null;
  private listeners: Set<(isSyncing: boolean) => void> = new Set();
  public localMutationHandler: (() => void) | null = null;
  private consecutiveErrors = 0; // Track consecutive errors for global backoff // FIX: Public for cleanup
  private stats = { pending: 0, failed: 0, conflicts: 0 }; // Real-time sync metrics
  private activeResolutions = new Set<string>(); // IDs of records currently being resolved

  /**
   * Process sync queue in FIFO order
   */
  async processQueue(): Promise<void> {
    if (this.isProcessing) {
      dedupLog('[SyncCoordinator]', 'Already processing, skipping');
      return;
    }

    // Storage Guardian check before sync
    const storageStatus = await checkStorageQuota();
    if (storageStatus.status === 'critical') {
      console.debug('[QualityGate-F3] Storage status critical: Sync policy adjusted (ledger only)');
      window.dispatchEvent(new CustomEvent('ui:notify:storage_low', { detail: storageStatus }));
    } else if (storageStatus.status === 'warning') {
      console.debug('[QualityGate-F3] Storage status warning: Sync policy adjusted (proceed with caution)');
      window.dispatchEvent(new CustomEvent('ui:notify:storage_low', { detail: storageStatus }));
    }

    // Global backoff if we had consecutive errors
    if (this.consecutiveErrors > 0) {
      const backoffMs = Math.min(BASE_BACKOFF_MS * Math.pow(2, this.consecutiveErrors - 1), MAX_BACKOFF_MS);
      dedupLog('[SyncCoordinator]', `Waiting ${backoffMs}ms before retry (consecutive errors: ${this.consecutiveErrors})`);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }

    this.isProcessing = true;
    this.isSyncing = true;
    this.abortController = new AbortController();
    this.notifyListeners();

    try {
      dedupLog('[SyncCoordinator]', 'Starting queue processing');

      while (this.isProcessing) {
        // Get next batch of entries (FIFO by timestamp)
        // @ts-ignore
        const entries = await db.sync_queue
          .orderBy('timestamp')
          .limit(SYNC_BATCH_SIZE)
          .toArray();

        // Filter out entries for records with needs_review: true or in activeResolutions
        const filteredEntries = entries.filter((entry: SyncQueueEntry) => {
          const recordId = entry.payload?.id;
          if (!recordId) return true;
          
          // Skip if record is in active resolution
          if (this.activeResolutions.has(recordId)) {
            console.debug('[QualityGate-F1] Skipping record in active resolution:', recordId);
            return false;
          }
          
          // Skip if record has needs_review flag
          const needsReview = entry.payload?.needs_review;
          if (needsReview === true) {
            console.debug('[QualityGate-F1] Skipping record with needs_review:', recordId);
            return false;
          }
          
          return true;
        });

        if (filteredEntries.length === 0) {
          dedupLog('[SyncCoordinator]', 'Queue empty or all entries filtered, stopping');
          this.consecutiveErrors = 0; // Reset error counter on success
          break;
        }

        // Process batch sequentially to preserve order
        for (let i = 0; i < filteredEntries.length; i++) {
          const entry = filteredEntries[i] as SyncQueueEntry;
          try {
            // Mark as processing to prevent collapsing interference
            // @ts-ignore
            await db.sync_queue.update(entry.id, { is_processing: true });
            console.debug('[Sync] Marked entry as processing:', entry.id);

            await this.processEntry(entry);
            
            // Remove successfully processed entry
            // @ts-ignore
            await db.sync_queue.delete(entry.id);
            console.debug('[Sync] Deleted entry from queue:', entry.id);
            dedupLog('[SyncCoordinator]', `Processed entry ${entry.id}`);
            this.consecutiveErrors = 0; // Reset error counter on success
          } catch (error) {
            // Clear is_processing flag on error to allow retry
            // @ts-ignore
            await db.sync_queue.update(entry.id, { is_processing: false });
            console.debug('[Sync] Cleared is_processing flag for entry:', entry.id);
            
            dedupLog('[SyncCoordinator]', `Failed to process entry ${entry.id}:`, error);
            this.consecutiveErrors++; // Increment error counter
            
            const currentRetries = (entry.retry_count || 0) + 1;
            
            // Handle 409 conflict - Server Wins policy with conflict stashing
            if ((error as any).response?.status === 409) {
              console.warn(`[SyncCoordinator] Conflict for entry ${entry.id}, stashing for human resolution`);
              
              const serverData = (error as any).response?.data?.server_data || null;
              const recordId = entry.payload?.id || null;
              
              if (!recordId) {
                console.error(`[SyncCoordinator] No record_id in payload for entry ${entry.id}, cannot stash conflict`);
                throw error;
              }
              
              // Atomic transaction: stash conflict, mark local record, apply server data
              // @ts-ignore
              await db.transaction('rw', ['sync_conflicts', entry.table_name, 'sync_queue'], async () => {
                // 1. Insert into sync_conflicts table
                // @ts-ignore
                await db.sync_conflicts.add({
                  id: `${entry.table_name}_${recordId}_${Date.now()}`,
                  table_name: entry.table_name,
                  record_id: recordId,
                  local_data: entry.payload,
                  server_data: serverData,
                  resolved: false,
                  created_at: new Date().toISOString(),
                });
                
                // 2. Mark local record with needs_review
                // @ts-ignore
                const localRecord = await db.table(entry.table_name).get(recordId);
                if (localRecord) {
                  // @ts-ignore
                  await db.table(entry.table_name).update(recordId, {
                    needs_review: true,
                  });
                  
                  // 3. Apply server data locally (Server Wins for state)
                  if (serverData) {
                    // Use silent update to avoid triggering sync_queue
                    await silentUpdate(entry.table_name, recordId, {
                      ...serverData,
                      needs_review: true, // Keep needs_review flag
                    });
                  }
                }
                
                // 4. Remove from sync_queue (conflict is now stashed)
                // @ts-ignore
                await db.sync_queue.delete(entry.id);
              });
              
              dedupLog('[SyncCoordinator]', `Conflict stashed for ${entry.table_name}:${recordId}`);
              this.consecutiveErrors = 0; // Reset error counter on successful stash
            } else if (currentRetries >= MAX_RETRIES) {
              console.error(`[SyncCoordinator] Max retries exceeded for entry ${entry.id}, moving to sync_conflicts as network_exhausted`);
              const recordId = entry.payload?.id || null;
              
              // Atomic transaction: delete from queue, add to sync_conflicts for manual intervention
              // @ts-ignore
              await db.transaction('rw', ['sync_queue', 'sync_conflicts'], async () => {
                // @ts-ignore
                await db.sync_queue.delete(entry.id);
                
                // Add to sync_conflicts with error_type for manual resolution
                // @ts-ignore
                await db.sync_conflicts.add({
                  id: `${entry.table_name}_${recordId || 'unknown'}_network_${Date.now()}`,
                  table_name: entry.table_name,
                  record_id: recordId,
                  local_data: entry.payload,
                  server_data: null, // No server data available (network error)
                  resolved: false,
                  error_type: 'network_exhausted',
                  error_message: error instanceof Error ? error.message : String(error),
                  created_at: new Date().toISOString(),
                });
              });
            } else {
              // @ts-ignore
              const current = await db.sync_queue.get(entry.id);
              if (current) {
                // @ts-ignore
                await db.sync_queue.put({
                  ...current,
                  retry_count: currentRetries,
                });
              }
            }
          }
        }

        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      dedupLog('[SyncCoordinator]', 'Queue processing failed:', error);
      this.consecutiveErrors++; // Increment error counter for global backoff
      
      // Don't immediately retry - let the exponential backoff handle it on next call
    } finally {
      this.isProcessing = false;
      this.isSyncing = false;
      this.abortController = null;
      this.notifyListeners();
      
      // FASE 3: Start SnapshotWorker after sync completes (async background processing)
      snapshotWorker.start().catch(err => {
        console.error('[SyncCoordinator] Error starting SnapshotWorker:', err);
      });
      
      // Reconcile stale snapshots after sync completes
      // Async operation to avoid blocking
      snapshotService.reconcileStaleSnapshots().catch(err => {
        dedupLog('[SyncCoordinator]', 'Error reconciling snapshots:', err);
      });
    }
  }

  /**
   * Process single queue entry with exponential backoff
   * FASE 2: Resilient handshake with version/hash verification
   */
  private async processEntry(entry: SyncQueueEntry): Promise<void> {
    // Debug flag: artificially stall sync for testing
    if ((window as any).__DEBUG_STALL_SYNC__) {
      console.warn('[SyncCoordinator] DEBUG_STALL_SYNC enabled - artificially failing sync');
      throw new Error('network_error (DEBUG)');
    }

    const payload = {
      table_name: entry.table_name,
      action: entry.action,
      payload: entry.payload,
      timestamp: entry.timestamp,
    };

    let attempt = 0;
    let backoffMs = BASE_BACKOFF_MS;

    while (attempt <= MAX_RETRIES) {
      try {
        const response = await syncAPI.syncChanges(payload);
        
        if (response.status !== 200) {
          throw new Error(`Server returned ${response.status}`);
        }

        // FASE 2: Handshake verification - check if server processed this record
        const processed = response.data?.processed || [];
        const recordId = entry.payload?.id;
        const localHash = entry.payload?.hash;
        const localVersion = entry.payload?.version;
        
        if (recordId) {
          const processedRecord = processed.find((p: any) => p.id === recordId);
          
          if (processedRecord) {
            // Server accepted this record - verify hash matches
            const serverHash = processedRecord.hash;
            if (serverHash && serverHash !== localHash) {
              console.error('[FASE-2] Handshake hash mismatch for', recordId, ': local', localHash, 'vs server', serverHash);
              
              // Mark record for review
              // @ts-ignore
              await db.transaction('rw', [entry.table_name], async () => {
                // @ts-ignore
                await db.table(entry.table_name).update(recordId, {
                  needs_review: true,
                });
              });
              
              throw new Error(`Handshake hash mismatch: local ${localHash} vs server ${serverHash}`);
            }
            
            console.debug('[FASE-2] Handshake verified for', recordId, 'v', localVersion);
            return; // Success - queue entry will be removed by caller
          } else {
            // Server did not process this record - likely rejected due to stale version
            console.warn('[FASE-2] Server rejected record', recordId, '- likely stale version, purging from queue');
            
            // Download server version and apply it locally
            // For now, just remove from queue - server version will be in outgoing changes
            // @ts-ignore
            await db.sync_queue.delete(entry.id);
            
            // Trigger sync again to download server version
            return; // Entry removed, will be retried with server data
          }
        }
        
        return; // Success
      } catch (error) {
        attempt++;
        
        if (attempt > MAX_RETRIES) {
          throw error; // Re-throw to trigger retry logic
        }

        // Exponential backoff
        dedupLog('[SyncCoordinator]', `Attempt ${attempt} failed for entry ${entry.id}, retrying in ${backoffMs}ms`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS); // Double, cap at max
      }
    }
  }

  /**
   * Stop processing queue
   */
  stop(): void {
    this.isProcessing = false;
    this.isSyncing = false;
    if (this.abortController) {
      this.abortController.abort();
    }
    this.notifyListeners();
  }

  /**
   * Subscribe to sync state changes
   */
  subscribe(listener: (isSyncing: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.isSyncing));
  }

  /**
   * Check if currently syncing
   */
  getIsSyncing(): boolean {
    return this.isSyncing;
  }

  /**
   * Get queue status
   */
  async getQueueStatus(): Promise<{ pending: number; failed: number }> {
    // @ts-ignore
    const all = await db.sync_queue.toArray() as SyncQueueEntry[];
    const pending = all.filter(e => !e.retry_count || e.retry_count === 0).length;
    const failed = all.filter(e => e.retry_count && e.retry_count > 0).length;
    return { pending, failed };
  }

  /**
   * Get comprehensive sync status including conflicts
   */
  async getSyncStatus(): Promise<{ pending: number; failed: number; conflicts: number }> {
    // @ts-ignore
    const queueAll = await db.sync_queue.toArray() as SyncQueueEntry[];
    const pending = queueAll.filter(e => !e.retry_count || e.retry_count === 0).length;
    const failed = queueAll.filter(e => e.retry_count && e.retry_count > 0).length;
    
    // @ts-ignore
    const conflicts = await db.sync_conflicts.where('resolved').equals(false).count();
    
    this.stats = { pending, failed, conflicts };
    return this.stats;
  }

  /**
   * Mark record as being actively resolved (prevents sync from touching it)
   */
  beginResolution(recordId: string): void {
    this.activeResolutions.add(recordId);
    console.debug('[QualityGate-F1] Resolution started for:', recordId);
  }

  /**
   * Mark resolution complete (allows sync to process record again)
   */
  endResolution(recordId: string): void {
    this.activeResolutions.delete(recordId);
    console.debug('[QualityGate-F1] Resolution ended for:', recordId);
  }

  /**
   * Clear queue (emergency use only)
   */
  async clearQueue(): Promise<void> {
    // @ts-ignore
    await db.sync_queue.clear();
    dedupLog('[SyncCoordinator]', 'Queue cleared');
    this.consecutiveErrors = 0; // Reset error counter on clear
  }

  /**
   * Destroy coordinator and clean up event listeners (prevent memory leaks)
   * FIX: Added cleanup method to remove localMutation listener
   */
  destroy(): void {
    if (this.localMutationHandler) {
      window.removeEventListener('localMutation', this.localMutationHandler);
      this.localMutationHandler = null;
    }
    this.listeners.clear();
    this.consecutiveErrors = 0; // Reset error counter on destroy
    dedupLog('[SyncCoordinator]', 'Destroyed, event listeners cleaned up');
  }
}

// Singleton instance
export const syncCoordinator = new SyncCoordinator();

// Auto-start on network reconnection
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    dedupLog('[SyncCoordinator]', 'Network online, starting queue processing');
    syncCoordinator.processQueue();
  });

  // Also trigger sync on local mutations (debounced)
  let syncTimeout: number;
  // FIX: Named handler for proper cleanup (prevent memory leak)
  syncCoordinator.localMutationHandler = () => {
    clearTimeout(syncTimeout);
    syncTimeout = window.setTimeout(() => {
      if (navigator.onLine) {
        dedupLog('[SyncCoordinator]', 'Local mutation detected, starting sync');
        syncCoordinator.processQueue();
      }
      
      // Reconcile stale snapshots after local mutation
      snapshotService.reconcileStaleSnapshots().catch(err => {
        dedupLog('[SyncCoordinator]', 'Error reconciling snapshots:', err);
      });
    }, 2000); // 2 second debounce
  };
  
  window.addEventListener('localMutation', syncCoordinator.localMutationHandler);

  // Start on load if online
  if (navigator.onLine) {
    syncCoordinator.processQueue();
  }
}
