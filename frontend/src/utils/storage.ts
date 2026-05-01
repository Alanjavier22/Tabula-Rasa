/**
 * Storage Guardian - Quota monitoring and management
 * Monitors IndexedDB storage usage and alerts when approaching limits
 */

const STORAGE_WARNING_THRESHOLD = 0.8; // 80% usage triggers warning
const STORAGE_CRITICAL_THRESHOLD = 0.95; // 95% usage triggers critical alert

interface StorageEstimate {
  quota: number;
  usage: number;
}

interface StorageStatus {
  usage: number;
  quota: number;
  usagePercent: number;
  status: 'healthy' | 'warning' | 'critical';
}

/**
 * Check storage quota using navigator.storage.estimate()
 * Returns storage status with health indicator
 */
export async function checkStorageQuota(): Promise<StorageStatus> {
  try {
    if (!navigator.storage || !navigator.storage.estimate) {
      console.warn('[Storage] navigator.storage.estimate() not supported');
      return { usage: 0, quota: 0, usagePercent: 0, status: 'healthy' };
    }

    const estimate = await navigator.storage.estimate() as StorageEstimate;
    const usagePercent = estimate.quota > 0 ? estimate.usage / estimate.quota : 0;

    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    
    if (usagePercent >= STORAGE_CRITICAL_THRESHOLD) {
      status = 'critical';
      console.error(`[Storage] CRITICAL: Storage usage at ${(usagePercent * 100).toFixed(1)}% (${formatBytes(estimate.usage)} / ${formatBytes(estimate.quota)})`);
    } else if (usagePercent >= STORAGE_WARNING_THRESHOLD) {
      status = 'warning';
      console.warn(`[Storage] WARNING: Storage usage at ${(usagePercent * 100).toFixed(1)}% (${formatBytes(estimate.usage)} / ${formatBytes(estimate.quota)})`);
    }

    return {
      usage: estimate.usage,
      quota: estimate.quota,
      usagePercent,
      status,
    };
  } catch (error) {
    console.error('[Storage] Failed to estimate storage:', error);
    return { usage: 0, quota: 0, usagePercent: 0, status: 'healthy' };
  }
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Log internal storage health check
 * Call this periodically (e.g., on app load, after large imports)
 */
export async function logStorageHealth(): Promise<void> {
  const status = await checkStorageQuota();
  if (status.status !== 'healthy') {
    // Dispatch custom event for UI to capture
    window.dispatchEvent(new CustomEvent('storageWarning', { 
      detail: status 
    }));
  }
}
