/**
 * Snapshot Service - Atomic Net Worth Snapshots
 * Creates monthly snapshots for dashboard performance optimization
 */

import { db } from '../db/db';
import { v4 as uuidv4 } from 'uuid';
import { recurringTransactionService } from './RecurringTransactionService';
import { currencyService } from './CurrencyService';
import { assetDepreciationService } from './AssetDepreciationService';

export class SnapshotService {
  /**
   * Create atomic net worth snapshot for a given month/year
   * All calculations in cents, transaction blocks tables for consistency
   * Converts all balances to base currency
   */
  async createSnapshot(month: number, year: number): Promise<string> {
    const snapshotId = uuidv4();
    const now = new Date().toISOString();
    const snapshotDate = new Date(year, month - 1, 1).toISOString();

    // Atomic transaction: block all tables during snapshot creation
    return await db.transaction('rw', [
      db.transactions,
      db.accounts,
      db.net_worth_snapshots,
      db.sync_queue
    ], async () => {
      const baseCurrency = await currencyService.getBaseCurrency();

      // Get all non-deleted accounts
      // FASE 3: Se incluyen registros en conflicto para mantener integridad del balance
      const accounts = await db.accounts.filter(a => !a.is_deleted).toArray();
      
      // Calculate total assets (account balances in base currency)
      let totalAssetsCents = 0;
      for (const account of accounts) {
        const balanceInBase = await currencyService.convertToBase(
          account.balance,
          account.currency || baseCurrency,
          snapshotDate
        );
        totalAssetsCents += balanceInBase;
      }

      // Add physical assets current value
      const assetsValueCents = await assetDepreciationService.getTotalAssetsValue();
      totalAssetsCents += assetsValueCents;

      // Calculate total liabilities (IOUs pending)
      const ious = await db.ious.filter(i => !i.is_deleted && i.amount > (i.amount_paid || 0)).toArray();
      const iousLiabilityCents = ious.reduce((sum, iou) => sum + (iou.amount - (iou.amount_paid || 0)), 0);

      // Credit card statements (unpaid) - placeholder for now
      const statements = await db.credit_card_statements
        .filter(s => !s.is_deleted && s.status !== 'paid')
        .toArray();
      const statementsLiabilityCents = statements.length * 100000; // Placeholder: $1000 per unpaid statement

      const totalLiabilitiesCents = iousLiabilityCents + statementsLiabilityCents;

      // Get transactions for the month
      const monthStart = new Date(year, month - 1, 1).toISOString();
      const monthEnd = new Date(year, month, 0).toISOString();
      
      // FASE 3: Se incluyen registros en conflicto para mantener integridad del balance
      const monthTransactions = await db.transactions
        .filter(t => !t.is_deleted && t.date >= monthStart && t.date <= monthEnd)
        .toArray();

      // Convert income and expenses to base currency
      let incomeCents = 0;
      let expenseCents = 0;

      for (const txn of monthTransactions) {
        if (txn.transaction_type === 'income') {
          incomeCents += txn.amount;
        } else {
          expenseCents += txn.amount;
        }
      }

      const netWorthCents = totalAssetsCents - totalLiabilitiesCents;

      // Create snapshot
      await db.net_worth_snapshots.add({
        id: snapshotId,
        date: snapshotDate,
        month,
        year,
        total_assets_cents: totalAssetsCents,
        total_liabilities_cents: totalLiabilitiesCents,
        net_worth_cents: netWorthCents,
        income_cents: incomeCents,
        expense_cents: expenseCents,
        transaction_count: monthTransactions.length,
        is_stale: false,
        updated_at: now
      });

      // Add to sync queue
      await db.sync_queue.add({
        id: uuidv4(),
        table_name: 'net_worth_snapshots',
        action: 'create',
        payload: {
          id: snapshotId,
          date: snapshotDate,
          month,
          year,
          total_assets_cents: totalAssetsCents,
          total_liabilities_cents: totalLiabilitiesCents,
          net_worth_cents: netWorthCents,
          income_cents: incomeCents,
          expense_cents: expenseCents,
          transaction_count: monthTransactions.length,
          is_stale: false,
          updated_at: now
        },
        timestamp: now,
        retry_count: 0
      });

      return snapshotId;
    });
  }

  /**
   * Get snapshot by month/year
   */
  async getSnapshotByMonthYear(month: number, year: number) {
    const snapshot = await db.net_worth_snapshots
      .where('[month+year]')
      .equals([month, year])
      .first();
    
    return snapshot;
  }

