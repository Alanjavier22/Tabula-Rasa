/**
 * AI Cash Flow Service
 * Bridge between CashFlowService and AI Assistant
 * Prepares Safe-to-Spend context with privacy sanitization
 */

import { cashFlowService, type ProjectedBalanceResult } from './CashFlowService';
import { prepareForAI } from '../utils/privacy';
import { assetDepreciationService } from './AssetDepreciationService';

export interface AICashFlowContext {
  current_balance_cents: number;
  safe_to_spend_30d: number;
  safe_to_spend_60d: number;
  safe_to_spend_90d: number;
  projected_income_30d: number;
  projected_expenses_30d: number;
  seasonal_adjustment_30d: number;
  subscriptions_due_30d: number;
  ious_pending_30d: number;
  assets_total_value_cents: number;
  assets_details: Array<{
    name: string;
    purchase_price_cents: number;
    current_value_cents: number;
    is_fully_depreciated: boolean;
  }>;
  hydrationMap: Map<string, string>;
}

export class AICashFlowService {
  /**
   * Get AI-ready context for Cash Flow queries
   * Returns sanitized data + hydration map for response reversal
   */
  async getAIContext(): Promise<AICashFlowContext> {
    const forecast = await cashFlowService.getCashFlowForecast();

    // Get assets with current values
    const assetsWithValues = await assetDepreciationService.getAllAssetsWithValues();
    const assetsTotalValueCents = assetsWithValues.reduce((sum, asset) => sum + asset.current_value_cents, 0);

    const rawData = {
      current_balance_cents: forecast.day30.current_balance,
      safe_to_spend_30d: forecast.day30.projected_balance,
      safe_to_spend_60d: forecast.day60.projected_balance,
      safe_to_spend_90d: forecast.day90.projected_balance,
      projected_income_30d: forecast.day30.projected_income,
      projected_expenses_30d: forecast.day30.projected_expenses,
      seasonal_adjustment_30d: forecast.day30.seasonal_adjustment,
      subscriptions_due_30d: forecast.day30.breakdown.subscriptions,
      ious_pending_30d: forecast.day30.breakdown.ious,
      assets_total_value_cents: assetsTotalValueCents,
      assets_details: assetsWithValues.map(a => ({
        name: a.asset_name,
        purchase_price_cents: a.purchase_price_cents,
        current_value_cents: a.current_value_cents,
        is_fully_depreciated: a.is_fully_depreciated,
      })),
    };

    // Sanitize with privacy layer (though numeric data has no PII, this prepares for future extensions)
    const { sanitized, hydrationMap } = prepareForAI(rawData);

    return {
      ...sanitized,
      hydrationMap,
    };
  }

  /**
   * Get specific Safe-to-Spend calculation for N days
   */
  async getSafeToSpend(days: 30 | 60 | 90): Promise<{ safe_to_spend_cents: number; hydrationMap: Map<string, string> }> {
    const projection = await cashFlowService.getProjectedBalance(days);
    
    const rawData = {
      safe_to_spend_cents: projection.projected_balance,
    };

    const { sanitized, hydrationMap } = prepareForAI(rawData);

    return {
      safe_to_spend_cents: sanitized.safe_to_spend_cents,
      hydrationMap,
    };
  }
}

export const aiCashFlowService = new AICashFlowService();
