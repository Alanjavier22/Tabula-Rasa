/**
 * Balance Sheet Service
 * NOW: Thin client - calls backend API for balance sheet calculations
 * Backend is the single source of truth for financial calculations
 */

import api from './api';

export interface BalanceSheet {
  month: number;
  year: number;
  date: string;
  assets: {
    cash_accounts_cents: number;
    physical_assets_cents: number;
    total_assets_cents: number;
  };
  liabilities: {
    ious_pending_cents: number;
    credit_card_balances_cents: number;
    total_liabilities_cents: number;
  };
  equity_cents: number;
  is_stale: boolean;
}

export class BalanceSheetService {
  /**
   * Get balance sheet for a specific month/year
   * Calls backend API for calculation
   */
  async getBalanceSheet(month: number, year: number): Promise<BalanceSheet | null> {
    try {
      const response = await api.get(`/metrics/balance-sheet/${month}/${year}`);
      return response.data;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get balance sheet for current month
   * Calls backend API for calculation
   */
  async getCurrentBalanceSheet(): Promise<BalanceSheet | null> {
    try {
      const response = await api.get('/metrics/balance-sheet');
      return response.data;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get balance sheet history (last 12 months)
   * Calls backend API for calculation
   */
  async getBalanceSheetHistory(): Promise<BalanceSheet[]> {
    const response = await api.get('/metrics/balance-sheet/history');
    return response.data.history;
  }
}

export const balanceSheetService = new BalanceSheetService();
