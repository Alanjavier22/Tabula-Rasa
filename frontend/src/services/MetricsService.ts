/**
 * Metrics Service - DEPRECATED: Thin Client Architecture
 * 
 * This service previously used IndexedDB for local calculations.
 * In Thin Client architecture, all calculations are performed by the backend.
 * Use metricsAPI from api.ts instead.
 * 
 * Kept for reference only - DO NOT USE in production.
 */

// import { db } from '../db/db'; // REMOVED: Thin Client
// import { vehicleService } from './VehicleService'; // REMOVED: Thin Client
// import { currencyService } from './CurrencyService'; // REMOVED: Thin Client

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
   * DEPRECATED: Use metricsAPI.getSafeToSpend() from api.ts instead
   * Backend performs all calculations as the Single Source of Truth
   */
  async getSafeToSpend(): Promise<SafeToSpendResult> {
    throw new Error('MetricsService.getSafeToSpend() is deprecated. Use metricsAPI.getSafeToSpend() from api.ts instead. Thin Client architecture requires all calculations to be performed by the backend.');
  }
}

export const metricsService = new MetricsService();
