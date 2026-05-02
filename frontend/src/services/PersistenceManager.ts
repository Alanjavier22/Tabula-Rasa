/**
 * Persistence Manager Service - DEPRECATED: Thin Client Architecture
 * 
 * Previously requested persistent storage and logged to IndexedDB.
 * In Thin Client architecture, frontend does not use IndexedDB for data persistence.
 * All data is fetched from backend API on demand.
 * 
 * Kept for reference only - DO NOT USE in production.
 */

export interface PersistenceStatus {
  isPersistent: boolean;
  isSupported: boolean;
  message: string;
}

export class PersistenceManager {
  private status: PersistenceStatus = {
    isPersistent: false,
    isSupported: false,
    message: 'Deprecated - Thin Client does not use IndexedDB',
  };

  /**
   * DEPRECATED: Thin Client does not require persistent storage
   */
  async requestPersistentStorage(): Promise<PersistenceStatus> {
    console.warn('[PersistenceManager] DEPRECATED - Thin Client architecture does not use IndexedDB');
    return this.status;
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
    return false; // Thin Client: always false
  }
}

export const persistenceManager = new PersistenceManager();
