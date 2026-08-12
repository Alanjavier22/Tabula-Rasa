/**
 * Scheduled Backup Service
 * Auto-backup trigger: 7 days since last backup OR 70% storage threshold
 * No Blob in memory - generates on-demand when user clicks "Download"
 */

import { db } from '../db/db';
import { storageMonitor } from './StorageMonitor';
import { streamedExporter, StreamedExporter } from '../utils/StreamedExporter';

export interface BackupStatus {
  backupAvailable: boolean;
  lastBackupDate: string | null;
  daysSinceLastBackup: number;
  triggerReason: 'days' | 'storage' | 'manual' | null;
}

export class ScheduledBackupService {
  private readonly DAYS_THRESHOLD = 7;
  private status: BackupStatus = {
    backupAvailable: false,
    lastBackupDate: null,
    daysSinceLastBackup: 0,
    triggerReason: null,
  };

  /**
   * Check if auto-backup is needed
   * Triggers: 7 days since last backup OR 70% storage
   */
  async checkAutoBackupNeeded(): Promise<BackupStatus> {
    // Get last backup date from config
    const lastBackupConfig = await db.config.get('last_auto_backup_date');
    const lastBackupDate = lastBackupConfig?.value || null;

    // Calculate days since last backup
    let daysSinceLastBackup = 0;
    if (lastBackupDate) {
      const lastBackup = new Date(lastBackupDate);
      const now = new Date();
      const diffMs = now.getTime() - lastBackup.getTime();
      daysSinceLastBackup = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    }

    // Check storage health
    const storageHealth = await storageMonitor.getStorageHealth();
    const storageTrigger = storageHealth.usagePercent >= 70;

    // Determine if backup needed
    const daysTrigger = lastBackupDate && daysSinceLastBackup >= this.DAYS_THRESHOLD;
    const backupAvailable = daysTrigger || storageTrigger || !lastBackupDate;

    const triggerReason: 'days' | 'storage' | 'manual' | null = 
      daysTrigger ? 'days' : 
      storageTrigger ? 'storage' : 
      !lastBackupDate ? 'manual' : null;

    this.status = {
      backupAvailable,
      lastBackupDate,
      daysSinceLastBackup,
      triggerReason,
    };

    // Mark backup available in config
    if (backupAvailable) {
      await this.markBackupAvailable(triggerReason);
    }

    return this.status;
  }

  /**
   * Mark backup available in config
   */
  private async markBackupAvailable(reason: 'days' | 'storage' | 'manual' | null): Promise<void> {
    try {
      await db.config.put({
        id: 'backup_available',
        key: 'backup_available',
        value: 'true',
        is_deleted: false,
        updated_at: new Date().toISOString(),
      });

      if (reason) {
        await db.config.put({
          id: 'backup_trigger_reason',
          key: 'backup_trigger_reason',
          value: reason,
          is_deleted: false,
          updated_at: new Date().toISOString(),
        });
      }

      // Dispatch event for UI notification
      window.dispatchEvent(new CustomEvent('backupAvailable', { detail: { reason } }));
    } catch (error) {
      console.error('[ScheduledBackup] Error marking backup available:', error);
    }
  }

  /**
   * Generate backup on-demand (no Blob in memory)
   * Called when user clicks "Download"
   */
  async generateBackup(): Promise<void> {
    try {
      // Generate all exports on-demand
      const transactionsBlob = await streamedExporter.exportTransactions();
      const accountsBlob = await streamedExporter.exportAccounts();
      const assetsBlob = await streamedExporter.exportAssets();
      const snapshotsBlob = await streamedExporter.exportSnapshots();

      // Download each file
      const timestamp = new Date().toISOString().split('T')[0];
      StreamedExporter.downloadBlob(transactionsBlob, `backup_transactions_${timestamp}.csv`);
      StreamedExporter.downloadBlob(accountsBlob, `backup_accounts_${timestamp}.csv`);
      StreamedExporter.downloadBlob(assetsBlob, `backup_assets_${timestamp}.csv`);
      StreamedExporter.downloadBlob(snapshotsBlob, `backup_snapshots_${timestamp}.csv`);

      // Update last backup date
      await this.updateLastBackupDate();

      // Clear backup available flag
      await this.clearBackupAvailable();

      console.log('[ScheduledBackup] Backup completed successfully');
    } catch (error) {
      console.error('[ScheduledBackup] Error generating backup:', error);
      throw error;
    }
  }

  /**
   * Update last backup date in config
   */
  private async updateLastBackupDate(): Promise<void> {
    try {
      const now = new Date().toISOString();
      await db.config.put({
        id: 'last_auto_backup_date',
        key: 'last_auto_backup_date',
        value: now,
        is_deleted: false,
        updated_at: now,
      });

      // Log backup completion
      console.log(`[ScheduledBackup] Backup completed at ${now}`);
    } catch (error) {
      console.error('[ScheduledBackup] Error updating last backup date:', error);
    }
  }

  /**
   * Clear backup available flag
   */
  private async clearBackupAvailable(): Promise<void> {
    try {
      await db.config.put({
        id: 'backup_available',
        key: 'backup_available',
        value: 'false',
        is_deleted: false,
        updated_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[ScheduledBackup] Error clearing backup available:', error);
    }
  }

  /**
   * Get current backup status
   */
  getStatus(): BackupStatus {
    return this.status;
  }

  /**
   * Get days since last backup
   */
  async getDaysSinceLastBackup(): Promise<number> {
    const lastBackupConfig = await db.config.get('last_auto_backup_date');
    const lastBackupDate = lastBackupConfig?.value || null;

    if (!lastBackupDate) return 999; // Never backed up

    const lastBackup = new Date(lastBackupDate);
    const now = new Date();
    const diffMs = now.getTime() - lastBackup.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }
}

export const scheduledBackupService = new ScheduledBackupService();
