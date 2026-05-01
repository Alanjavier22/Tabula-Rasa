/**
 * Storage Monitor Service
 * Monitors IndexedDB storage usage using navigator.storage.estimate()
 * Thresholds: 70% warning, 90% critical or <50MB free
 */

export interface StorageHealth {
  usageMB: number;
  quotaMB: number;
  freeMB: number;
  usagePercent: number;
  status: 'healthy' | 'warning' | 'critical';
  message: string;
}

export class StorageMonitor {
  private cachedHealth: StorageHealth | null = null;
  private lastCheck: Date | null = null;

  /**
   * Get storage health using navigator.storage.estimate()
   */
  async getStorageHealth(): Promise<StorageHealth> {
    if (!('storage' in navigator) || !('estimate' in navigator.storage)) {
      // Browser doesn't support storage estimation
      return {
        usageMB: 0,
        quotaMB: 0,
        freeMB: 0,
        usagePercent: 0,
        status: 'healthy',
        message: 'Storage monitoring not supported by browser',
      };
    }

    try {
      const estimate = await navigator.storage.estimate();
      const usageBytes = estimate.usage || 0;
      const quotaBytes = estimate.quota || 0;
      
      const usageMB = usageBytes / (1024 * 1024);
      const quotaMB = quotaBytes / (1024 * 1024);
      const freeMB = quotaMB - usageMB;
      const usagePercent = quotaBytes > 0 ? (usageBytes / quotaBytes) * 100 : 0;

      // Determine status based on thresholds
      let status: 'healthy' | 'warning' | 'critical' = 'healthy';
      let message = 'Storage usage within normal limits';

      // Critical: 90%+ usage OR <50MB free
      if (usagePercent >= 90 || freeMB < 50) {
        status = 'critical';
        message = usagePercent >= 90 
          ? `Almacenamiento crítico (${usagePercent.toFixed(1)}% usado). Exporta datos + limpia registros antiguos.`
          : `Almacenamiento crítico (${freeMB.toFixed(1)}MB libre). Exporta datos + limpia registros antiguos.`;
      }
      // Warning: 70%+ usage
      else if (usagePercent >= 70) {
        status = 'warning';
        message = `Almacenamiento alto (${usagePercent.toFixed(1)}% usado). Considera limpiar registros antiguos.`;
      }

      const health: StorageHealth = {
        usageMB,
        quotaMB,
        freeMB,
        usagePercent,
        status,
        message,
      };

      this.cachedHealth = health;
      this.lastCheck = new Date();

      return health;
    } catch (error) {
      console.error('Error checking storage health:', error);
      return {
        usageMB: 0,
        quotaMB: 0,
        freeMB: 0,
        usagePercent: 0,
        status: 'warning',
        message: 'Error checking storage health',
      };
    }
  }

  /**
   * Get cached storage health (non-blocking)
   */
  getCachedHealth(): StorageHealth | null {
    return this.cachedHealth;
  }

  /**
   * Check if storage health needs to be re-checked (not run in last 5 minutes)
   */
  needsCheck(): boolean {
    if (!this.lastCheck) return true;
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return this.lastCheck < fiveMinutesAgo;
  }

  /**
   * Schedule background storage check (non-blocking)
   */
  scheduleBackgroundCheck(): void {
    setTimeout(async () => {
      if (this.needsCheck()) {
        await this.getStorageHealth();
      }
    }, 1000); // 1 second delay after app load
  }
}

export const storageMonitor = new StorageMonitor();
