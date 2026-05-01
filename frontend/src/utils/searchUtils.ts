/**
 * Search Utilities
 * Unicode NFD normalization for accent-insensitive search
 * Shared utility for indexing and searching (symmetric)
 */

/**
 * Normalize string for accent-insensitive search
 * Converts to lowercase, decomposes Unicode (NFD), removes diacritics
 * Used for both indexing (tokenizeDescription) and searching (filter)
 */
export function normalizeString(text: string): string {
  if (!text || typeof text !== 'string') return '';

  // Step 1: Convert to lowercase
  const lowercased = text.toLowerCase();

  // Step 2: Decompose Unicode (NFD) - separates base chars from diacritics
  const nfd = lowercased.normalize('NFD');

  // Step 3: Remove diacritical marks (Unicode range \u0300-\u036f)
  const removedDiacritics = nfd.replace(/[\u0300-\u036f]/g, '');

  return removedDiacritics;
}

/**
 * Tokenize description for indexed search
 * Splits into words, normalizes each word with NFD, filters short words
 */
export function tokenizeDescription(description: string): string[] {
  if (!description || typeof description !== 'string') return [];

  const normalized = normalizeString(description);

  // Split by non-alphanumeric characters
  const words = normalized.split(/[^a-z0-9]+/i);

  // Filter: minimum 2 chars, remove empty strings
  return words.filter((w: string) => w.length >= 2);
}

/**
 * Search filter for accent-insensitive matching
 * Normalizes search term and compares with normalized words
 */
export function matchesSearch(searchTerm: string, descriptionWords: string[]): boolean {
  if (!searchTerm || searchTerm.length === 0) return true;
  if (!descriptionWords || descriptionWords.length === 0) return false;

  const normalizedSearch = normalizeString(searchTerm);
  const searchWords = normalizedSearch.split(/\s+/).filter((w: string) => w.length >= 2);

  // All search words must match at least one description word
  return searchWords.every((searchWord: string) =>
    descriptionWords.some((descWord: string) => descWord.includes(searchWord))
  );
}
