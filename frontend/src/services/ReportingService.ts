/**
 * ReportingService - Motor de Reportes Tabula Rasa (FASE 1-7)
 * Local-First: Agregaciones masivas (50k+) sin bloquear UI
 * Integridad Monetaria: Cents + decimal.js-light
 * Privacidad: Sanitización pipeline para datos sensibles
 * 
 * BACKUP NOTE: Este módulo puede ser respaldado opcionalmente mediante el archivo
 * personal-website.zip para configuraciones de entorno y migraciones de datos.
 */

import { db } from '../db/db';
import { v5 as uuidv5 } from 'uuid';
import Decimal from 'decimal.js-light';
import { toDecimal, toCents, formatMoney } from '../utils/money';
import { prepareForAI, hydrateAIResponse, clearHydrationMap, isValidEcuadorianID } from '../utils/privacy';
import { tokenizeDescription, matchesSearch } from '../utils/searchUtils';
import type { Cents } from '../types';
import type { LocalTransaction } from '../types/schemas';

// Ecuador Fiscal Context
interface EcuadorFiscalRules {
  iva_rate: number; // 15%
  retencion_source_rate: number; // 1% (configurable)
  retencion_iva_rate: number; // 30% del IVA (configurable)
}


// FASE 4: Establishment intelligence
export interface EstablishmentData {
  ruc?: string;
  name: string;
  total_spent_cents: Cents;
  is_ruc_valid: boolean;
  transaction_count: number;
}

// Report totals aggregation
interface ReportTotals {
  total_income_cents: Cents;
  total_expense_cents: Cents;
  iva_projected_cents: Cents;
  retencion_projected_cents: Cents;
  total_deductible_sri_cents: Cents; // FASE 2: Sum of deductible transactions
  iva_pagado_15_cents: Cents; // FASE 2: IVA paid only on iva_15 categories
  monto_objeto_retencion_cents: Cents; // FASE 2: Base for withholding calculations
  transaction_count: number;
  category_breakdown: Map<string, Cents>;
}

// Report metadata
interface ReportMetadata {
  id: string;
  start_date: string;
  end_date: string;
  category_ids?: string[];
  generated_at: string;
  fiscal_context: EcuadorFiscalRules;
}

// Report result
export interface ReportResult {
  metadata: ReportMetadata;
  totals: ReportTotals;
  category_breakdown: Array<{ category_id: string; amount_cents: Cents; formatted: string }>;
}

export class ReportingService {
  private readonly YIELD_INTERVAL = 1000; // UI yield every 1,000 records
  private readonly DEFAULT_FISCAL_RULES: EcuadorFiscalRules = {
    iva_rate: 0.15, // 15% IVA Ecuador
    retencion_source_rate: 0.01, // 1% retención fuente
    retencion_iva_rate: 0.30, // 30% del IVA
  };

  /**
   * Generate deterministic UUIDv5 for report ID
   */
  private generateReportId(startDate: string, endDate: string, categoryIds?: string[]): string {
    const seed = categoryIds 
      ? `report_${startDate}_${endDate}_${categoryIds.sort().join(',')}`
      : `report_${startDate}_${endDate}`;
    return uuidv5(seed, uuidv5.URL);
  }

  /**
   * Filter transactions by date range and categories
   */
  private async filterTransactions(
    startDate: string,
    endDate: string,
    categoryIds?: string[]
  ): Promise<Set<string>> {
    const filteredIds = new Set<string>();
    
    let query = db.transactions
      .where('date')
      .between(startDate, endDate, true, true);

    if (categoryIds && categoryIds.length > 0) {
      query = query.and(txn => 
        txn.category_id !== undefined && categoryIds.includes(txn.category_id)
      );
    }

    await query.each((txn) => {
      if (!txn.is_deleted) {
        filteredIds.add(txn.id);
      }
    });

    return filteredIds;
  }

