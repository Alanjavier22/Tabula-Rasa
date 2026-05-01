/**
 * Asset Depreciation Service
 * NOW: Thin client - calls backend API for depreciation calculations
 * Backend is the single source of truth for financial calculations
 */

import api from './api';

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
   * Calls backend API for calculation
   */
  async calculateCurrentValue(assetId: string): Promise<AssetValueResult> {
    const response = await api.get(`/metrics/assets/${assetId}/value`);
    return response.data;
  }

  /**
   * Calculate total current value of all assets at a given date
   * Calls backend API for calculation
   */
  async getTotalAssetsValue(): Promise<number> {
    const response = await api.get('/metrics/assets/total');
    return response.data.total_value_cents;
  }

  /**
   * Get all assets with their current values
   * Calls backend API for calculation
   */
  async getAllAssetsWithValues(): Promise<AssetValueResult[]> {
    const response = await api.get('/metrics/assets/total');
    return response.data.assets;
  }
}

export const assetDepreciationService = new AssetDepreciationService();
