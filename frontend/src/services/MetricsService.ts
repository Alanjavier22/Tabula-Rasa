/**
 * Metrics Service - Seasonal Safe-to-Spend with Ecuadorian Context
 * Handles predictive analytics for financial decisions
 */

import { db } from '../db/db';
import { vehicleService } from './VehicleService';
import { currencyService } from './CurrencyService';

export interface SafeToSpendResult {
  current_balance: number;
  projected_income: number;
  monthly_budgets: number;
  pending_debts: number;
  seasonal_projection: number;
  vehicle_maintenance_projection: number;
  base_safe_to_spend: number;
  ai_adjusted_safe_to_spend: number;
  days_until_month_end: number;
  prediction: 'positive' | 'negative';
}

export class MetricsService {
  /**
   * Calculate seasonal projection based on Ecuadorian calendar
   * April: UTILIDADES (profits/bonuses)
   * August: DECIMO TERCERO (13th salary - first half)
   * December: DECIMO CUARTO (14th salary - second half)
   * Normalizes all amounts to base currency
   */
  private async getSeasonalProjection(currentMonth: number, currentYear: number): Promise<number> {
    let projection = 0;
    const baseCurrency = await currencyService.getBaseCurrency();

    // Get historical transactions for the same month in previous years
    // @ts-ignore
    const historicalTxns = await db.transactions
      .filter(t => !t.is_deleted && t.transaction_type === 'income')
      .toArray();

    const seasonalMonths = historicalTxns.filter(t => {
      const date = new Date(t.date);
      return date.getMonth() + 1 === currentMonth && date.getFullYear() < currentYear;
    });

    if (seasonalMonths.length > 0) {
      // Convert all to base currency before averaging
      let totalSeasonalIncome = 0;
      for (const txn of seasonalMonths) {
        const amountInBase = await currencyService.convertToBase(
          txn.amount,
          baseCurrency,
          txn.date
        );
        totalSeasonalIncome += amountInBase;
      }
      projection = Math.round(totalSeasonalIncome / seasonalMonths.length);
    }

    // Ecuador-specific adjustments
    if (currentMonth === 4) {
      // April: UTILIDADES - typically 1-2 months salary
      projection = Math.max(projection, 200000); // Minimum $2000
    } else if (currentMonth === 8 || currentMonth === 12) {
      // August/December: DECIMO - typically 1/12 of annual salary
      const decimoTxns = seasonalMonths.filter(t =>
        t.description?.toLowerCase().includes('decimo')
      );
      if (decimoTxns.length > 0) {
        let totalDecimo = 0;
        for (const txn of decimoTxns) {
          const amountInBase = await currencyService.convertToBase(
            txn.amount,
            baseCurrency,
            txn.date
          );
          totalDecimo += amountInBase;
        }
        const avgDecimo = Math.round(totalDecimo / decimoTxns.length);
        projection = Math.max(projection, avgDecimo);
      }
    }

    return projection;
  }

  /**
   * Calculate projected vehicle maintenance cost
   * If current odometer within 500km of 5000km multiple, reserve avg maintenance cost
   */
  private async getVehicleMaintenanceProjection(): Promise<number> {
    try {
      // @ts-ignore
      const vehicles = await db.vehicles.filter(v => !v.is_deleted).toArray();
      
      let totalProjection = 0;

      for (const vehicle of vehicles) {
        const currentOdometer = vehicle.current_odometer;
        
        // Check if within 500km of a 5000km multiple
        const nextMaintenanceThreshold = Math.ceil(currentOdometer / 5000) * 5000;
        const distanceToThreshold = nextMaintenanceThreshold - currentOdometer;

        if (distanceToThreshold <= 500) {
          // Get average maintenance cost for this vehicle
          const stats = await vehicleService.calculateVehicleStats(vehicle.id);
          const avgMaintenanceCost = stats.total_maintenance_logs > 0
            ? Math.round(stats.total_cost_cents / stats.total_maintenance_logs / 100) // Convert to dollars
            : 100; // Default $100 if no history

          totalProjection += avgMaintenanceCost;
        }
      }

      return totalProjection;
    } catch (error) {
      console.error('Error calculating vehicle maintenance projection:', error);
      return 0;
    }
  }

  /**
   * Calculate pending IOUs for current month
   * Normalizes all amounts to base currency
   */
  private async getPendingIOUs(): Promise<number> {
    const now = new Date().toISOString();

    // @ts-ignore
    const ious = await db.ious
      .filter(i => !i.is_deleted && i.amount > (i.amount_paid || 0))
      .toArray();

    let totalPending = 0;

    for (const iou of ious) {
      // Convert to base currency
      const amountInBase = await currencyService.convertToBase(
        iou.amount - (iou.amount_paid || 0),
        'USD', // IOUs typically in USD, fallback to base if needed
        now
      );
      totalPending += amountInBase;
    }

    return totalPending;
  }

  /**
   * Enhanced Safe-to-Spend calculation with seasonal awareness
   * Normalizes all amounts to base currency
   */
  async getSafeToSpend(): Promise<SafeToSpendResult> {
    const baseCurrency = await currencyService.getBaseCurrency();
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // Fetch local data
    // @ts-ignore
    const accounts = await db.accounts.filter(a => !a.is_deleted).toArray();
    // @ts-ignore
    const budgets = await db.budgets.filter(b => !b.is_deleted).toArray();

    // Convert account balances to base currency
    let currentBalance = 0;
    for (const account of accounts) {
      const balanceInBase = await currencyService.convertToBase(
        account.balance,
        account.currency || baseCurrency,
        now.toISOString()
      );
      currentBalance += balanceInBase;
    }

    // Convert monthly budgets to base currency
    let monthlyBudgets = 0;
    for (const budget of budgets) {
      const budgetInBase = await currencyService.convertToBase(
        budget.amount,
        baseCurrency,
        now.toISOString()
      );
      monthlyBudgets += budgetInBase;
    }

    const pendingDebts = await this.getPendingIOUs();
    const seasonalProjection = await this.getSeasonalProjection(currentMonth, currentYear);
    const vehicleMaintenanceProjection = await this.getVehicleMaintenanceProjection();

    // Calculate days until month end
    const lastDayOfMonth = new Date(currentYear, currentMonth, 0).getDate();
    const daysUntilMonthEnd = lastDayOfMonth - now.getDate();

    // Base calculation
    const baseSafeToSpend = currentBalance - monthlyBudgets - pendingDebts + seasonalProjection - vehicleMaintenanceProjection;

    // AI adjustment (placeholder - could integrate with AI service)
    const aiAdjustedSafeToSpend = baseSafeToSpend;

    const prediction = aiAdjustedSafeToSpend > 0 ? 'positive' : 'negative';

    return {
      current_balance: currentBalance,
      projected_income: seasonalProjection,
      monthly_budgets: monthlyBudgets,
      pending_debts: pendingDebts,
      seasonal_projection: seasonalProjection,
      vehicle_maintenance_projection: vehicleMaintenanceProjection,
      base_safe_to_spend: baseSafeToSpend,
      ai_adjusted_safe_to_spend: aiAdjustedSafeToSpend,
      days_until_month_end: daysUntilMonthEnd,
      prediction
    };
  }
}

export const metricsService = new MetricsService();
