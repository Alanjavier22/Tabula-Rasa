/**
 * Streamed Exporter - Memory-efficient CSV export for 50k+ records
 * Uses streaming with .each() instead of .toArray() to avoid memory crash
 * Optimizations: direct Blob construction, proper CSV escaping, UI yield
 */

import { db } from '../db/db';
import Decimal from 'decimal.js-light';
import { toDecimal, toCents, formatMoney } from './money';
import type { Cents } from '../types';

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

  /**
   * FASE 4: Export SRI Annex (Anexo de Gastos Personales)
   * Generates CSV with RUC, establishment name, expense type, base, IVA
   * Uses chunking for 50k+ records without browser crash
   */
  async exportSRIAnnex(
    year: number,
    progressCallback?: (processed: number, total: number) => void
  ): Promise<Blob> {
    const HEADER = 'RUC Emisor,Nombre Establecimiento,Tipo de Gasto,Base Imponible,Valor IVA\n';
    const chunks: string[] = [];
    let buffer = HEADER;
    let rowCount = 0;

    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    // Get all expense transactions for the year
    await db.transactions
      .where('date')
      .between(startDate, endDate, true, true)
      .and(txn => txn.transaction_type === 'expense' && !txn.is_deleted)
      .each(async (txn) => {
        // Extract establishment data
        let ruc = '';
        let name = 'Desconocido';
        
        if (txn.metadata_json) {
          try {
            const metadata = JSON.parse(txn.metadata_json);
            ruc = metadata.ruc || metadata.emisor_ruc || metadata.ruc_emisor || '';
            name = metadata.establecimiento || metadata.nombre_comercial || metadata.merchant || name;
          } catch {
            name = txn.description || 'Desconocido';
          }
        } else {
          name = txn.description || 'Desconocido';
        }

        // Get category for expense type mapping
        const categoryId = txn.category_id || '';
        const expenseType = this.getSRIExpenseCode(categoryId);

        // Calculate IVA using reverse calculation (amount includes tax)
        const amountCents = txn.amount as Cents;
        const { iva, base } = this.calculateIVAReverse(amountCents, categoryId);

        // Format values for CSV
        const rucEscaped = this.escapeCSV(ruc);
        const nameEscaped = this.escapeCSV(name);
        const baseFormatted = formatMoney(base);
        const ivaFormatted = formatMoney(iva);

        // CSV row
        buffer += `${rucEscaped},${nameEscaped},${expenseType},${baseFormatted},${ivaFormatted}\n`;
        rowCount++;

        // Flush buffer every BUFFER_SIZE rows
        if (rowCount % this.BUFFER_SIZE === 0) {
          chunks.push(buffer);
          buffer = '';
          
          if (progressCallback) {
            progressCallback(rowCount, 0); // Total unknown until completion
          }
          
          return new Promise<void>(resolve => setTimeout(resolve, 0));
        }
      });

    // Flush final buffer
    if (buffer) {
      chunks.push(buffer);
    }

    if (progressCallback) {
      progressCallback(rowCount, rowCount);
    }

    return new Blob(chunks, { type: 'text/csv;charset=utf-8;' });
  }

  /**
   * FASE 4: IVA reverse calculation (duplicate from ReportingService for standalone use)
   */
  private calculateIVAReverse(amountCents: Cents, categoryId: string): { iva: Cents; base: Cents } {
    const amountDecimal = toDecimal(amountCents);
    
    // Check if category is IVA 15%
    if (categoryId.includes('vestimenta') || categoryId.includes('general')) {
      const divisor = new Decimal(1.15);
      const baseDecimal = amountDecimal.div(divisor);
      const ivaDecimal = amountDecimal.minus(baseDecimal);
      return {
        iva: toCents(ivaDecimal) as Cents,
        base: toCents(baseDecimal) as Cents,
      };
    }
    
    return { iva: 0 as Cents, base: amountCents };
  }

  /**
   * FASE 4: Get SRI expense code for category
   */
  private getSRIExpenseCode(categoryId: string): string {
    if (categoryId.includes('alimentacion')) return '001';
    if (categoryId.includes('salud')) return '002';
    if (categoryId.includes('educacion')) return '003';
    if (categoryId.includes('vivienda')) return '004';
    if (categoryId.includes('vestimenta')) return '005';
    return '999';
  }
}

export const streamedExporter = new StreamedExporter();
