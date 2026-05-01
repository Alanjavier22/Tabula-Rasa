/**
 * AI Categorization Service - FASE 4
 * Zero-Knowledge AI integration with privacy-first sanitization
 * Caches results locally to avoid redundant API calls
 */

import { db } from '../db/db';
import { prepareForAI, hydrateAIResponse, clearHydrationMap } from '../utils/privacy';
import { v4 as uuidv4 } from 'uuid';

export interface CategorizationRequest {
  description: string;
  amount: number;
  category_id?: string | null;
}

export interface CategorizationResult {
  category_id: string;
  confidence: number;
  is_anomaly: boolean;
  reasoning: string;
  hydrated_reasoning?: string;
}

export interface StashedHydrationMap {
  transactionId: string;
  hydrationMap: Map<string, string>;
  timestamp: string;
}

// In-memory stash for hydration maps (cleared after each transaction)
const hydrationStash = new Map<string, Map<string, string>>();

/**
 * Generate cache key from sanitized description and amount
 */
function generateCacheKey(sanitizedDescription: string, amount: number): string {
  const data = `${sanitizedDescription}|${amount}`;
  // Simple hash for cache key
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Check cache for existing categorization result
 */
async function checkCache(sanitizedDescription: string, amount: number): Promise<CategorizationResult | null> {
  try {
    const cacheKey = generateCacheKey(sanitizedDescription, amount);
    const now = new Date().toISOString();
    
    // @ts-ignore
    const cached = await db.ai_cache.get(cacheKey);
    
    if (cached) {
      // Check if cache entry is expired (30 days)
      if (cached.expires_at < now) {
        // Delete expired entry
        // @ts-ignore
        await db.ai_cache.delete(cacheKey);
        return null;
      }
      
      console.debug('[FASE-4] Cache hit for:', sanitizedDescription);
      return {
        category_id: cached.category_id,
        confidence: cached.confidence,
        is_anomaly: cached.is_anomaly,
        reasoning: cached.reasoning,
      };
    }
    
    return null;
  } catch (error) {
    console.error('[FASE-4] Cache check error:', error);
    return null;
  }
}

/**
 * Store categorization result in cache
 */
async function storeCache(
  sanitizedDescription: string,
  amount: number,
  result: CategorizationResult
): Promise<void> {
  try {
    const cacheKey = generateCacheKey(sanitizedDescription, amount);
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
    
    // @ts-ignore
    await db.ai_cache.put({
      id: cacheKey,
      sanitized_description: sanitizedDescription,
      category_id: result.category_id,
      confidence: result.confidence,
      is_anomaly: result.is_anomaly,
      reasoning: result.reasoning,
      cached_at: now,
      expires_at: expiresAt,
    });
    
    console.debug('[FASE-4] Cached categorization for:', sanitizedDescription);
  } catch (error) {
    console.error('[FASE-4] Cache store error:', error);
  }
}

/**
 * Clean expired cache entries
 */
export async function cleanExpiredCache(): Promise<void> {
  try {
    const now = new Date().toISOString();
    // @ts-ignore
    const expired = await db.ai_cache.where('expires_at').below(now).toArray();
    
    if (expired.length > 0) {
      const ids = expired.map((e: any) => e.id);
      // @ts-ignore
      await db.ai_cache.bulkDelete(ids);
      console.debug(`[FASE-4] Cleaned ${expired.length} expired cache entries`);
    }
  } catch (error) {
    console.error('[FASE-4] Cache cleanup error:', error);
  }
}

/**
 * Categorize transaction using AI with privacy-first sanitization
 * FASE 4: Pipeline: Sanitize → Check Cache → Call AI → Store Cache → Stash Hydration Map
 */
export async function categorizeTransaction(
  request: CategorizationRequest
): Promise<{ result: CategorizationResult; transactionId: string }> {
  const transactionId = uuidv4();
  
  // Step 1: Sanitize description (FASE 4 privacy layer)
  const { sanitized, hydrationMap } = prepareForAI({
    description: request.description,
    amount: request.amount,
  });
  
  // Step 2: Check cache first (avoid redundant API calls)
  const cached = await checkCache(sanitized.description, request.amount);
  if (cached) {
    // Stash hydration map for later rehydration
    hydrationStash.set(transactionId, hydrationMap);
    return { result: cached, transactionId };
  }
  
  // Step 3: Call backend AI service
  try {
    // Import API dynamically to avoid circular dependencies
    const { aiAPI } = await import('./api');
    
    // Fetch categories from local DB
    // @ts-ignore
    const categories = await db.categories.toArray();
    const categoryList = categories.map((cat: any) => ({
      id: cat.id,
      name: cat.name,
    }));
    
    const response = await aiAPI.suggestCategories({
      transactions: [
        {
          id: transactionId,
          description: sanitized.description,
          amount: request.amount,
          date: new Date().toISOString(),
        },
      ],
      categories: categoryList,
    });
    
    const aiResult = response.data[0];
    
    // Step 4: Store in cache
    await storeCache(sanitized.description, request.amount, {
      category_id: aiResult.suggested_category_id,
      confidence: aiResult.confidence,
      is_anomaly: aiResult.is_anomaly || false,
      reasoning: aiResult.reasoning || '',
    });
    
    // Step 5: Stash hydration map for later rehydration
    hydrationStash.set(transactionId, hydrationMap);
    
    return {
      result: {
        category_id: aiResult.suggested_category_id,
        confidence: aiResult.confidence,
        is_anomaly: aiResult.is_anomaly || false,
        reasoning: aiResult.reasoning || '',
      },
      transactionId,
    };
  } catch (error) {
    console.error('[FASE-4] AI categorization error:', error);
    
    // Fallback: return default categorization
    const fallbackResult: CategorizationResult = {
      category_id: request.category_id || 'otros',
      confidence: 0.5,
      is_anomaly: false,
      reasoning: 'Error de IA - usando categoría por defecto',
    };
    
    hydrationStash.set(transactionId, hydrationMap);
    return { result: fallbackResult, transactionId };
  }
}

/**
 * Hydrate AI response for user-facing display
 * FASE 4: Replaces tokens with original values from stash
 */
export function hydrateCategorizationResult(
  transactionId: string,
  reasoning: string
): string {
  const hydrationMap = hydrationStash.get(transactionId);
  
  if (!hydrationMap) {
    console.warn('[FASE-4] No hydration map found for transaction:', transactionId);
    return reasoning;
  }
  
  const hydrated = hydrateAIResponse(reasoning, hydrationMap);
  
  // Clear hydration map after use (prevent memory leaks)
  clearHydrationMap(hydrationMap);
  hydrationStash.delete(transactionId);
  
  return hydrated;
}

/**
 * Clear all hydration maps (call after transaction completion)
 */
export function clearAllHydrationMaps(): void {
  for (const [transactionId, hydrationMap] of hydrationStash.entries()) {
    clearHydrationMap(hydrationMap);
    hydrationStash.delete(transactionId);
  }
  console.debug('[FASE-4] Cleared all hydration maps');
}

/**
 * Get hydration map for a transaction (for debugging)
 */
export function getHydrationMap(transactionId: string): Map<string, string> | undefined {
  return hydrationStash.get(transactionId);
}

/**
 * FASE 7: Validate AI cache integrity
 * Cross-references ai_cache category_ids with categories table
 * Deletes orphaned entries (category_ids that no longer exist)
 * Must run in read-only transaction to avoid prolonged blocking
 */
export async function validateCacheIntegrity(): Promise<{ deleted: number; checked: number }> {
  try {
    // @ts-ignore
    const allCacheEntries = await db.ai_cache.toArray();
    // @ts-ignore
    const allCategories = await db.categories.toArray();
    const validCategoryIds = new Set(allCategories.map((c: any) => c.id));
    
    let deletedCount = 0;
    const orphanedIds: string[] = [];
    
    // Identify orphaned entries
    for (const entry of allCacheEntries) {
      if (!validCategoryIds.has(entry.category_id)) {
        orphanedIds.push(entry.id);
      }
    }
    
    // Delete orphaned entries in a single transaction
    if (orphanedIds.length > 0) {
      // @ts-ignore
      await db.transaction('rw', db.ai_cache, async () => {
        // @ts-ignore
        await db.ai_cache.bulkDelete(orphanedIds);
      });
      deletedCount = orphanedIds.length;
      console.log(`[FASE-7] AI cache integrity: deleted ${deletedCount} orphaned entries`);
    }
    
    return { deleted: deletedCount, checked: allCacheEntries.length };
  } catch (error) {
    console.error('[FASE-7] Error validating AI cache integrity:', error);
    return { deleted: 0, checked: 0 };
  }
}
