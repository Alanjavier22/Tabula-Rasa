/**
 * Persistence Manager Service
 * Requests persistent storage from browser to prevent IndexedDB eviction
 * Logs persistence status to config for HealthIndicator display
 */

import { db } from '../db/db';

export interface PersistenceStatus {
  isPersistent: boolean;
  isSupported: boolean;
  message: string;
}

export class PersistenceManager {
  private status: PersistenceStatus = {
    isPersistent: false,
    isSupported: false,
    message: '',
  };

  /**
   * Request persistent storage on app startup
   * Logs status to config table for HealthIndicator
   */
  async requestPersistentStorage(): Promise<PersistenceStatus> {
    try {
      // Check if storage API is supported
      if (!('storage' in navigator) || !('persist' in navigator.storage)) {
        this.status = {
          isPersistent: false,
          isSupported: false,
          message: 'Storage persistence not supported by browser',
        };
        await this.logPersistenceStatus(false, false);
        return this.status;
      }

      // Request persistent storage
      const isPersistent = await navigator.storage.persist();

      this.status = {
        isPersistent,
        isSupported: true,
        message: isPersistent 
          ? 'Storage persistence granted' 
          : 'Best Effort (Risk of eviction)',
      };

      await this.logPersistenceStatus(isPersistent, true);

      if (!isPersistent) {
        console.warn('[PersistenceManager] Storage persistence denied - Best Effort mode');
      }

      return this.status;
    } catch (error) {
      console.error('[PersistenceManager] Error requesting persistence:', error);
      this.status = {
        isPersistent: false,
        isSupported: false,
        message: 'Error requesting persistence',
      };
      await this.logPersistenceStatus(false, false);
      return this.status;
    }
  }

  /**
   * Log persistence status to config table
   */
  private async logPersistenceStatus(isPersistent: boolean, isSupported: boolean): Promise<void> {
    try {
      // @ts-ignore
      await db.config.put({
        id: 'storage_persistent',
        key: 'storage_persistent',
        value: isPersistent.toString(),
        is_deleted: false,
        updated_at: new Date().toISOString(),
      });

      // @ts-ignore
      await db.config.put({
        id: 'storage_persistent_supported',
        key: 'storage_persistent_supported',
        value: isSupported.toString(),
        is_deleted: false,
        updated_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[PersistenceManager] Error logging persistence status:', error);
    }
  }

  /**
   * Get current persistence status
   */
  getStatus(): PersistenceStatus {
    return this.status;
  }

  /**
   * Check if storage is persistent
   */
  isPersistent(): boolean {
    return this.status.isPersistent;
  }
}

export const persistenceManager = new PersistenceManager();
