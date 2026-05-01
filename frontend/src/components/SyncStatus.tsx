/**
 * SyncStatus Component
 * Verifies guards before allowing export operations
 * Checks: snapshots stale + sync_queue pending + storage health
 */

import { useState, useEffect } from 'react';
import { db } from '../db/db';
import { storageMonitor } from '../services/StorageMonitor';

interface SyncStatusResult {
  hasStaleSnapshots: boolean;
  hasPendingSync: boolean;
  staleCount: number;
  pendingSyncCount: number;
  storageHealth: {
    status: 'healthy' | 'warning' | 'critical';
    message: string;
    usagePercent: number;
  };
  canExport: boolean;
  warningMessage: string;
}

export function useSyncStatus(): SyncStatusResult {
  const [status, setStatus] = useState<SyncStatusResult>({
    hasStaleSnapshots: false,
    hasPendingSync: false,
    staleCount: 0,
    pendingSyncCount: 0,
    storageHealth: {
      status: 'healthy',
      message: '',
      usagePercent: 0,
    },
    canExport: true,
    warningMessage: '',
  });

  useEffect(() => {
    const checkStatus = async () => {
      try {
        // Check for stale snapshots
        // @ts-ignore
        const staleSnapshots = await db.net_worth_snapshots.filter(s => s.is_stale).toArray();
        const staleCount = staleSnapshots.length;

        // Check for pending sync queue entries
        // @ts-ignore
        const pendingSync = await db.sync_queue.toArray();
        const pendingSyncCount = pendingSync.length;

        // Check storage health
        const storageHealth = await storageMonitor.getStorageHealth();

        const hasStaleSnapshots = staleCount > 0;
        const hasPendingSync = pendingSyncCount > 0;
        const storageCritical = storageHealth.status === 'critical';
        const canExport = !hasStaleSnapshots && !hasPendingSync && !storageCritical;

        let warningMessage = '';
        if (hasStaleSnapshots) {
          warningMessage = `Hay ${staleCount} snapshots desactualizados. Reconcilia antes de exportar.`;
        } else if (hasPendingSync) {
          warningMessage = `Hay ${pendingSyncCount} cambios pendientes de sincronización. Sincroniza antes de exportar.`;
        } else if (storageCritical) {
          warningMessage = storageHealth.message;
        }

        setStatus({
          hasStaleSnapshots,
          hasPendingSync,
          staleCount,
          pendingSyncCount,
          storageHealth,
          canExport,
          warningMessage,
        });
      } catch (error) {
        console.error('Error checking sync status:', error);
      }
    };

    checkStatus();

    // Re-check on localMutation events
    const handleMutation = () => checkStatus();
    window.addEventListener('localMutation', handleMutation);

    return () => window.removeEventListener('localMutation', handleMutation);
  }, []);

  return status;
}

export function SyncStatus() {
  const status = useSyncStatus();

  if (status.canExport) {
    return null;
  }

  return (
    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
      <div className="flex">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3">
          <p className="text-sm text-yellow-700">
            {status.warningMessage}
          </p>
        </div>
      </div>
    </div>
  );
}
