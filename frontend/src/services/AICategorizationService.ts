/**
 * AI Categorization Service - Thin Client
 * Zero-Knowledge AI integration with privacy-first sanitization
 * All caching handled by backend - no local persistence
 */

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
 * Categorize transaction using AI with privacy-first sanitization
 * Thin Client: Pipeline: Sanitize → Call Backend AI → Stash Hydration Map
 * No local caching - backend handles all caching
 */
export async function categorizeTransaction(
  request: CategorizationRequest
): Promise<{ result: CategorizationResult; transactionId: string }> {
  const transactionId = uuidv4();
  
  // Step 1: Sanitize description (privacy layer)
  const { sanitized, hydrationMap } = prepareForAI({
    description: request.description,
    amount: request.amount,
  });
  
  // Step 2: Call backend AI service
  try {
    // Import API dynamically to avoid circular dependencies
    const { aiAPI } = await import('./api');
    
    const response = await aiAPI.batchCategoryMapping({
      descriptions: [sanitized.description],
    });
    
    const aiResult = response.data?.mapping?.[sanitized.description];
    
    if (!aiResult) {
      throw new Error('No AI categorization result received');
    }
    
    // Step 3: Stash hydration map for later rehydration
    hydrationStash.set(transactionId, hydrationMap);
    
    return {
      result: {
        category_id: aiResult || request.category_id || 'otros',
        confidence: 0.8,
        is_anomaly: false,
        reasoning: 'Categorizado por lote con IA',
      },
      transactionId,
    };
  } catch (error) {
    console.error('[Thin Client] AI categorization error:', error);
    
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
 * Replaces tokens with original values from stash
 */
export function hydrateCategorizationResult(
  transactionId: string,
  reasoning: string
): string {
  const hydrationMap = hydrationStash.get(transactionId);
  
  if (!hydrationMap) {
    console.warn('[Thin Client] No hydration map found for transaction:', transactionId);
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
  console.debug('[Thin Client] Cleared all hydration maps');
}

/**
 * Get hydration map for a transaction (for debugging)
 */
export function getHydrationMap(transactionId: string): Map<string, string> | undefined {
  return hydrationStash.get(transactionId);
}

/**
 * Validate AI cache integrity - Thin Client neutralized version
 * Backend handles all caching and integrity validation
 * This function is a no-op to maintain compatibility with App.tsx
 */
export async function validateCacheIntegrity(): Promise<{ deleted: number }> {
  console.log('⚡ Verificación de integridad de caché de IA omitida (gestionada por el backend).');
  return { deleted: 0 };
}
