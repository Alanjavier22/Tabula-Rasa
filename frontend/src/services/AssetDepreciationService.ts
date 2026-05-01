/**
 * Asset Depreciation Service
 * Calculates current asset value using straight-line depreciation
 * Precision: multiply first, divide later to avoid cent loss
 */

import { db } from '../db/db';

export interface AssetValueResult {
  asset_id: string;
  asset_name: string;
  purchase_price_cents: number;
  current_value_cents: number;
  depreciation_accumulated_cents: number;
  months_elapsed: number;
  is_fully_depreciated: boolean;
}

export class AssetDepreciationService {
  /**
   * Calculate current value of an asset at a given date
   * Formula: current_value = purchase_price - ((purchase_price - residual) * months_elapsed / life_months)
   * Precision: multiply first, divide later
   */
  async calculateCurrentValue(assetId: string, asOfDate: Date = new Date()): Promise<AssetValueResult> {
    // @ts-ignore
    const asset = await db.assets.get(assetId);
    if (!asset || asset.is_deleted) {
      throw new Error(`Asset not found: ${assetId}`);
    }

    const purchaseDate = new Date(asset.purchase_date);
    const monthsElapsed = this.calculateMonthsElapsed(purchaseDate, asOfDate);

    // Base depreciable: purchase_price - residual_value
    const depreciableBase = asset.purchase_price_cents - asset.residual_value_cents;

    let currentValue: number;
    let depreciationAccumulated: number;
    let isFullyDepreciated = false;

    if (monthsElapsed >= asset.estimated_life_months) {
      // Asset fully depreciated - value = residual_value (minimum, never negative)
      currentValue = asset.residual_value_cents;
      depreciationAccumulated = depreciableBase;
      isFullyDepreciated = true;
    } else {
      // Precision: multiply first, divide later to avoid cent loss
      // depreciation = (depreciable_base * months_elapsed) / estimated_life_months
      const depreciation = Math.floor((depreciableBase * monthsElapsed) / asset.estimated_life_months);
      currentValue = asset.purchase_price_cents - depreciation;
      depreciationAccumulated = depreciation;

      // Safety: ensure current value never below residual
      if (currentValue < asset.residual_value_cents) {
        currentValue = asset.residual_value_cents;
        depreciationAccumulated = depreciableBase;
        isFullyDepreciated = true;
      }
    }

    return {
      asset_id: asset.id,
      asset_name: asset.name,
      purchase_price_cents: asset.purchase_price_cents,
      current_value_cents: currentValue,
      depreciation_accumulated_cents: depreciationAccumulated,
      months_elapsed: monthsElapsed,
      is_fully_depreciated: isFullyDepreciated,
    };
  }

  /**
   * Calculate total current value of all assets at a given date
   */
  async getTotalAssetsValue(asOfDate: Date = new Date()): Promise<number> {
    // @ts-ignore
    const assets = await db.assets.filter(a => !a.is_deleted).toArray();
    
    let totalValue = 0;
    for (const asset of assets) {
      const result = await this.calculateCurrentValue(asset.id, asOfDate);
      totalValue += result.current_value_cents;
    }

    return totalValue;
  }

  /**
   * Calculate months elapsed between two dates
   */
  private calculateMonthsElapsed(startDate: Date, endDate: Date): number {
    const startYear = startDate.getFullYear();
    const startMonth = startDate.getMonth();
    const endYear = endDate.getFullYear();
    const endMonth = endDate.getMonth();

    return (endYear - startYear) * 12 + (endMonth - startMonth);
  }

  /**
   * Get all assets with their current values
   */
  async getAllAssetsWithValues(asOfDate: Date = new Date()): Promise<AssetValueResult[]> {
    // @ts-ignore
    const assets = await db.assets.filter(a => !a.is_deleted).toArray();
    
    const results: AssetValueResult[] = [];
    for (const asset of assets) {
      const value = await this.calculateCurrentValue(asset.id, asOfDate);
      results.push(value);
    }

    return results;
  }
}

export const assetDepreciationService = new AssetDepreciationService();
