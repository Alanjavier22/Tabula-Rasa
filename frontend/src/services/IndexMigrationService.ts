/**
 * Index Migration Service
 * Background batch re-index for Unicode NFD normalization
 * Processes chunks of 1,000 records with 1s pause + requestIdleCallback
 */

import { db } from '../db/db';
import { tokenizeDescription } from '../utils/searchUtils';

export interface ReindexProgress {
  total: number;
  processed: number;
  remaining: number;
  percent: number;
  isRunning: boolean;
}

export class IndexMigrationService {
  private isRunning = false;
  private progress: ReindexProgress = {
    total: 0,
    processed: 0,
    remaining: 0,
    percent: 0,
    isRunning: false,
  };

  /**
   * Start background batch re-index
   * Processes transactions with needs_reindex flag
   * Chunks: 1,000 records, 1s pause, requestIdleCallback
   */
  async startReindex(): Promise<void> {
    if (this.isRunning) {
      console.log('[IndexMigration] Re-index already running');
      return;
    }

    this.isRunning = true;
    this.progress.isRunning = true;

    try {
      // Count total records needing re-index
      // @ts-ignore
      const total = await db.transactions.filter(t => t.needs_reindex === true).count();
      this.progress.total = total;
      this.progress.remaining = total;

      console.log(`[IndexMigration] Starting re-index for ${total} records`);

      let processed = 0;
      const CHUNK_SIZE = 1000;
      const PAUSE_MS = 1000;

      while (processed < total) {
        // Check if UI is busy - pause if needed
        await this.waitForIdle();

        // Process chunk
        // @ts-ignore
        await db.transaction('rw', db.transactions, async () => {
          // @ts-ignore
          const chunk = await db.transactions
            .filter(t => t.needs_reindex === true)
            .limit(CHUNK_SIZE)
            .toArray();

          for (const txn of chunk) {
            if (txn.description && typeof txn.description === 'string') {
              // Re-tokenize with NFD normalization
              const newDescriptionWords = tokenizeDescription(txn.description);

              // Update transaction
              // @ts-ignore
              await db.transactions.update(txn.id, {
                description_words: newDescriptionWords,
                needs_reindex: false, // Clear flag
                updated_at: new Date().toISOString(),
              });

              processed++;
              this.progress.processed = processed;
              this.progress.remaining = total - processed;
              this.progress.percent = (processed / total) * 100;
            }
          }
        });

        // Pause between chunks to avoid UI blocking
        if (processed < total) {
          await new Promise(resolve => setTimeout(resolve, PAUSE_MS));
        }

        console.log(`[IndexMigration] Processed ${processed}/${total} (${this.progress.percent.toFixed(1)}%)`);
      }

      console.log('[IndexMigration] Re-index completed');
    } catch (error) {
      console.error('[IndexMigration] Re-index error:', error);
    } finally {
      this.isRunning = false;
      this.progress.isRunning = false;
    }
  }

  /**
   * Wait for idle state using requestIdleCallback
   * Pauses re-index if UI is busy
   */
  private async waitForIdle(): Promise<void> {
    return new Promise(resolve => {
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(() => resolve(), { timeout: 2000 });
      } else {
        // Fallback: check visibility state
        if (document.visibilityState === 'hidden') {
          resolve();
        } else {
          setTimeout(resolve, 100);
        }
      }
    });
  }

  /**
   * Get current re-index progress
   */
  getProgress(): ReindexProgress {
    return this.progress;
  }

  /**
   * Check if re-index is running
   */
  isReindexRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Mark all transactions for re-index
   * Call this after NFD normalization change
   */
  async markAllForReindex(): Promise<number> {
    // @ts-ignore
    const count = await db.transactions.toCollection().modify({ needs_reindex: true });
    console.log(`[IndexMigration] Marked ${count} transactions for re-index`);
    return count;
  }
}

export const indexMigrationService = new IndexMigrationService();
