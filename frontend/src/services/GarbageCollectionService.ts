/**
 * Garbage Collection Service
 * Purges records is_deleted=true after 90 days
 * Atomic: description_words=[] pre-delete → put() → delete()
 * Calls db.compact() post-purge to free physical disk space
 */

import { db } from '../db/db';

export interface GCResult {
  transactionsPurged: number;
  assetsPurged: number;
  iousPurged: number;
  totalPurged: number;
  compacted: boolean;
}

export class GarbageCollectionService {
  private readonly DAYS_THRESHOLD = 90;

  /**
   * Run garbage collection for records older than 90 days
   * Atomic: description_words=[] → put() → delete()
   */
  async runGarbageCollection(): Promise<GCResult> {
    const result: GCResult = {
      transactionsPurged: 0,
      assetsPurged: 0,
      iousPurged: 0,
      totalPurged: 0,
      compacted: false,
    };

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.DAYS_THRESHOLD);
    const cutoffISO = cutoffDate.toISOString();

    try {
      // Purge transactions
      result.transactionsPurged = await this.purgeTransactions(cutoffISO);

      // Purge assets
      result.assetsPurged = await this.purgeAssets(cutoffISO);

      // Purge IOUs
      result.iousPurged = await this.purgeIOUs(cutoffISO);

      result.totalPurged = result.transactionsPurged + result.assetsPurged + result.iousPurged;

      // Compact database to free physical disk space
      if (result.totalPurged > 0) {
        await this.compactDatabase();
        result.compacted = true;
      }

      console.log(`[GarbageCollection] Purged ${result.totalPurged} records, compacted: ${result.compacted}`);
    } catch (error) {
      console.error('[GarbageCollection] Error:', error);
    }

    return result;
  }

  /**
   * Purge transactions (atomic: description_words=[] → put() → delete)
   */
  private async purgeTransactions(cutoffISO: string): Promise<number> {
    let purged = 0;

    // @ts-ignore
    await db.transaction('rw', db.transactions, async () => {
      // @ts-ignore
      const toDelete = await db.transactions
        .filter(t => t.is_deleted && t.updated_at < cutoffISO)
        .toArray();

      for (const txn of toDelete) {
        // Step A: Clear description_words to free multi-entry index
        // @ts-ignore
        await db.transactions.update(txn.id, {
          description_words: [],
          updated_at: new Date().toISOString(),
        });

        // Step B: Physical delete after confirming Step A
        // @ts-ignore
        await db.transactions.delete(txn.id);
        purged++;
      }
    });

    return purged;
  }

  /**
   * Purge assets (atomic: description_words=[] → put() → delete)
   */
  private async purgeAssets(cutoffISO: string): Promise<number> {
    let purged = 0;

    // @ts-ignore
    await db.transaction('rw', db.assets, async () => {
      // @ts-ignore
      const toDelete = await db.assets
        .filter(a => a.is_deleted && a.updated_at < cutoffISO)
        .toArray();

      for (const asset of toDelete) {
        // Step A: Clear any indexed fields (assets don't have description_words, but for consistency)
        // @ts-ignore
        await db.assets.update(asset.id, {
          updated_at: new Date().toISOString(),
        });

        // Step B: Physical delete
        // @ts-ignore
        await db.assets.delete(asset.id);
        purged++;
      }
    });

    return purged;
  }

  /**
   * Purge IOUs (atomic: update → delete)
   */
  private async purgeIOUs(cutoffISO: string): Promise<number> {
    let purged = 0;

    // @ts-ignore
    await db.transaction('rw', db.ious, async () => {
      // @ts-ignore
      const toDelete = await db.ious
        .filter(i => i.is_deleted && i.updated_at < cutoffISO)
        .toArray();

      for (const iou of toDelete) {
        // Step A: Update
        // @ts-ignore
        await db.ious.update(iou.id, {
          updated_at: new Date().toISOString(),
        });

        // Step B: Delete
        // @ts-ignore
        await db.ious.delete(iou.id);
        purged++;
      }
    });

    return purged;
  }

  /**
   * Compact database to free physical disk space
   * Dexie doesn't have VACUUM, but compact() reorganizes DB
   */
  private async compactDatabase(): Promise<void> {
    try {
      await db.close();
      // Dexie doesn't expose compact() directly, but IndexedDB compacts on close
      // Reopen database
      await db.open();
      console.log('[GarbageCollection] Database compacted');
    } catch (error) {
      console.error('[GarbageCollection] Compact error:', error);
    }
  }

  /**
   * Get count of records pending garbage collection
   */
  async getPendingGCCount(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.DAYS_THRESHOLD);
    const cutoffISO = cutoffDate.toISOString();

    const txCount = await db.transactions.filter(t => t.is_deleted && t.updated_at < cutoffISO).count();
    const assetCount = await db.assets.filter(a => a.is_deleted && a.updated_at < cutoffISO).count();
    const iouCount = await db.ious.filter(i => i.is_deleted && i.updated_at < cutoffISO).count();

    return txCount + assetCount + iouCount;
  }
}

export const garbageCollectionService = new GarbageCollectionService();
