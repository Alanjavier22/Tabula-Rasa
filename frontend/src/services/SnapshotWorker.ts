/**
 * SnapshotWorker - Async Background Processor for Net Worth Snapshots
 * FASE 3: Decouples snapshot recalculation from transaction operations to prevent deadlocks
 * Processes snapshot_recalc_queue in small batches with yielding to avoid blocking Event Loop
 */

import { db } from '../db/db';
import { v4 as uuidv4 } from 'uuid';
import Decimal from 'decimal.js-light'; // FASE 2: IEEE 754-safe arithmetic

const BATCH_SIZE = 1; // Process one month at a time to avoid blocking
const YIELD_DELAY_MS = 0; // Use setTimeout(0) for yielding

interface SnapshotRecalcQueue {
  id: string; // Format: "YYYY-MM"
  month: number;
  year: number;
  enqueued_at: string;
  priority: number;
}

export class SnapshotWorker {
  private isProcessing = false;
  private abortController: AbortController | null = null;

  /**
   * Start processing the snapshot recalculation queue
   */
  async start(): Promise<void> {
    if (this.isProcessing) {
      console.debug('[FASE-3] SnapshotWorker already processing');
      return;
    }

    this.isProcessing = true;
    this.abortController = new AbortController();
    console.debug('[FASE-3] SnapshotWorker started');

    try {
      while (this.isProcessing) {
        // Get next batch of entries (ordered by priority, then enqueued_at)
        const entries = await db.snapshot_recalc_queue
          .orderBy('priority')
          .limit(BATCH_SIZE)
          .toArray() as SnapshotRecalcQueue[];

        if (entries.length === 0) {
          console.debug('[FASE-3] SnapshotWorker queue empty, stopping');
          break;
        }

        // Process each entry in the batch
        for (const entry of entries) {
          if (!this.isProcessing) break;

          try {
            await this.processMonth(entry.month, entry.year);
            
            // Remove from queue after successful processing
            await db.snapshot_recalc_queue.delete(entry.id);
            console.debug(`[FASE-3] Processed snapshot for ${entry.id}`);
          } catch (error) {
            console.error(`[FASE-3] Error processing snapshot for ${entry.id}:`, error);
            // Keep entry in queue for retry (could add retry count logic here)
          }
        }

        // Yield to Event Loop between batches to prevent blocking
        if (this.isProcessing) {
          await new Promise(resolve => setTimeout(resolve, YIELD_DELAY_MS));
        }
      }
    } catch (error) {
      console.error('[FASE-3] SnapshotWorker error:', error);
    } finally {
      this.isProcessing = false;
      this.abortController = null;
      console.debug('[FASE-3] SnapshotWorker stopped');
    }
  }

  /**
   * Stop processing the queue
   */
  stop(): void {
    this.isProcessing = false;
    if (this.abortController) {
      this.abortController.abort();
    }
    console.debug('[FASE-3] SnapshotWorker stopped');
  }

  /**
   * Process a single month's snapshot recalculation
   * Calculates assets, liabilities, net worth, income, and expense for the given month
   * FASE 2: Uses Decimal for IEEE 754-safe arithmetic
   */
  private async processMonth(month: number, year: number): Promise<void> {
    const snapshotDate = new Date(year, month - 1, 1).toISOString();
    const now = new Date().toISOString();

    // Calculate totals from transactions for this month
    const transactions = await db.transactions
      .where('date')
      .between(
        new Date(year, month - 1, 1).toISOString(),
        new Date(year, month, 0, 23, 59, 59).toISOString()
      )
      .toArray();

    let income_cents = new Decimal(0);
    let expense_cents = new Decimal(0);
    const transaction_count = transactions.length;

    for (const txn of transactions) {
      if (txn.is_deleted) continue;
      
      const amount = new Decimal(txn.amount);
      
      if (txn.transaction_type === 'income') {
        income_cents = income_cents.plus(amount);
      } else {
        expense_cents = expense_cents.plus(amount);
      }
    }

    // Calculate assets and liabilities from accounts
    const accounts = await db.accounts.toArray();

    let total_assets_cents = new Decimal(0);
    let total_liabilities_cents = new Decimal(0);

    for (const account of accounts) {
      if (account.is_deleted) continue;
      
      const balance = new Decimal(account.balance);
      
      // FASE 3: Asset/liability classification semántica
      // Utilizamos account_type para lógica futura específica (ej. tasas de liquidez), 
      // aunque matemáticamente el signo determina la posición final en el balance.
      if (account.account_type === 'credit_card') {
        if (balance.lessThan(0)) {
          total_liabilities_cents = total_liabilities_cents.plus(balance.abs());
        } else {
          total_assets_cents = total_assets_cents.plus(balance); // Tarjeta sobrepagada a favor
        }
      } else {
        // checking, savings, cash, investment
        if (balance.greaterThanOrEqualTo(0)) {
          total_assets_cents = total_assets_cents.plus(balance);
        } else {
          total_liabilities_cents = total_liabilities_cents.plus(balance.abs()); // Sobregiro
        }
      }
    }

    const net_worth_cents = total_assets_cents.minus(total_liabilities_cents);

    // Update or insert snapshot
    const existing = await db.net_worth_snapshots
      .where('[month+year]')
      .equals([month, year])
      .first();

    if (existing) {
      await db.net_worth_snapshots.update(existing.id, {
        total_assets_cents: total_assets_cents.toNumber(),
        total_liabilities_cents: total_liabilities_cents.toNumber(),
        net_worth_cents: net_worth_cents.toNumber(),
        income_cents: income_cents.toNumber(),
        expense_cents: expense_cents.toNumber(),
        transaction_count,
        is_stale: false,
        updated_at: now,
      });
    } else {
      await db.net_worth_snapshots.add({
        id: uuidv4(),
        date: snapshotDate,
        month,
        year,
        total_assets_cents: total_assets_cents.toNumber(),
        total_liabilities_cents: total_liabilities_cents.toNumber(),
        net_worth_cents: net_worth_cents.toNumber(),
        income_cents: income_cents.toNumber(),
        expense_cents: expense_cents.toNumber(),
        transaction_count,
        is_stale: false,
        updated_at: now,
      });
    }
  }

  /**
   * Check if currently processing
   */
  getIsProcessing(): boolean {
    return this.isProcessing;
  }
}

// Singleton instance
export const snapshotWorker = new SnapshotWorker();

// Auto-start on app load if queue is not empty
if (typeof window !== 'undefined') {
  db.snapshot_recalc_queue.count().then(count => {
    if (count > 0) {
      console.debug(`[FASE-3] Found ${count} pending snapshot recalculations, starting worker`);
      snapshotWorker.start();
    }
  }).catch((err: unknown) => {
    console.error('[FASE-3] Error checking snapshot queue:', err);
  });
}