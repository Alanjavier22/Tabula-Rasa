/**
 * Cash Flow Service - Balance Projection Engine
 * NOW: Thin client - calls backend API for cash flow calculations
 * Backend is the single source of truth for financial calculations
 */

import api from './api';

export interface ProjectedBalanceResult {
  days: number;
  current_balance: number;
  projected_balance: number;
  projected_income: number;
  projected_expenses: number;
  seasonal_adjustment: number;
  breakdown: {
    subscriptions: number;
    ious: number;
    seasonal: number;
  };
}

export class CashFlowService {
  /**
   * Get projected balance for N days ahead
   * Calls backend API for calculation
   */
  async getProjectedBalance(days: number): Promise<ProjectedBalanceResult> {
    const response = await api.get(`/metrics/cash-flow-projection/${days}`);
    return response.data;
  }

  /**
   * Get cash flow forecast for multiple time horizons
   * Returns projections for 30, 60, and 90 days
   * Calls backend API for calculation
   */
  async getCashFlowForecast(): Promise<{
    day30: ProjectedBalanceResult;
    day60: ProjectedBalanceResult;
    day90: ProjectedBalanceResult;
  }> {
    const response = await api.get('/metrics/cash-flow-projection');
    return response.data;
  }
}

export const cashFlowService = new CashFlowService();