  /**
   * FASE 2: IVA reverse calculation - extract IVA from amount that includes tax
   * For 15% IVA: IVA = amount / 1.15 * 0.15, Base = amount / 1.15
   */
  private calculateIVAReverse(amountCents: Cents, taxType: string): { iva: Cents; base: Cents } {
    const amountDecimal = toDecimal(amountCents);
    
    if (taxType === 'iva_15') {
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
   * Async aggregation using .each() - no .toArray() for memory safety
   * FASE 2: Enhanced with SRI tax logic per category
   * Processes 50k+ records without blocking main thread
   */
  private async aggregateTransactions(
    transactionIds: Set<string>,
    fiscalRules: EcuadorFiscalRules,
    progressCallback?: (processed: number, total: number) => void
  ): Promise<ReportTotals> {
    const totals: ReportTotals = {
      total_income_cents: 0 as Cents,
      total_expense_cents: 0 as Cents,
      iva_projected_cents: 0 as Cents,
      retencion_projected_cents: 0 as Cents,
      total_deductible_sri_cents: 0 as Cents,
      iva_pagado_15_cents: 0 as Cents,
      monto_objeto_retencion_cents: 0 as Cents,
      transaction_count: 0,
      category_breakdown: new Map(),
    };

    // Preload category tax properties for efficiency
    const categoryTaxMap = new Map<string, { tax_type?: string; is_deductible?: boolean; withholding_rate?: number | null }>();
    const generalCategoryId = uuidv5('category_general', uuidv5.URL);
    
    await db.categories.each((cat) => {
      if (cat.tax_type || cat.is_deductible !== undefined || cat.withholding_rate !== undefined) {
        categoryTaxMap.set(cat.id, {
          tax_type: cat.tax_type,
          is_deductible: cat.is_deductible,
          withholding_rate: cat.withholding_rate,
        });
      }
    });

    let processedCount = 0;
    const totalCount = transactionIds.size;

    // Streaming aggregation with .each() - prevents RAM overflow
    await db.transactions
      .where('id')
      .anyOf(Array.from(transactionIds))
      .each((txn) => {
        if (txn.is_deleted) return;

        const amountCents = txn.amount as Cents;
        const amountDecimal = toDecimal(amountCents);
        
        // FASE 2: Get category tax properties, fallback to General/Otros
        const categoryId = txn.category_id || generalCategoryId;
        const taxProps = categoryTaxMap.get(categoryId) || { 
          tax_type: 'iva_15', 
          is_deductible: false 
        };
        const taxType = taxProps.tax_type || 'iva_15';
        const isDeductible = taxProps.is_deductible || false;

        // Aggregate by type
        if (txn.transaction_type === 'income') {
          totals.total_income_cents = toCents(
            toDecimal(totals.total_income_cents).plus(amountDecimal)
          ) as Cents;
          
          // Project IVA (15% of income)
          const ivaDecimal = amountDecimal.mul(fiscalRules.iva_rate);
          totals.iva_projected_cents = toCents(
            toDecimal(totals.iva_projected_cents).plus(ivaDecimal)
          ) as Cents;
          
          // Project retención fuente (1% of income)
          const retencionDecimal = amountDecimal.mul(fiscalRules.retencion_source_rate);
          totals.retencion_projected_cents = toCents(
            toDecimal(totals.retencion_projected_cents).plus(retencionDecimal)
          ) as Cents;
        } else {
          totals.total_expense_cents = toCents(
            toDecimal(totals.total_expense_cents).plus(amountDecimal)
          ) as Cents;
          
          // FASE 2: Track deductible expenses
          if (isDeductible) {
            totals.total_deductible_sri_cents = toCents(
              toDecimal(totals.total_deductible_sri_cents).plus(amountDecimal)
            ) as Cents;
          }
          
          // FASE 2: Calculate IVA paid on iva_15 categories using reverse calculation
          if (taxType === 'iva_15') {
            const { iva } = this.calculateIVAReverse(amountCents, taxType);
            totals.iva_pagado_15_cents = toCents(
              toDecimal(totals.iva_pagado_15_cents).plus(toDecimal(iva))
            ) as Cents;
          }
          
          // FASE 2: Track base for withholding (from metadata if available)
          if (txn.description?.toLowerCase().includes('retencion') || 
              taxProps.withholding_rate) {
            totals.monto_objeto_retencion_cents = toCents(
              toDecimal(totals.monto_objeto_retencion_cents).plus(amountDecimal)
            ) as Cents;
          }
        }

        // Category breakdown
        const current = toDecimal(totals.category_breakdown.get(categoryId) || 0);
        totals.category_breakdown.set(
          categoryId,
          toCents(current.plus(amountDecimal)) as Cents
        );

        totals.transaction_count++;
        processedCount++;

        // UI Yielding every 1,000 records - prevents main thread blocking
        if (processedCount % this.YIELD_INTERVAL === 0) {
          if (progressCallback) {
            progressCallback(processedCount, totalCount);
          }
          return new Promise<void>(resolve => setTimeout(resolve, 0));
        }
      });

    // Final progress callback
    if (progressCallback) {
      progressCallback(processedCount, totalCount);
    }

    return totals;
  }

  /**
   * Generate report with date/category filtering
   * Main entry point for report generation
   */
  async generateReport(
    startDate: string,
    endDate: string,
    categoryIds?: string[],
    fiscalRules?: Partial<EcuadorFiscalRules>,
    progressCallback?: (processed: number, total: number) => void
  ): Promise<ReportResult> {
    const rules = { ...this.DEFAULT_FISCAL_RULES, ...fiscalRules };
    
    // Filter transactions
    const transactionIds = await this.filterTransactions(startDate, endDate, categoryIds);
    
    // Aggregate with streaming
    const totals = await this.aggregateTransactions(
      transactionIds,
      rules,
      progressCallback
    );

    // Build category breakdown array
    const categoryBreakdown = Array.from(totals.category_breakdown.entries()).map(
      ([category_id, amount_cents]) => ({
        category_id,
        amount_cents,
        formatted: formatMoney(amount_cents),
      })
    );

    // Generate report metadata
    const metadata: ReportMetadata = {
      id: this.generateReportId(startDate, endDate, categoryIds),
      start_date: startDate,
      end_date: endDate,
      category_ids: categoryIds,
      generated_at: new Date().toISOString(),
      fiscal_context: rules,
    };

    return {
      metadata,
      totals,
      category_breakdown: categoryBreakdown,
    };
  }

  /**
   * Sanitize sensitive data before AI processing
   * Privacy pipeline for descriptions, IDs
   */
  async sanitizeForAI(data: any): Promise<{ sanitized: any; hydrationMap: Map<string, string> }> {
    return prepareForAI(data);
  }

  /**
   * Hydrate AI response with original values
   */
  hydrateAIResponse(text: string, hydrationMap: Map<string, string>): string {
    return hydrateAIResponse(text, hydrationMap);
  }

  /**
   * Clear hydration map to prevent memory leaks
   */
  clearHydrationMap(hydrationMap: Map<string, string>): void {
    clearHydrationMap(hydrationMap);
  }

  /**
   * FASE 3: Generate time series data for Recharts visualization
   * Buckets transactions by month to avoid sending individual records to UI
   * Format: Array<{ date: string, income: number, expense: number, tax: number }>
   */
  async getTrendData(
    startDate: string,
    endDate: string,
    categoryIds?: string[],
    fiscalRules?: Partial<EcuadorFiscalRules>,
    progressCallback?: (processed: number, total: number) => void
  ): Promise<Array<{ date: string; income: number; expense: number; tax: number; deductible: number }>> {
    const rules = { ...this.DEFAULT_FISCAL_RULES, ...fiscalRules };
    const transactionIds = await this.filterTransactions(startDate, endDate, categoryIds);
    
    // Preload category tax properties
    const categoryTaxMap = new Map<string, { tax_type?: string; is_deductible?: boolean; withholding_rate?: number | null }>();
    const generalCategoryId = uuidv5('category_general', uuidv5.URL);
    
    await db.categories.each((cat) => {
      if (cat.tax_type || cat.is_deductible !== undefined || cat.withholding_rate !== undefined) {
        categoryTaxMap.set(cat.id, {
          tax_type: cat.tax_type,
          is_deductible: cat.is_deductible,
          withholding_rate: cat.withholding_rate,
        });
      }
    });

    // Bucket by month (YYYY-MM format)
    const monthlyBuckets = new Map<string, { income: number; expense: number; tax: number; deductible: number }>();
    let processedCount = 0;
    const totalCount = transactionIds.size;

    await db.transactions
      .where('id')
      .anyOf(Array.from(transactionIds))
      .each((txn) => {
        if (txn.is_deleted) return;

        const amountCents = txn.amount as Cents;
        const amountDecimal = toDecimal(amountCents);
        const monthKey = txn.date.substring(0, 7); // YYYY-MM
        
        if (!monthlyBuckets.has(monthKey)) {
          monthlyBuckets.set(monthKey, { income: 0, expense: 0, tax: 0, deductible: 0 });
        }

        const bucket = monthlyBuckets.get(monthKey)!;
        
        // Get category tax properties, fallback to General/Otros
        const categoryId = txn.category_id || generalCategoryId;
        const taxProps = categoryTaxMap.get(categoryId) || { 
          tax_type: 'iva_15', 
          is_deductible: false 
        };
        const taxType = taxProps.tax_type || 'iva_15';
        const isDeductible = taxProps.is_deductible || false;

        if (txn.transaction_type === 'income') {
          bucket.income = toDecimal(bucket.income).plus(amountDecimal).toNumber();
          const ivaDecimal = amountDecimal.mul(rules.iva_rate);
          bucket.tax = toDecimal(bucket.tax).plus(ivaDecimal).toNumber();
        } else {
          bucket.expense = toDecimal(bucket.expense).plus(amountDecimal).toNumber();
          
          if (isDeductible) {
            bucket.deductible = toDecimal(bucket.deductible).plus(amountDecimal).toNumber();
          }
          
          if (taxType === 'iva_15') {
            const { iva } = this.calculateIVAReverse(amountCents, taxType);
            bucket.tax = toDecimal(bucket.tax).plus(toDecimal(iva)).toNumber();
          }
        }

        processedCount++;
        if (processedCount % this.YIELD_INTERVAL === 0) {
          if (progressCallback) {
            progressCallback(processedCount, totalCount);
          }
          return new Promise<void>(resolve => setTimeout(resolve, 0));
        }
      });

    if (progressCallback) {
      progressCallback(processedCount, totalCount);
    }

    // Convert to array sorted by date
    const trendData = Array.from(monthlyBuckets.entries())
      .map(([date, values]) => ({
        date,
        income: values.income,
        expense: values.expense,
        tax: values.tax,
        deductible: values.deductible,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return trendData;
  }

  /**
   * FASE 4: Generate establishment intelligence ranking
   * Extracts RUC/establishment data from metadata_json
   * Handles empty metadata_json by using description as fallback
   */
  async getEstablishmentIntelligence(
    startDate: string,
    endDate: string,
    categoryIds?: string[],
    progressCallback?: (processed: number, total: number) => void
  ): Promise<EstablishmentData[]> {
    const transactionIds = await this.filterTransactions(startDate, endDate, categoryIds);
    const establishmentMap = new Map<string, EstablishmentData>();
    let processedCount = 0;
    const totalCount = transactionIds.size;

    await db.transactions
      .where('id')
      .anyOf(Array.from(transactionIds))
      .each((txn) => {
        if (txn.is_deleted || txn.transaction_type !== 'expense') return;

        // Extract establishment data from metadata_json or fallback to description
        let ruc: string | undefined;
        let name: string = 'Desconocido';
        
        if (txn.metadata_json) {
          try {
            const metadata = JSON.parse(txn.metadata_json);
            ruc = metadata.ruc || metadata.emisor_ruc || metadata.ruc_emisor;
            name = metadata.establecimiento || metadata.nombre_comercial || metadata.merchant || name;
          } catch {
            // Invalid JSON, use description as fallback
            name = txn.description || 'Desconocido';
          }
        } else {
          // No metadata, use description as fallback
          name = txn.description || 'Desconocido';
        }

        // Validate RUC if present
        const isRucValid = ruc ? isValidEcuadorianID(ruc) : false;
        const establishmentKey = `${ruc || 'no-ruc'}_${name}`;

        if (!establishmentMap.has(establishmentKey)) {
          establishmentMap.set(establishmentKey, {
            ruc: isRucValid ? ruc : undefined,
            name,
            total_spent_cents: 0 as Cents,
            is_ruc_valid: isRucValid,
            transaction_count: 0,
          });
        }

        const establishment = establishmentMap.get(establishmentKey)!;
        const amountCents = txn.amount as Cents;
        establishment.total_spent_cents = toCents(
          toDecimal(establishment.total_spent_cents).plus(toDecimal(amountCents))
        ) as Cents;
        establishment.transaction_count++;

        processedCount++;
        if (processedCount % this.YIELD_INTERVAL === 0) {
          if (progressCallback) {
            progressCallback(processedCount, totalCount);
          }
          return new Promise<void>(resolve => setTimeout(resolve, 0));
        }
      });

    if (progressCallback) {
      progressCallback(processedCount, totalCount);
    }

    // Return ranking sorted by total spent
    return Array.from(establishmentMap.values()).sort(
      (a, b) => toDecimal(b.total_spent_cents).toNumber() - toDecimal(a.total_spent_cents).toNumber()
    );
  }

  /**
   * FASE 6: Get transactions with categories (denormalized join)
   * Pre-fetches categories to avoid N+1 queries in virtual list
   * Returns transactions with category details merged in
   */
  async getTransactionsWithCategories(
    limit?: number,
    offset?: number,
    startDate?: string,
    endDate?: string,
    searchQuery?: string
  ): Promise<Array<LocalTransaction & { category?: any }>> {
    // Pre-fetch all categories (small dataset, fits in memory)
    const categoryMap = new Map<string, any>();
    await db.categories.each((cat) => {
      if (!cat.is_deleted) {
        categoryMap.set(cat.id, cat);
      }
    });

    const transactions: Array<LocalTransaction & { category?: any }> = [];
    
    let query = db.transactions.orderBy('date').reverse();
    
    // FASE 6.2: Date range filtering
    if (startDate && endDate) {
      query = query.and(txn => txn.date >= startDate && txn.date <= endDate);
    }
    
    // FASE 6.2: Search using in-memory filtering (no multi-entry index)
    // Fetch first, then filter in-memory using matchesSearch
    
    if (limit) {
      query = query.limit(limit);
    }
    
    if (offset) {
      query = query.offset(offset);
    }

    // FASE 3: Se incluyen registros en conflicto para mantener integridad del balance
    await query.filter(txn => !txn.is_deleted).each((txn) => {
      transactions.push({
        ...txn,
        category: categoryMap.get(txn.category_id || ''),
      });
    });

    // In-memory search filter using matchesSearch
    if (searchQuery) {
      return transactions.filter(txn => {
        const words = tokenizeDescription(txn.description || '');
        return matchesSearch(searchQuery, words);
      });
    }

    return transactions;
  }

  /**
   * FASE 6: Optimistic transaction creation
   * Writes to IndexedDB immediately, returns without waiting for sync
   */
  async createTransactionOptimistic(transaction: Partial<LocalTransaction>): Promise<string> {
    const id = uuidv5(`txn_${Date.now()}_${Math.random()}`, uuidv5.URL);
    const now = new Date().toISOString();
    
    await db.transactions.add({
      id,
      is_deleted: false,
      updated_at: now,
      date: transaction.date || now.split('T')[0],
      transaction_type: transaction.transaction_type || 'expense',
      amount: transaction.amount || 0,
      description: transaction.description || '',
      category_id: transaction.category_id || null,
      account_id: transaction.account_id || null,
      version: 1,
      needs_review: false,
    } as LocalTransaction);

    return id;
  }

  /**
   * FASE 6: Optimistic transaction update
   * Writes to IndexedDB immediately, returns without waiting for sync
   */
  async updateTransactionOptimistic(
    id: string,
    updates: Partial<LocalTransaction>
  ): Promise<void> {
    const now = new Date().toISOString();
    
    await db.transactions.update(id, {
      ...updates,
      updated_at: now,
      version: (updates.version || 0) + 1,
      needs_review: true, // Mark for sync review
    });
  }

  /**
   * FASE 6: Optimistic transaction deletion
   * Soft-deletes immediately, returns without waiting for sync
   */
  async deleteTransactionOptimistic(id: string): Promise<void> {
    const now = new Date().toISOString();
    
    await db.transactions.update(id, {
      is_deleted: true,
      updated_at: now,
      needs_review: true, // Mark for sync review
    });
  }

  /**
   * FASE 6: Check for pending mutations
   * Returns count of transactions marked for sync
   */
  async getPendingMutationCount(): Promise<number> {
    return await db.transactions
      .filter(txn => txn.needs_review === true && !txn.is_deleted)
      .count();
  }

  /**
   * FASE 7: Bulk update transactions with atomic transaction + OCC version conflict detection
   * Prevents data corruption if PWA closes mid-operation
   * STRICT OCC RULE: If incoming version != current version, trigger needs_review=true
   * All updates succeed or none succeed - no partial state
   */
  async bulkUpdateTransactions(
    ids: string[],
    changes: Partial<LocalTransaction>
  ): Promise<number> {
    const now = new Date().toISOString();
    
    return await db.transaction('rw', db.transactions, async () => {
      // Fetch all existing records first
      const existingRecords = await db.transactions
        .where('id')
        .anyOf(ids)
        .toArray();
      
      // Prepare bulk updates with strict OCC version checking
      const updates = existingRecords
        .filter(r => !r.is_deleted)
        .map(r => {
          const incomingVersion = changes.version ?? r.version;
          const currentVersion = r.version || 0;
          
          // STRICT OCC: Version conflict detection
          const hasConflict = incomingVersion !== currentVersion;
          
          return {
            ...r,
            ...changes,
            updated_at: now,
            version: Math.max(currentVersion, incomingVersion) + 1, // Force version increment on conflict
            needs_review: hasConflict, // Trigger manual review on version mismatch
          };
        });
      
      // Bulk put all updates in single operation
      await db.transactions.bulkPut(updates);
      
      return updates.length;
    });
  }

  /**
   * FASE 7: Prepare audit context for AI discrepancy detection
   * Scans transactions for category errors, sanitizes PII before sending to AI
   * Returns sanitized JSON ready for Gemini analysis
   */
  async prepareAuditContext(
    startDate?: string,
    endDate?: string
  ): Promise<{ discrepancies: Array<{ id: string; description: string; current_category: string; suggested_category: string; confidence: number }>, total_scanned: number }> {
    const transactions = await this.getTransactionsWithCategories(undefined, undefined, startDate, endDate);
    const discrepancies: Array<{ id: string; description: string; current_category: string; suggested_category: string; confidence: number }> = [];
    
    // Simple heuristic-based anomaly detection
    // In production, this would call AI API for actual categorization
    const keywordCategoryMap: Record<string, string> = {
      'farmacia': 'salud',
      'medicina': 'salud',
      'doctor': 'salud',
      'supermercado': 'alimentacion',
      'mercado': 'alimentacion',
      'comida': 'alimentacion',
      'restaurante': 'alimentacion',
      'escuela': 'educacion',
      'colegio': 'educacion',
      'libros': 'educacion',
      'alquiler': 'vivienda',
      'renta': 'vivienda',
      'luz': 'vivienda',
      'agua': 'vivienda',
      'ropa': 'vestimenta',
      'zapatos': 'vestimenta',
    };

    for (const txn of transactions) {
      const descLower = (txn.description || '').toLowerCase();
      const currentCategory = txn.category?.name || 'Sin categoría';
      
      // Check if description keywords suggest different category
      for (const [keyword, suggestedCategory] of Object.entries(keywordCategoryMap)) {
        if (descLower.includes(keyword) && !currentCategory.toLowerCase().includes(suggestedCategory)) {
          const { sanitized } = prepareForAI(txn.description || ''); // Sanitize PII
          discrepancies.push({
            id: txn.id,
            description: sanitized,
            current_category: currentCategory,
            suggested_category: suggestedCategory.charAt(0).toUpperCase() + suggestedCategory.slice(1),
            confidence: 0.75, // Heuristic confidence
          });
          break; // One discrepancy per transaction max
        }
      }
    }

    return {
      discrepancies,
      total_scanned: transactions.length,
    };
  }
}

export const reportingService = new ReportingService();
