/**
 * Streamed Exporter - Memory-efficient CSV export for 50k+ records
 * Uses streaming with .each() instead of .toArray() to avoid memory crash
 * Optimizations: direct Blob construction, proper CSV escaping, UI yield
 */

import { db } from '../db/db';

export class StreamedExporter {
  private readonly BUFFER_SIZE = 500;
  private readonly HEADER = 'id,date,description,amount,transaction_type,category_id,account_id,hash\n';

  /**
   * Export transactions to CSV with streaming
   * Memory-efficient: chunks → Blob directly (no .join())
   */
  async exportTransactions(): Promise<Blob> {
    const chunks: string[] = [];
    let buffer = this.HEADER;
    let rowCount = 0;

    // Streaming with .each() (not .toArray() - prevents memory crash)
    await db.transactions.orderBy('date').each((txn) => {
      // Escape CSV: only double quotes need doubling (standard CSV)
      const escapedDesc = this.escapeCSV(txn.description || '');
      const escapedType = this.escapeCSV(txn.transaction_type || '');
      const escapedCategory = this.escapeCSV(txn.category_id || '');
      const escapedAccount = this.escapeCSV(txn.account_id || '');

      // CSV row
      buffer += `${txn.id},${txn.date},"${escapedDesc}",${txn.amount},"${escapedType}","${escapedCategory}","${escapedAccount}",${txn.hash || ''}\n`;
      rowCount++;

      // Flush buffer every BUFFER_SIZE rows to prevent memory buildup
      if (rowCount % this.BUFFER_SIZE === 0) {
        chunks.push(buffer);
        buffer = '';
        
        console.debug('[QualityGate-F1] StreamedExporter flushed chunk, rowCount:', rowCount);

        // Yield UI (setTimeout 0ms) - prevents blocking main thread
        return new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    });

    // Flush final buffer
    if (buffer) {
      chunks.push(buffer);
    }

    // Direct Blob construction (no .join() - avoids RAM duplication)
    return new Blob(chunks, { type: 'text/csv;charset=utf-8;' });
  }

  /**
   * Export accounts to CSV with streaming
   */
  async exportAccounts(): Promise<Blob> {
    const chunks: string[] = [];
    let buffer = 'id,name,balance,currency,linked_account_id\n';
    let rowCount = 0;

    await db.accounts.orderBy('name').each((account) => {
      const escapedName = this.escapeCSV(account.name || '');
      const escapedCurrency = this.escapeCSV(account.currency || '');
      const escapedLinked = this.escapeCSV(account.linked_account_id || '');

      buffer += `${account.id},"${escapedName}",${account.balance},"${escapedCurrency}","${escapedLinked}"\n`;
      rowCount++;

      if (rowCount % this.BUFFER_SIZE === 0) {
        chunks.push(buffer);
        buffer = '';
        return new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    });

    if (buffer) chunks.push(buffer);
    return new Blob(chunks, { type: 'text/csv;charset=utf-8;' });
  }

  /**
   * Export assets to CSV with streaming
   */
  async exportAssets(): Promise<Blob> {
    const chunks: string[] = [];
    let buffer = 'id,name,purchase_price_cents,purchase_date,estimated_life_months,residual_value_cents\n';
    let rowCount = 0;

    await db.assets.orderBy('name').each((asset) => {
      const escapedName = this.escapeCSV(asset.name || '');

      buffer += `${asset.id},"${escapedName}",${asset.purchase_price_cents},${asset.purchase_date},${asset.estimated_life_months},${asset.residual_value_cents}\n`;
      rowCount++;

      if (rowCount % this.BUFFER_SIZE === 0) {
        chunks.push(buffer);
        buffer = '';
        return new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    });

    if (buffer) chunks.push(buffer);
    return new Blob(chunks, { type: 'text/csv;charset=utf-8;' });
  }

  /**
   * Export net worth snapshots to CSV with streaming
   */
  async exportSnapshots(): Promise<Blob> {
    const chunks: string[] = [];
    let buffer = 'id,date,month,year,total_assets_cents,total_liabilities_cents,net_worth_cents,income_cents,expense_cents,is_stale\n';
    let rowCount = 0;

    await db.net_worth_snapshots.orderBy('date').each((snapshot) => {
      buffer += `${snapshot.id},${snapshot.date},${snapshot.month},${snapshot.year},${snapshot.total_assets_cents},${snapshot.total_liabilities_cents},${snapshot.net_worth_cents},${snapshot.income_cents},${snapshot.expense_cents},${snapshot.is_stale}\n`;
      rowCount++;

      if (rowCount % this.BUFFER_SIZE === 0) {
        chunks.push(buffer);
        buffer = '';
        return new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    });

    if (buffer) chunks.push(buffer);
    return new Blob(chunks, { type: 'text/csv;charset=utf-8;' });
  }

  /**
   * Standard CSV escape: only double quotes need doubling
   * Fields with quotes or commas are wrapped in double quotes
   */
  private escapeCSV(value: string): string {
    if (!value) return '';
    // Double any existing double quotes
    const escaped = value.replace(/"/g, '""');
    // If contains comma, quote, or newline, wrap in quotes
    if (escaped.includes(',') || escaped.includes('"') || escaped.includes('\n') || escaped.includes('\r')) {
      return `"${escaped}"`;
    }
    return escaped;
  }

  /**
   * Download blob as file
   */
  static downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }
}

export const streamedExporter = new StreamedExporter();
