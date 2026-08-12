/**
 * Currency Service - Multi-currency Support
 * Handles currency conversion and exchange rate management
 */

import { db } from '../db/db';
import { v4 as uuidv4 } from 'uuid';

export class CurrencyService {
  /**
   * Get base currency from config (default: USD)
   */
  async getBaseCurrency(): Promise<string> {
    try {
      const config = await db.config.where('key').equals('base_currency').first();
      return config?.value || 'USD';
    } catch (error) {
      console.error('[CurrencyService] Error getting base currency:', error);
      return 'USD';
    }
  }

  /**
   * Set base currency
   */
  async setBaseCurrency(currency: string): Promise<void> {
    try {
      const now = new Date().toISOString();
      const existing = await db.config.where('key').equals('base_currency').first();

      if (existing) {
        await db.config.update(existing.id, {
          value: currency,
          updated_at: now
        });
      } else {
        await db.config.add({
          id: uuidv4(),
          key: 'base_currency',
          value: currency,
          is_deleted: false,
          updated_at: now
        });
      }
    } catch (error) {
      console.error('[CurrencyService] Error setting base currency:', error);
    }
  }

  /**
   * Get exchange rate for a currency pair at a specific date
   * Returns rate to convert fromCurrency to toCurrency
   */
  async getExchangeRate(fromCurrency: string, toCurrency: string, date: string): Promise<number> {
    if (fromCurrency === toCurrency) {
      return 1;
    }

    try {
      const pair = `${fromCurrency}-${toCurrency}`;
      const dateObj = new Date(date);

      const rate = await db.exchange_rates
        .where('pair')
        .equals(pair)
        .filter(r => !r.is_deleted && new Date(r.timestamp) <= dateObj)
        .reverse()
        .first();

      if (rate) {
        return rate.rate;
      }

      // Try inverse pair
      const inversePair = `${toCurrency}-${fromCurrency}`;
      const inverseRate = await db.exchange_rates
        .where('pair')
        .equals(inversePair)
        .filter(r => !r.is_deleted && new Date(r.timestamp) <= dateObj)
        .reverse()
        .first();

      if (inverseRate) {
        return 1 / inverseRate.rate;
      }

      // Fallback: return 1 (same currency assumption)
      console.warn(`[CurrencyService] No exchange rate found for ${pair} at ${date}`);
      return 1;
    } catch (error) {
      console.error('[CurrencyService] Error getting exchange rate:', error);
      return 1;
    }
  }

  /**
   * Convert amount from source currency to base currency
   * All amounts in CENTS (integer)
   */
  async convertToBase(amountCents: number, fromCurrency: string, date: string): Promise<number> {
    const baseCurrency = await this.getBaseCurrency();
    
    if (fromCurrency === baseCurrency) {
      return amountCents;
    }

    const rate = await this.getExchangeRate(fromCurrency, baseCurrency, date);
    return Math.round(amountCents * rate);
  }

  /**
   * Convert amount from base currency to target currency
   * All amounts in CENTS (integer)
   */
  async convertFromBase(amountCents: number, toCurrency: string, date: string): Promise<number> {
    const baseCurrency = await this.getBaseCurrency();
    
    if (toCurrency === baseCurrency) {
      return amountCents;
    }

    const rate = await this.getExchangeRate(baseCurrency, toCurrency, date);
    return Math.round(amountCents * rate);
  }

  /**
   * Add or update exchange rate
   */
  async setExchangeRate(pair: string, rate: number, timestamp: string): Promise<void> {
    try {
      const now = new Date().toISOString();
      const existing = await db.exchange_rates.where('pair').equals(pair).first();

      if (existing) {
        await db.exchange_rates.update(existing.id, {
          rate,
          timestamp,
          updated_at: now
        });
      } else {
        await db.exchange_rates.add({
          id: uuidv4(),
          pair,
          rate,
          timestamp,
          is_deleted: false,
          updated_at: now
        });
      }

      // Mark snapshots as stale (currency change affects net worth)
      // This is handled by the transaction hooks when rates are updated
    } catch (error) {
      console.error('[CurrencyService] Error setting exchange rate:', error);
    }
  }

  /**
   * Get all exchange rates
   */
  async getAllExchangeRates(): Promise<any[]> {
    try {
      return await db.exchange_rates
        .filter(r => !r.is_deleted)
        .toArray();
    } catch (error) {
      console.error('[CurrencyService] Error getting exchange rates:', error);
      return [];
    }
  }
}

export const currencyService = new CurrencyService();
