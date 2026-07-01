/**
 * Privacy-First Sanitization Layer
 * FASE 4: Async-Safe - No global state, all state injected via parameters
 * Masks PII before sending to external AI APIs
 * Reversible hydration with unique incremental tokens per call
 */

// FASE 4: Token counters interface - must be passed to all functions (Async-Safety)
interface TokenCounters {
  person: number;
  account: number;
  location: number;
}

/**
 * Validate Ecuadorian ID (Cédula/RUC) using Módulo 10 algorithm
 * FASE 4: Fixed validation for province codes (01-24 or 30) and RUC suffix (001)
 * O(n) time complexity - highly efficient
 * Returns true if the ID passes validation
 */
export function isValidEcuadorianID(id: string): boolean {
  const cleaned = id.replace(/\D/g, '');
  
  // Cédula: 10 digits, RUC: 13 digits
  if (cleaned.length !== 10 && cleaned.length !== 13) return false;
  
  // For RUC, validate first 10 digits (same as Cédula) and check 001 suffix
  if (cleaned.length === 13) {
    const suffix = cleaned.substring(10);
    if (suffix !== '001') return false; // RUC must end in 001
  }
  
  const digitsToValidate = cleaned.length === 13 ? cleaned.substring(0, 10) : cleaned;
  const digits = digitsToValidate.split('').map(Number);
  
  // FASE 4: Province code validation (01-24 or 30)
  const provinceCode = parseInt(digitsToValidate.substring(0, 2), 10);
  if ((provinceCode < 1 || provinceCode > 24) && provinceCode !== 30) return false;
  
  // FASE 4: Third digit validation
  // 0-5: natural persons
  // 6-8: juridical persons (private companies)
// 9: public entities
  const thirdDigit = digits[2];
  if (thirdDigit < 0 || thirdDigit > 9) return false;
  
  // Módulo 10 algorithm
  const coefficients = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  let sum = 0;
  
  for (let i = 0; i < 9; i++) {
    let product = digits[i] * coefficients[i];
    if (product >= 10) {
      product = product - 9;
    }
    sum += product;
  }
  
  const remainder = sum % 10;
  const checkDigit = remainder === 0 ? 0 : 10 - remainder;
  
  const isValid = checkDigit === digits[9];
  console.debug('[FASE-4] Ecuadorian ID validation:', id, isValid, 'type:', cleaned.length === 13 ? 'RUC' : 'Cédula');
  return isValid;
}

// Account number patterns (credit cards, bank accounts)
const ACCOUNT_PATTERNS = [
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, // 16-digit credit cards
  /\b\d{4}[- ]?\d{6}[- ]?\d{5}\b/g, // IBAN-like patterns
  /\b\d{10,12}\b/g, // 10-12 digit account numbers
  /\b(?:\d[ -]*?){13,19}\b/g, // Variable length card/account numbers
];

// Ecuador-specific PII patterns
const ECUADOR_PII_PATTERNS = [
  // Cédula (10 digits): 09xxxxxxx or 17xxxxxxx (province code)
  /\b(?:0[1-9]|1[0-9]|2[0-9]|3[0-1])\d{8}\b/g,
  // RUC (13 digits): same province prefix + 001 suffix
  /\b(?:0[1-9]|1[0-9]|2[0-9]|3[0-1])\d{8}001\b/g,
  // Long transaction IDs (Pichincha/Guayaquil/Pacífico bank references)
  /\b[A-Z]{2,4}\d{10,20}\b/g, // Bank transaction IDs like PI1234567890123
  /\b\d{15,25}\b/g, // Very long numeric transaction references
];

