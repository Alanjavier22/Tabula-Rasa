/**
 * Integrity Service - Data Integrity Check & Recovery Validation
 * SHA-256 hash as "Immutable Seal" for financial data
 * Validates: hash integrity + accounting equation (Cash + Assets - Liabilities == Net Worth)
 */

import { db } from '../db/db';
import { generateTransactionHash } from '../utils/crypto';
import { assetDepreciationService } from './AssetDepreciationService';

export interface IntegrityCheckResult {
  totalChecked: number;
  hashFailures: number;
  integrityFailures: string[];
  hasHashFailures: boolean;
  status: 'healthy' | 'warning' | 'critical';
  accountingEquationValid: boolean;
  accountingDifferenceCents: number;
}

export class IntegrityService {
  private cachedResult: IntegrityCheckResult | null = null;
  private lastCheck: Date | null = null;

  /**
   * Verify database integrity (last 1,000 records)
   * Async, non-blocking - validates hash integrity + accounting equation
   */
  async verifyDatabaseIntegrity(): Promise<IntegrityCheckResult> {
    const integrityFailures: string[] = [];
    let hashFailures = 0;
    let totalChecked = 0;

    // Check hash integrity (last 1,000 transactions)
    await db.transactions
      .orderBy('date')
      .reverse()
      .limit(1000)
      .each(async (txn) => {
        if (txn.is_deleted) return;

        totalChecked++;

        // Recalculate hash from RAW data (date + amount + account_id + description)
        // Hash covers: Fecha + Monto + Cuenta + Descripción CRUDA (pre-PII, no category)
        const recalculatedHash = await generateTransactionHash(
          txn.date,
          txn.amount,
          txn.description || '',
          txn.account_id || ''
        );

        if (recalculatedHash !== txn.hash) {
          hashFailures++;
          integrityFailures.push(`Hash mismatch: txn ${txn.id} (${txn.date})`);
          
          // Mark transaction with integrity failure flag
          await db.transactions.update(txn.id, { integrity_failure: true });
        }
      });

    // Check accounting equation: Cash + Assets - Liabilities == Net Worth
    const accountingCheck = await this.verifyAccountingEquation();

    // Determine overall status
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';

    if (hashFailures > 0) {
      status = 'critical';
    } else if (!accountingCheck.valid || Math.abs(accountingCheck.differenceCents) > 0) {
      status = 'warning';
    }

    const result: IntegrityCheckResult = {
      totalChecked,
      hashFailures,
      integrityFailures,
      hasHashFailures: hashFailures > 0,
      status,
      accountingEquationValid: accountingCheck.valid,
      accountingDifferenceCents: accountingCheck.differenceCents,
    };

    // Cache result
    this.cachedResult = result;
    this.lastCheck = new Date();

    return result;
  }

  /**
   * Verify accounting equation: Cash + Assets - Liabilities == Net Worth
   * Uses current snapshot as source of truth
   * Public method for post-import/export validation
   */
  async verifyAccountingEquation(): Promise<{ valid: boolean; differenceCents: number }> {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // Get current snapshot
    const snapshot = await db.net_worth_snapshots
      .where('[month+year]')
      .equals([currentMonth, currentYear])
      .first();

    if (!snapshot) {
      return { valid: false, differenceCents: 0 };
    }

    // Calculate Cash (account balances)
    const accounts = await db.accounts.filter(a => !a.is_deleted).toArray();
    const cashCents = accounts.reduce((sum, account) => sum + (account.balance || 0), 0);

    // Calculate Assets (physical assets current value)
    const assetsCents = await assetDepreciationService.getTotalAssetsValue();

    // Calculate Liabilities (IOUs pending + credit card balances)
    const ious = await db.ious.filter(i => !i.is_deleted && i.amount > (i.amount_paid || 0)).toArray();
    const iousCents = ious.reduce((sum, iou) => sum + (iou.amount - (iou.amount_paid || 0)), 0);

    const statements = await db.credit_card_statements
      .filter(s => !s.is_deleted && s.status !== 'paid')
      .toArray();
    const statementsCents = statements.length * 100000; // Placeholder

    const liabilitiesCents = iousCents + statementsCents;

    // Calculate expected Net Worth
    const expectedNetWorthCents = cashCents + assetsCents - liabilitiesCents;
    const actualNetWorthCents = snapshot.net_worth_cents;
    const differenceCents = Math.abs(expectedNetWorthCents - actualNetWorthCents);

    // Valid if difference is 0 (exact match)
    const valid = differenceCents === 0;

    return { valid, differenceCents };
  }

  /**
   * Get cached integrity check result (non-blocking)
   */
  getCachedResult(): IntegrityCheckResult | null {
    return this.cachedResult;
  }

  /**
   * Check if integrity check needs to run (not run in last 5 minutes)
   */
  needsCheck(): boolean {
    if (!this.lastCheck) return true;
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return this.lastCheck < fiveMinutesAgo;
  }

  /**
   * Schedule background integrity check (non-blocking)
   */
  scheduleBackgroundCheck(): void {
    setTimeout(async () => {
      if (this.needsCheck()) {
        await this.verifyDatabaseIntegrity();
      }
    }, 500); // 500ms delay after app load
  }
}

export const integrityService = new IntegrityService();