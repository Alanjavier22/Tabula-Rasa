/**
 * Maintenance Service - Garbage Collection and Database Health
 * Handles cleanup of old logs and database optimization
 */

import { db } from '../db/db';

export class MaintenanceService {
  /**
   * Purge old INFO-level audit logs
   * Deletes sync_errors records with INFO level and >30 days old
   * Atomic transaction for fast execution
   */
  async purgeOldAuditLogs(): Promise<number> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoffDate = thirtyDaysAgo.toISOString();

    let deletedCount = 0;

    // @ts-ignore
    await db.transaction('rw', ['sync_errors'], async () => {
      // @ts-ignore
      const oldLogs = await db.sync_errors
        .filter(log => {
          // Only delete INFO logs older than 30 days
          // Never delete ERROR or CRITICAL logs
          const isInfo = log.error_message?.toLowerCase().startsWith('info:');
          const isOld = log.failed_at < cutoffDate;
          return isInfo && isOld;
        })
        .toArray();

      if (oldLogs.length > 0) {
        // @ts-ignore
        const keysToDelete = oldLogs.map(log => log.id);
        // @ts-ignore
        await db.sync_errors.bulkDelete(keysToDelete);
        deletedCount = keysToDelete.length;
      }
    });

    console.log(`[MaintenanceService] Purged ${deletedCount} old INFO audit logs`);
    return deletedCount;
  }

  /**
   * Purge deleted records older than 90 days
   * Permanently deletes records with is_deleted: true and updated_at > 90 days
   * Atomic transaction to avoid orphans
   */
  async purgeDeletedRecords(): Promise<number> {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const cutoffDate = ninetyDaysAgo.toISOString();

    let deletedCount = 0;

    // @ts-ignore
    await db.transaction('rw', ['transactions', 'fuel_logs', 'ious'], async () => {
      // Purge deleted transactions
      // @ts-ignore
      const deletedTransactions = await db.transactions
        .filter(t => t.is_deleted && t.updated_at < cutoffDate)
        .toArray();

      if (deletedTransactions.length > 0) {
        // @ts-ignore
        const keysToDelete = deletedTransactions.map(t => t.id);
        // @ts-ignore
        await db.transactions.bulkDelete(keysToDelete);
        deletedCount += keysToDelete.length;
      }

      // Purge deleted fuel logs
      // @ts-ignore
      const deletedFuelLogs = await db.fuel_logs
        .filter(f => f.is_deleted && f.updated_at < cutoffDate)
        .toArray();

      if (deletedFuelLogs.length > 0) {
        // @ts-ignore
        const keysToDelete = deletedFuelLogs.map(f => f.id);
        // @ts-ignore
        await db.fuel_logs.bulkDelete(keysToDelete);
        deletedCount += keysToDelete.length;
      }

      // Purge deleted IOUs
      // @ts-ignore
      const deletedIOUs = await db.ious
        .filter(i => i.is_deleted && i.updated_at < cutoffDate)
        .toArray();

      if (deletedIOUs.length > 0) {
        // @ts-ignore
        const keysToDelete = deletedIOUs.map(i => i.id);
        // @ts-ignore
        await db.ious.bulkDelete(keysToDelete);
        deletedCount += keysToDelete.length;
      }
    });

    console.log(`[MaintenanceService] Purged ${deletedCount} deleted records (>90 days)`);
    return deletedCount;
  }

  /**
   * Run all maintenance tasks
   * Should be called on app startup post-login
   */
  async runMaintenance(): Promise<void> {
    try {
      await this.purgeOldAuditLogs();
      await this.purgeDeletedRecords();
    } catch (error) {
      console.error('[MaintenanceService] Error running maintenance:', error);
    }
  }
}

export const maintenanceService = new MaintenanceService();
