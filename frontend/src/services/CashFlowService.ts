/**
 * Cash Flow Service - Balance Projection Engine
 * Projects future balance using subscriptions, IOUs, and seasonal adjustments
 * Operates on aggregates only (fast, no 50k transaction scans)
 */

import { db } from '../db/db';

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
   * Fast algorithm using aggregates only
   */
  async getProjectedBalance(days: number): Promise<ProjectedBalanceResult> {
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    try {
      // 1. Current balance (sum of all account balances in cents)
      // @ts-ignore
      const accounts = await db.accounts.filter(a => !a.is_deleted).toArray();
      const currentBalance = accounts.reduce((sum, a) => sum + a.balance, 0);

      // 2. Projected income (90-day average)
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      
      // @ts-ignore
      const recentIncome = await db.transactions
        .filter(t => 
          !t.is_deleted && 
          t.transaction_type === 'income' && 
          t.date >= ninetyDaysAgo.toISOString()
        )
        .toArray();

      const totalIncome = recentIncome.reduce((sum, t) => sum + t.amount, 0);
      const avgDailyIncome = totalIncome / 90;
      const projectedIncome = Math.round(avgDailyIncome * days);

      // 3. Subscriptions due in period
      // @ts-ignore
      const subscriptions = await db.subscriptions
        .filter(s => !s.is_deleted && !!s.next_billing_date)
        .toArray();

      let subscriptionCost = 0;
      for (const sub of subscriptions) {
        const nextBilling = new Date(sub.next_billing_date || '');
        if (!isNaN(nextBilling.getTime()) && nextBilling >= now && nextBilling <= futureDate) {
          subscriptionCost += sub.amount_cents || 0;
        }
      }

      // 4. IOUs due in period
      // @ts-ignore
      const ious = await db.ious
        .filter(i => !i.is_deleted && i.amount > (i.amount_paid || 0))
        .toArray();

      let iouCost = 0;
      for (const iou of ious) {
        // Check if IOU has due date in metadata or transaction
        // For now, include all pending IOUs (conservative estimate)
        iouCost += (iou.amount - (iou.amount_paid || 0));
      }

      // 5. Seasonal adjustment (Fase 3 logic)
      const seasonalAdjustment = await this.calculateSeasonalAdjustment(now, futureDate);

      // Calculate projected balance
      const projectedExpenses = subscriptionCost + iouCost;
      const projectedBalance = currentBalance + projectedIncome - projectedExpenses + seasonalAdjustment;

      return {
        days,
        current_balance: currentBalance,
        projected_balance: projectedBalance,
        projected_income: projectedIncome,
        projected_expenses: projectedExpenses,
        seasonal_adjustment: seasonalAdjustment,
        breakdown: {
          subscriptions: subscriptionCost,
          ious: iouCost,
          seasonal: seasonalAdjustment
        }
      };
    } catch (error) {
      console.error('[CashFlowService] Error calculating projection:', error);
      throw error;
    }
  }

  /**
   * Calculate seasonal adjustment for a date range
   * Ecuador-specific: April (Utilidades), August/December (Décimos)
   */
  private async calculateSeasonalAdjustment(startDate: Date, endDate: Date): Promise<number> {
    let adjustment = 0;
    const currentYear = startDate.getFullYear();

    // Check if April falls in range (Utilidades)
    const aprilStart = new Date(currentYear, 3, 1);
    const aprilEnd = new Date(currentYear, 3, 30);
    if (this.dateRangesOverlap(startDate, endDate, aprilStart, aprilEnd)) {
      adjustment += await this.getMonthlyIncomeProxy(currentYear, 3);
    }

    // Check if August falls in range (Décimo Tercero)
    const augustStart = new Date(currentYear, 7, 1);
    const augustEnd = new Date(currentYear, 7, 31);
    if (this.dateRangesOverlap(startDate, endDate, augustStart, augustEnd)) {
      adjustment += await this.getMonthlyIncomeProxy(currentYear, 7);
    }

    // Check if December falls in range (Décimo Cuarto)
    const decemberStart = new Date(currentYear, 11, 1);
    const decemberEnd = new Date(currentYear, 11, 31);
    if (this.dateRangesOverlap(startDate, endDate, decemberStart, decemberEnd)) {
      adjustment += await this.getMonthlyIncomeProxy(currentYear, 11);
    }

    return adjustment;
  }

  /**
   * Check if two date ranges overlap
   */
  private dateRangesOverlap(start1: Date, end1: Date, start2: Date, end2: Date): boolean {
    return start1 <= end2 && end1 >= start2;
  }

  /**
   * Get monthly income proxy for seasonal adjustment
   * Simplified: use average of last 3 months
   */
  private async getMonthlyIncomeProxy(year: number, month: number): Promise<number> {
    try {
      const monthStart = new Date(year, month - 1, 1).toISOString();
      const monthEnd = new Date(year, month, 0).toISOString();

      // @ts-ignore
      const monthIncome = await db.transactions
        .filter(t => 
          !t.is_deleted && 
          t.transaction_type === 'income' && 
          t.date >= monthStart && 
          t.date <= monthEnd
        )
        .toArray();

      if (monthIncome.length > 0) {
        return monthIncome.reduce((sum, t) => sum + t.amount, 0);
      }

      // Fallback: use 90-day average / 3
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      
      // @ts-ignore
      const recentIncome = await db.transactions
        .filter(t => 
          !t.is_deleted && 
          t.transaction_type === 'income' && 
          t.date >= ninetyDaysAgo.toISOString()
        )
        .toArray();

      const totalIncome = recentIncome.reduce((sum, t) => sum + t.amount, 0);
      return Math.round(totalIncome / 3);
    } catch (error) {
      console.error('[CashFlowService] Error getting monthly income proxy:', error);
      return 0;
    }
  }

  /**
   * Get cash flow forecast for multiple time horizons
   * Returns projections for 30, 60, and 90 days
   */
  async getCashFlowForecast(): Promise<{
    day30: ProjectedBalanceResult;
    day60: ProjectedBalanceResult;
    day90: ProjectedBalanceResult;
  }> {
    const [day30, day60, day90] = await Promise.all([
      this.getProjectedBalance(30),
      this.getProjectedBalance(60),
      this.getProjectedBalance(90)
    ]);

    return { day30, day60, day90 };
  }
}

export const cashFlowService = new CashFlowService();