  /**
   * Get all snapshots (ordered by date)
   */
  async getAllSnapshots() {
    const snapshots = await db.net_worth_snapshots
      .orderBy('date')
      .reverse()
      .toArray();
    
    return snapshots;
  }

  /**
   * Auto-create snapshot for current month if not exists
   */
  async ensureCurrentMonthSnapshot(): Promise<void> {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const existing = await this.getSnapshotByMonthYear(currentMonth, currentYear);
    
    if (!existing) {
      await this.createSnapshot(currentMonth, currentYear);
    }
  }

  /**
   * Reconcile all stale snapshots
   * Async operation to avoid blocking main thread
   */
  async reconcileStaleSnapshots(): Promise<void> {
    try {
      const staleSnapshots = await db.net_worth_snapshots
        .filter(s => s.is_stale)
        .toArray();

      if (staleSnapshots.length === 0) {
        return;
      }

      console.log(`[SnapshotService] Reconciling ${staleSnapshots.length} stale snapshots`);

      for (const snapshot of staleSnapshots) {
        await this.recalculateSnapshot(snapshot.month, snapshot.year);
      }

      // Process recurring transactions after snapshot reconciliation
      await recurringTransactionService.processRecurringTransactions();
    } catch (error) {
      console.error('[SnapshotService] Error reconciling stale snapshots:', error);
    }
  }

  /**
   * Recalculate snapshot for a specific month/year
   * Atomic operation
   * Converts all balances to base currency
   */
  private async recalculateSnapshot(month: number, year: number): Promise<void> {
    const now = new Date().toISOString();

    await db.transaction('rw', [
      db.transactions,
      db.accounts,
      db.net_worth_snapshots
    ], async () => {
      const baseCurrency = await currencyService.getBaseCurrency();
      const snapshotDate = new Date(year, month - 1, 1).toISOString();

      // Get all non-deleted accounts
      // FASE 3: Se incluyen registros en conflicto para mantener integridad del balance
      const accounts = await db.accounts.filter(a => !a.is_deleted).toArray();
      
      // Calculate total assets (account balances in base currency)
      let totalAssetsCents = 0;
      for (const account of accounts) {
        const balanceInBase = await currencyService.convertToBase(
          account.balance,
          account.currency || baseCurrency,
          snapshotDate
        );
        totalAssetsCents += balanceInBase;
      }

      // Add physical assets current value
      const assetsValueCents = await assetDepreciationService.getTotalAssetsValue();
      totalAssetsCents += assetsValueCents;

      // Calculate total liabilities (IOUs pending)
      const ious = await db.ious.filter(i => !i.is_deleted && i.amount > (i.amount_paid || 0)).toArray();
      const iousLiabilityCents = ious.reduce((sum, iou) => sum + (iou.amount - (iou.amount_paid || 0)), 0);

      // Credit card statements (unpaid) - placeholder for now
      const statements = await db.credit_card_statements
        .filter(s => !s.is_deleted && s.status !== 'paid')
        .toArray();
      const statementsLiabilityCents = statements.length * 100000;

      const totalLiabilitiesCents = iousLiabilityCents + statementsLiabilityCents;

      // Get transactions for the month
      const monthStart = new Date(year, month - 1, 1).toISOString();
      const monthEnd = new Date(year, month, 0).toISOString();
      
      // FASE 3: Se incluyen registros en conflicto para mantener integridad del balance
      const monthTransactions = await db.transactions
        .filter(t => !t.is_deleted && t.date >= monthStart && t.date <= monthEnd)
        .toArray();

      // Convert income and expenses to base currency
      let incomeCents = 0;
      let expenseCents = 0;

      for (const txn of monthTransactions) {
        if (txn.transaction_type === 'income') {
          incomeCents += txn.amount;
        } else {
          expenseCents += txn.amount;
        }
      }

      const netWorthCents = totalAssetsCents - totalLiabilitiesCents;

      // Find existing snapshot
      const existing = await db.net_worth_snapshots
        .where('[month+year]')
        .equals([month, year])
        .first();

      if (existing) {
        // Update existing snapshot
        await db.net_worth_snapshots.update(existing.id, {
          total_assets_cents: totalAssetsCents,
          total_liabilities_cents: totalLiabilitiesCents,
          net_worth_cents: netWorthCents,
          income_cents: incomeCents,
          expense_cents: expenseCents,
          transaction_count: monthTransactions.length,
          is_stale: false,
          updated_at: now
        });
      }
    });
  }
}

export const snapshotService = new SnapshotService();