/**
 * Cryptographic Utilities
 * SHA-256 hashing for duplicate detection
 */

/**
 * Generate SHA-256 hash for duplicate detection
 * Includes account_id to allow same transaction in different accounts
 * Aligned with UUIDv5 seed format for consistency
 */
export async function generateTransactionHash(
  date: string,
  amount: number,
  description: string,
  accountId: string
): Promise<string> {
  const str = `${accountId}:${date}:${description}:${amount}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  console.debug('[QualityGate-F1] Transaction hash input:', str);
  return hashHex;
}

/**
 * Simple hash for non-critical use cases (fallback)
 * Uses DJB2 algorithm
 */
export function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}
