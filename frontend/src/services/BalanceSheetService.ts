/**
 * Balance Sheet Service
 * Executive reporting: Assets - Liabilities = Equity
 * Source of truth: net_worth_snapshots for aggregates
 */

import { db } from '../db/db';
import { assetDepreciationService } from './AssetDepreciationService';

export interface BalanceSheet {
  month: number;
  year: number;
  date: string;
  assets: {
    cash_accounts_cents: number;  // Efectivo en cuentas
    physical_assets_cents: number;  // Valor actual activos físicos
    total_assets_cents: number;  // Total activos
  };
  liabilities: {
    ious_pending_cents: number;  // Deudas IOUs pendientes
    credit_card_balances_cents: number;  // Saldos tarjetas crédito
    total_liabilities_cents: number;  // Total pasivos
  };
  equity_cents: number;  // Patrimonio (Activos - Pasivos)
  is_stale: boolean;
}

export class BalanceSheetService {
  /**
   * Get balance sheet for a specific month/year
   * Uses net_worth_snapshot as source of truth for aggregates
   */
  async getBalanceSheet(month: number, year: number): Promise<BalanceSheet | null> {
    // Get snapshot for this month/year
    // @ts-ignore
    const snapshot = await db.net_worth_snapshots
      .where('[month+year]')
      .equals([month, year])
      .first();

    if (!snapshot) {
      return null;
    }

    // Calculate detailed breakdown
    const cashAccountsCents = await this.getCashAccountsValue();
    const physicalAssetsCents = await assetDepreciationService.getTotalAssetsValue(new Date(snapshot.date));
    const iousPendingCents = await this.getIousPendingValue();
    const creditCardBalancesCents = await this.getCreditCardBalances();

    const totalAssetsCents = cashAccountsCents + physicalAssetsCents;
    const totalLiabilitiesCents = iousPendingCents + creditCardBalancesCents;
    const equityCents = totalAssetsCents - totalLiabilitiesCents;

    return {
      month,
      year,
      date: snapshot.date,
      assets: {
        cash_accounts_cents: cashAccountsCents,
        physical_assets_cents: physicalAssetsCents,
        total_assets_cents: totalAssetsCents,
      },
      liabilities: {
        ious_pending_cents: iousPendingCents,
        credit_card_balances_cents: creditCardBalancesCents,
        total_liabilities_cents: totalLiabilitiesCents,
      },
      equity_cents: equityCents,
      is_stale: snapshot.is_stale,
    };
  }

  /**
   * Get balance sheet for current month
   */
  async getCurrentBalanceSheet(): Promise<BalanceSheet | null> {
    const now = new Date();
    return this.getBalanceSheet(now.getMonth() + 1, now.getFullYear());
  }

  /**
   * Get balance sheet history (last 12 months)
   */
  async getBalanceSheetHistory(): Promise<BalanceSheet[]> {
    // @ts-ignore
    const snapshots = await db.net_worth_snapshots
      .orderBy('date')
      .reverse()
      .limit(12)
      .toArray();

    const balanceSheets: BalanceSheet[] = [];

    for (const snapshot of snapshots) {
      const cashAccountsCents = await this.getCashAccountsValue();
      const physicalAssetsCents = await assetDepreciationService.getTotalAssetsValue(new Date(snapshot.date));
      const iousPendingCents = await this.getIousPendingValue();
      const creditCardBalancesCents = await this.getCreditCardBalances();

      const totalAssetsCents = cashAccountsCents + physicalAssetsCents;
      const totalLiabilitiesCents = iousPendingCents + creditCardBalancesCents;
      const equityCents = totalAssetsCents - totalLiabilitiesCents;

      balanceSheets.push({
        month: snapshot.month,
        year: snapshot.year,
        date: snapshot.date,
        assets: {
          cash_accounts_cents: cashAccountsCents,
          physical_assets_cents: physicalAssetsCents,
          total_assets_cents: totalAssetsCents,
        },
        liabilities: {
          ious_pending_cents: iousPendingCents,
          credit_card_balances_cents: creditCardBalancesCents,
          total_liabilities_cents: totalLiabilitiesCents,
        },
        equity_cents: equityCents,
        is_stale: snapshot.is_stale,
      });
    }

    return balanceSheets;
  }

  /**
   * Calculate cash accounts value (checking + savings)
   */
  private async getCashAccountsValue(): Promise<number> {
    // @ts-ignore
    const accounts = await db.accounts.filter(a => !a.is_deleted).toArray();
    return accounts.reduce((sum, account) => sum + (account.balance || 0), 0);
  }

  /**
   * Calculate IOUs pending value
   */
  private async getIousPendingValue(): Promise<number> {
    // @ts-ignore
    const ious = await db.ious.filter(i => !i.is_deleted && i.amount > (i.amount_paid || 0)).toArray();
    return ious.reduce((sum, iou) => sum + (iou.amount - (iou.amount_paid || 0)), 0);
  }

  /**
   * Calculate credit card balances (unpaid statements)
   */
  private async getCreditCardBalances(): Promise<number> {
    // Placeholder: calculate from unpaid statements
    // For now, use simple count * average balance
    // @ts-ignore
    const statements = await db.credit_card_statements
      .filter(s => !s.is_deleted && s.status !== 'paid')
      .toArray();
    return statements.length * 100000; // Placeholder: $1000 per unpaid statement
  }
}

export const balanceSheetService = new BalanceSheetService();
