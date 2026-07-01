/**
 * Search Service - High-Performance Indexed Search
 * Local-first search using Dexie compound indexes with multiEntry
 * O(log N) search for 50k+ records
 */

import { db } from '../db/db';

export interface SearchResult {
  type: 'transaction' | 'category' | 'account';
  id: string;
  title: string;
  subtitle?: string;
  amount_cents?: number;
  date?: string;
}

export class SearchService {
  private searchCache: Map<string, SearchResult[]> = new Map();
  private cacheTimeout: number = 30000; // 30s cache

  /**
   * Global search using indexed multiEntry description_words
   * O(log N) performance using Dexie where() with startsWith
   */
  async search(query: string): Promise<SearchResult[]> {
    if (!query || query.length < 2) {
      return [];
    }

    const cacheKey = query.toLowerCase();
    const cached = this.searchCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const results: SearchResult[] = [];
    const queryLower = query.toLowerCase();

    try {
      // Search transactions using indexed description_words (O(log N))
      const transactions = await db.transactions
        .where('description_words')
        .startsWithIgnoreCase(queryLower)
        .limit(50)
        .toArray();

      for (const t of transactions) {
        results.push({
          type: 'transaction',
          id: t.id,
          title: t.description || 'Sin descripción',
          subtitle: new Date(t.date).toLocaleDateString(),
          amount_cents: t.amount,
          date: t.date
        });
      }

      // Search categories (small table, filter OK)
      const categories = await db.categories
        .filter(c => !c.is_deleted && c.name?.toLowerCase().includes(queryLower))
        .limit(20)
        .toArray();

      for (const c of categories) {
        results.push({
          type: 'category',
          id: c.id,
          title: c.name || 'Sin nombre',
          subtitle: 'Categoría'
        });
      }

      // Search accounts (small table, filter OK)
      const accounts = await db.accounts
        .filter(a => !a.is_deleted && a.name?.toLowerCase().includes(queryLower))
        .limit(20)
        .toArray();

      for (const a of accounts) {
        results.push({
          type: 'account',
          id: a.id,
          title: a.name || 'Sin nombre',
          subtitle: `Balance: $${Math.round(a.balance / 100)}`
        });
      }

      // Cache results
      this.searchCache.set(cacheKey, results);
      
      // Clear cache after timeout
      setTimeout(() => this.searchCache.delete(cacheKey), this.cacheTimeout);

      return results.slice(0, 100); // Limit to 100 results
    } catch (error) {
      console.error('[SearchService] Error searching:', error);
      return [];
    }
  }

  /**
   * Clear search cache
   */
  clearCache(): void {
    this.searchCache.clear();
  }
}

export const searchService = new SearchService();