// Common stop words (Spanish/English) that should NOT be masked
const STOP_WORDS = new Set([
  // Spanish
  'pago', 'pagado', 'pagar', 'compra', 'comprado', 'comprar',
  'deposito', 'depositado', 'depositar', 'retiro', 'retirado', 'retirar',
  'transferencia', 'transferido', 'transferir', 'venta', 'vendido', 'vender',
  'ingreso', 'ingresado', 'ingresar', 'gasto', 'gastado', 'gastar',
  'saldo', 'cuenta', 'tarjeta', 'banco', 'efectivo', 'dinero',
  'mes', 'año', 'dia', 'semana', 'hoy', 'ayer',
  'para', 'por', 'con', 'sin', 'sobre', 'desde', 'hasta', 'a', 'de', 'del',
  'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'y', 'o', 'pero', 'porque', 'cuando', 'donde', 'como',
  // English
  'payment', 'paid', 'pay', 'purchase', 'bought', 'buy',
  'deposit', 'withdrawal', 'transfer', 'sale', 'sold', 'sell',
  'income', 'expense', 'balance', 'account', 'card', 'bank', 'cash', 'money',
  'month', 'year', 'day', 'week', 'today', 'yesterday',
  'for', 'by', 'with', 'without', 'about', 'from', 'to', 'of',
  'the', 'a', 'an', 'and', 'or', 'but', 'because', 'when', 'where', 'how',
  // Ecuador Financial Context Allowlist (Banks)
  'pichincha', 'guayaquil', 'pacifico', 'bolivariano', 'produbanco', 'internacional',
  'bancodel', 'bco', 'banco',
  // Ecuador Retail/Commerce Allowlist (Stores)
  'supermaxi', 'mi', 'comisariato', 'de', 'prati', 'aqui', 'ak', 'la', 'favorita',
  'tía', 'mega', 'kywi', 'santa', 'maría',
  // Ecuador Financial Terms (AI Analytics Context)
  'nomina', 'decimo', 'utilidades', 'bono', 'reembolso', 'iess', 'sri',
  // Ecuador Document Types (Allowlist - these are document names, not the IDs themselves)
  'ci', 'ruc', 'cedula', 'comprobante', 'voucher', 'factura',
]);

/**
 * Mask account numbers and financial identifiers
 * FASE 4: Async-Safe - hydrationMap and counters injected as parameters
 * Returns { sanitized, hydrationMap } with incremental tokens
 */
function maskAccounts(text: string, hydrationMap: Map<string, string>, counters: TokenCounters): string {
  let sanitized = text;
  
  // First, mask Ecuador-specific PII (Cédula/RUC, bank transaction IDs)
  for (const pattern of ECUADOR_PII_PATTERNS) {
    sanitized = sanitized.replace(pattern, (match) => {
      counters.account++;
      // Only assign TAX_ID token if it passes validation
      if (isValidEcuadorianID(match)) {
        const token = `[TAX_ID_${counters.account}]`;
        hydrationMap.set(token, match);
        return token;
      } else {
        // Treat as generic account number if validation fails
        const token = `[ACCOUNT_${counters.account}]`;
        hydrationMap.set(token, match);
        return token;
      }
    });
  }
  
  // Then, mask general account patterns
  for (const pattern of ACCOUNT_PATTERNS) {
    sanitized = sanitized.replace(pattern, (match) => {
      counters.account++;
      const token = `[ACCOUNT_${counters.account}]`;
      hydrationMap.set(token, match);
      return token;
    });
  }
  return sanitized;
}
const NAME_PATTERNS = [
  /\b(A la|Al|De|Del|Para|Por|Con|Sin|Sobre|Desde|Hasta|Para|A)\s+[A-Z][a-záéíóúñ]+(?:\s+[A-Z][a-záéíóúñ]+)?\b/g, // Preposition + name
  /\b(Transferencia|Pago|Depósito|Retiro|Compra|Venta)\s+(a|de|para|desde)\s+[A-Z][a-záéíóúñ]+(?:\s+[A-Z][a-záéíóúñ]+)?\b/g, // Transaction + name
  /\b[A-Z][a-záéíóúñ]+\s+[A-Z][a-záéíóúñ]+\b(?=\s+(?:transferencia|pago|depósito|retiro|compra|venta))/gi, // Name before transaction type
];

/**
 * Mask personal names in transaction descriptions
 * FASE 4: Async-Safe - hydrationMap and counters injected as parameters
 * Context-agnostic: masks any capitalized word that isn't a stop word
 * Returns { sanitized, hydrationMap } with incremental tokens
 */
function maskNames(text: string, hydrationMap: Map<string, string>, counters: TokenCounters): string {
  let sanitized = text;

  // First, apply context-aware patterns
  for (const pattern of NAME_PATTERNS) {
    sanitized = sanitized.replace(pattern, (match) => {
      // Extract just the name part
      const nameMatch = match.match(/[A-Z][a-záéíóúñ]+(?:\s+[A-Z][a-záéíóúñ]+)?/gi);
      if (nameMatch) {
        counters.person++;
        const token = `[PERSON_${counters.person}]`;
        hydrationMap.set(token, nameMatch[0]);
        return match.replace(nameMatch[0], token);
      }
      return match;
    });
  }

  // Then, apply context-agnostic masking for any capitalized word not in stop words
  const capitalizedWordPattern = /\b[A-Z][a-záéíóúñ]+\b/g;
  sanitized = sanitized.replace(capitalizedWordPattern, (word) => {
    const lowerWord = word.toLowerCase();
    if (STOP_WORDS.has(lowerWord) || word.length === 1) {
      return word;
    }
    counters.person++;
    const token = `[PERSON_${counters.person}]`;
    hydrationMap.set(token, word);
    return token;
  });

  return sanitized;
}

