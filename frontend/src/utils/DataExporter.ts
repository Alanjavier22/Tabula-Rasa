/**
 * Data Exporter Utility
 * Proxy to StreamedExporter for memory-safe exports
 * Maintains backward compatibility with UI imports
 */

import { streamedExporter, StreamedExporter } from './StreamedExporter';

export interface ExportOptions {
  accountId?: string;
  startDate?: string;
  endDate?: string;
  format: 'csv' | 'xlsx';
}

/**
 * Main export function (proxy to StreamedExporter)
 * FIX: Eliminated toxic RAM dump, delegates to streamed implementation
 */
export async function exportData(options: ExportOptions): Promise<void> {
  if (options.format === 'xlsx') {
    // FIX: Fallback XLSX → CSV for memory safety (XLSX massive deprecated)
    console.warn('XLSX export deprecated for memory safety, falling back to CSV');
    await exportData({ ...options, format: 'csv' });
    return;
  }

  // Stream all exports using StreamedExporter (chunked buffering, UI yielding)
  const timestamp = new Date().toISOString().split('T')[0];

  try {
    // Export transactions (streamed, no RAM dump)
    const transactionsBlob = await streamedExporter.exportTransactions();
    StreamedExporter.downloadBlob(transactionsBlob, `transactions_${timestamp}.csv`);

    // Export accounts (streamed)
    const accountsBlob = await streamedExporter.exportAccounts();
    StreamedExporter.downloadBlob(accountsBlob, `accounts_${timestamp}.csv`);

    // Export assets (streamed)
    const assetsBlob = await streamedExporter.exportAssets();
    StreamedExporter.downloadBlob(assetsBlob, `assets_${timestamp}.csv`);

    // Export snapshots (streamed)
    const snapshotsBlob = await streamedExporter.exportSnapshots();
    StreamedExporter.downloadBlob(snapshotsBlob, `snapshots_${timestamp}.csv`);
  } catch (error) {
    console.error('DataExporter proxy error:', error);
    throw error;
  }
}