/**
 * Full sanitization pipeline with hydration map
 * FASE 4: Async-Safe - hydrationMap and counters injected as parameters
 * Applies all privacy masks in sequence
 */
function sanitizeDescription(description: string, hydrationMap: Map<string, string>, counters: TokenCounters): string {
  if (!description || typeof description !== 'string') return description;

  let sanitized = maskAccounts(description, hydrationMap, counters);
  sanitized = maskNames(sanitized, hydrationMap, counters);

  return sanitized;
}

/**
 * Sanitize an object's description fields recursively with hydration map
 * FASE 4: Async-Safe - hydrationMap and counters injected as parameters
 * Recursively sanitizes metadata_json fields, handles arrays and nested JSON strings
 */
function sanitizeObject<T>(obj: T, hydrationMap: Map<string, string>, counters: TokenCounters): T {
  // Handle arrays recursively
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, hydrationMap, counters)) as unknown as T;
  }

  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  const sanitized: Record<string, unknown> = { ...(obj as Record<string, unknown>) };

  for (const key in sanitized) {
    if (typeof sanitized[key] === 'string') {
      if (key.toLowerCase().includes('description') ||
          key.toLowerCase().includes('note') ||
          key.toLowerCase().includes('notes') ||
          key.toLowerCase().includes('memo') ||
          key.toLowerCase().includes('comment')) {
        sanitized[key] = sanitizeDescription(sanitized[key] as string, hydrationMap, counters);
      }
      // Recursively sanitize metadata_json fields and any string that looks like JSON
      else if (key.toLowerCase().includes('metadata_json') || key.toLowerCase().includes('metadata') || 
               ((sanitized[key] as string).startsWith('{') && (sanitized[key] as string).endsWith('}'))) {
        try {
          const parsed = JSON.parse(sanitized[key] as string);
          const sanitizedMetadata = sanitizeObject(parsed, hydrationMap, counters);
          sanitized[key] = JSON.stringify(sanitizedMetadata);
          console.debug('[QualityGate-F2] Sanitized nested JSON in field:', key);
        } catch {
          // If not valid JSON, treat as regular string
          sanitized[key] = sanitizeDescription(sanitized[key] as string, hydrationMap, counters);
        }
      }
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      // Recursively sanitize nested objects and arrays
      sanitized[key] = sanitizeObject(sanitized[key], hydrationMap, counters);
    }
  }

  return sanitized as unknown as T;
}

/**
 * Prepare data for AI API - full sanitization with reversible hydration map
 * FASE 4: Factory function - Entry point where state is initialized (Async-Safety)
 * This is the ONLY function that initializes hydrationMap and counters locally
 * All other functions receive state via parameters to prevent race conditions
 * Returns { sanitized, hydrationMap } for later reversal
 */
export function prepareForAI<T>(data: T): { sanitized: T; hydrationMap: Map<string, string> } {
  // FASE 4: Initialize state locally (no global state) - guarantees Async-Safety
  const counters: TokenCounters = { person: 0, account: 0, location: 0 };
  const hydrationMap = new Map<string, string>();

  if (typeof data === 'string') {
    return { sanitized: sanitizeDescription(data, hydrationMap, counters) as T, hydrationMap };
  }

  if (Array.isArray(data)) {
    return { sanitized: data.map(item => sanitizeObject(item, hydrationMap, counters)) as T, hydrationMap };
  }

  if (typeof data === 'object' && data !== null) {
    return { sanitized: sanitizeObject(data, hydrationMap, counters), hydrationMap };
  }

  return { sanitized: data, hydrationMap };
}

/**
 * Hydrate AI response - replace tokens with original values
 * Reverses the sanitization for user-facing display
 */
export function hydrateAIResponse(text: string, hydrationMap: Map<string, string>): string {
  let hydrated = text;

  for (const [token, original] of hydrationMap.entries()) {
    hydrated = hydrated.replace(new RegExp(token.replace(/[[]/g, '\\['), 'g'), original);
  }

  return hydrated;
}

/**
 * Clear hydration map to prevent memory leaks
 * Call this after each AI interaction to free memory
 */
export function clearHydrationMap(hydrationMap: Map<string, string>): void {
  hydrationMap.clear();
}
