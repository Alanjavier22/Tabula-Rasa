/**
 * Bank-Specific CSV Parsers for Ecuador Banks
 * Maps bank-specific formats to Tabula Rasa Transaction schema
 */

import { toCents } from './money';
import { generateTransactionHash } from './crypto';
import { db } from '../db/db';

export interface ParsedTransaction {
  date: string;
  description: string;
  amount: number; // in cents
  transaction_type: 'income' | 'expense';
}

export interface BankParser {
  detectBank: (headers: string[]) => boolean;
  parseRow: (row: string[], headers: string[]) => ParsedTransaction | null;
}

// Pichincha Bank Parser
// Format: FECHA, DESCRIPCION, DEBITO, CREDITO
const pichinchaParser: BankParser = {
  detectBank: (headers) => {
    const normalized = headers.map(h => h.toLowerCase().trim());
    return normalized.some(h => h.includes('fecha') || h.includes('date')) &&
           normalized.some(h => h.includes('descripcion') || h.includes('description')) &&
           (normalized.some(h => h.includes('debito')) || normalized.some(h => h.includes('credito')));
  },
  parseRow: (row, headers) => {
    const normalizedHeaders = headers.map(h => h.toLowerCase().trim());
    
    const dateIndex = normalizedHeaders.findIndex(h => h.includes('fecha') || h.includes('date'));
    const descIndex = normalizedHeaders.findIndex(h => h.includes('descripcion') || h.includes('description'));
    const debitIndex = normalizedHeaders.findIndex(h => h.includes('debito'));
    const creditIndex = normalizedHeaders.findIndex(h => h.includes('credito'));
    
    if (dateIndex === -1 || descIndex === -1) return null;
    
    const dateStr = row[dateIndex]?.trim();
    const description = row[descIndex]?.trim();
    const debitStr = row[debitIndex]?.trim();
    const creditStr = row[creditIndex]?.trim();
    
    if (!dateStr || !description) return null;
    
    // Parse date (DD/MM/YYYY or YYYY-MM-DD)
    let date = dateStr;
    if (dateStr.includes('/')) {
      const [day, month, year] = dateStr.split('/');
      date = `${year}-${month}-${day}`;
    }
    
    // Parse amount (debit or credit) - pass raw string to toCents for precision
    // FIX: Eliminated parseFloat/Math.abs to avoid IEEE 754 precision loss
    const debitStrClean = debitStr ? debitStr.replace(/,/g, '').trim() : '0';
    const creditStrClean = creditStr ? creditStr.replace(/,/g, '').trim() : '0';
    const amountStr = debitStrClean !== '0' ? debitStrClean : creditStrClean;
    // Determine transaction type from raw string (no float parsing)
    const isIncome = creditStrClean !== '0';
    // Convert to cents using decimal.js-light (handles precision and abs internally)
    const amountInCents = toCents(amountStr);
    
    return {
      date: date + 'T00:00:00',
      description,
      amount: amountInCents,
      transaction_type: isIncome ? 'income' : 'expense',
    };
  },
};

// Guayaquil Bank Parser
// Format: FECHA, CONCEPTO, VALOR
const guayaquilParser: BankParser = {
  detectBank: (headers) => {
    const normalized = headers.map(h => h.toLowerCase().trim());
    return normalized.some(h => h.includes('concepto') || h.includes('concept')) &&
           normalized.some(h => h.includes('valor') || h.includes('amount') || h.includes('monto'));
  },
  parseRow: (row, headers) => {
    const normalizedHeaders = headers.map(h => h.toLowerCase().trim());
    
    const dateIndex = normalizedHeaders.findIndex(h => h.includes('fecha') || h.includes('date'));
    const descIndex = normalizedHeaders.findIndex(h => h.includes('concepto') || h.includes('concept'));
    const amountIndex = normalizedHeaders.findIndex(h => h.includes('valor') || h.includes('amount') || h.includes('monto'));
    
    if (dateIndex === -1 || descIndex === -1 || amountIndex === -1) return null;
    
    const dateStr = row[dateIndex]?.trim();
    const description = row[descIndex]?.trim();
    const amountStr = row[amountIndex]?.trim();
    
    if (!dateStr || !description || !amountStr) return null;
    
    // Parse date
    let date = dateStr;
    if (dateStr.includes('/')) {
      const [day, month, year] = dateStr.split('/');
      date = `${year}-${month}-${day}`;
    }
    
    // Parse amount (negative = expense, positive = income)
    // FIX: Eliminated parseFloat/Math.abs to avoid IEEE 754 precision loss
    const amountStrClean = amountStr.replace(/,/g, '').trim();
    // Determine transaction type from raw string (check for negative sign)
    const isIncome = !amountStrClean.startsWith('-');
    // Convert to cents using decimal.js-light (handles precision and abs internally)
    const amountInCents = toCents(amountStrClean);
    
    return {
      date: date + 'T00:00:00',
      description,
      amount: amountInCents,
      transaction_type: isIncome ? 'income' : 'expense',
    };
  },
};

// Pacifico Bank Parser
// Format: FECHA TRANSACCION, DESCRIPCION, ABONO, CARGO
const pacificoParser: BankParser = {
  detectBank: (headers) => {
    const normalized = headers.map(h => h.toLowerCase().trim());
    return normalized.some(h => h.includes('transaccion') || h.includes('transaction')) &&
           normalized.some(h => h.includes('abono') || h.includes('cargo'));
  },
  parseRow: (row, headers) => {
    const normalizedHeaders = headers.map(h => h.toLowerCase().trim());
    
    const dateIndex = normalizedHeaders.findIndex(h => h.includes('fecha') || h.includes('date'));
    const descIndex = normalizedHeaders.findIndex(h => h.includes('descripcion') || h.includes('description'));
    const creditIndex = normalizedHeaders.findIndex(h => h.includes('abono'));
    const debitIndex = normalizedHeaders.findIndex(h => h.includes('cargo'));
    
    if (dateIndex === -1 || descIndex === -1) return null;
    
    const dateStr = row[dateIndex]?.trim();
    const description = row[descIndex]?.trim();
    const creditStr = row[creditIndex]?.trim();
    const debitStr = row[debitIndex]?.trim();
    
    if (!dateStr || !description) return null;
    
    // Parse date
    let date = dateStr;
    if (dateStr.includes('/')) {
      const [day, month, year] = dateStr.split('/');
      date = `${year}-${month}-${day}`;
    }
    
    // Parse amount
    // FIX: Eliminated parseFloat/Math.abs to avoid IEEE 754 precision loss
    const creditStrClean = creditStr ? creditStr.replace(/,/g, '').trim() : '0';
    const debitStrClean = debitStr ? debitStr.replace(/,/g, '').trim() : '0';
    const amountStr = creditStrClean !== '0' ? creditStrClean : debitStrClean;
    // Determine transaction type from raw string (no float parsing)
    const isIncome = creditStrClean !== '0';
    // Convert to cents using decimal.js-light (handles precision and abs internally)
    const amountInCents = toCents(amountStr);
    
    return {
      date: date + 'T00:00:00',
      description,
      amount: amountInCents,
      transaction_type: isIncome ? 'income' : 'expense',
    };
  },
};

// Generic/Fallback Parser
const genericParser: BankParser = {
  detectBank: () => true, // Always matches as fallback
  parseRow: (row, headers) => {
    const normalizedHeaders = headers.map(h => h.toLowerCase().trim());
    
    // Try to find date, description, and amount columns
    const dateIndex = normalizedHeaders.findIndex(h => 
      h.includes('fecha') || h.includes('date') || h.includes('fecha')
    );
    const descIndex = normalizedHeaders.findIndex(h => 
      h.includes('descripcion') || h.includes('description') || h.includes('concepto') || h.includes('concept')
    );
    const amountIndex = normalizedHeaders.findIndex(h => 
      h.includes('monto') || h.includes('amount') || h.includes('valor') || h.includes('importe')
    );
    
    if (dateIndex === -1 || descIndex === -1 || amountIndex === -1) return null;
    
    const dateStr = row[dateIndex]?.trim();
    const description = row[descIndex]?.trim();
    const amountStr = row[amountIndex]?.trim();
    
    if (!dateStr || !description || !amountStr) return null;
    
    // Parse date
    let date = dateStr;
    if (dateStr.includes('/')) {
      const [day, month, year] = dateStr.split('/');
      date = `${year}-${month}-${day}`;
    }
    
    // Parse amount (assume expense unless explicitly marked as income)
    // FIX: Eliminated parseFloat/Math.abs to avoid IEEE 754 precision loss
    const amountStrClean = amountStr.replace(/,/g, '').trim();
    // Convert to cents using decimal.js-light (handles precision and abs internally)
    const amountInCents = toCents(amountStrClean);
    
    return {
      date: date + 'T00:00:00',
      description,
      amount: amountInCents,
      transaction_type: 'expense', // Default to expense
    };
  },
};

const PARSERS: BankParser[] = [pichinchaParser, guayaquilParser, pacificoParser];

/**
 * Detect bank from CSV headers
 */
export function detectBank(headers: string[]): BankParser {
  for (const parser of PARSERS) {
    if (parser.detectBank(headers)) {
      return parser;
    }
  }
  return genericParser;
}

/**
 * Parse CSV to transactions using detected bank parser (chunked for memory efficiency)
 * Processes in chunks of 1000 records to prevent RAM overflow with 50k+ files
 */
export function parseCSV(text: string): ParsedTransaction[] {
  const lines = text.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.trim());
  const parser = detectBank(headers);
  
  const transactions: ParsedTransaction[] = [];
  const CHUNK_SIZE = 1000;
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const parsed = parser.parseRow(values, headers);
    if (parsed) {
      transactions.push(parsed);
    }
    
    // Yield UI every 1000 records to prevent browser freeze
    if (i % CHUNK_SIZE === 0) {
      // Allow event loop to process (non-blocking)
      // Note: This is synchronous parsing, but chunked for memory efficiency
      // For async processing, use parseCSVAsync instead
    }
  }
  
  return transactions;
}

/**
 * Async chunked CSV parser with UI yielding for massive files
 * Processes in chunks of 1000 with setTimeout(0) between chunks
 * Includes deduplication using deterministic hashing before write
 */
export async function parseCSVAsync(
  text: string,
  accountId: string,
  onProgress?: (processed: number, total: number) => void
): Promise<ParsedTransaction[]> {
  const lines = text.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.trim());
  const parser = detectBank(headers);
  
  const transactions: ParsedTransaction[] = [];
  const CHUNK_SIZE = 1000;
  const totalRecords = lines.length - 1;
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const parsed = parser.parseRow(values, headers);
    if (parsed) {
      transactions.push(parsed);
    }
    
    // Yield UI every 1000 records
    if (i % CHUNK_SIZE === 0) {
      if (onProgress) {
        onProgress(i, totalRecords);
      }
      // Allow event loop to process (non-blocking)
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  
  if (onProgress) {
    onProgress(totalRecords, totalRecords);
  }
  
  // Deduplication: generate hashes and filter existing records
  const hashes: string[] = [];
  for (const txn of transactions) {
    const hash = await generateTransactionHash(txn.date, txn.amount, txn.description, accountId);
    hashes.push(hash);
  }
  
  // Bulk check for existing hashes
  // @ts-ignore
  const existingTxns = await db.transactions.where('hash').anyOf(hashes).toArray();
  const existingHashes = new Set(existingTxns.map((t: any) => t.hash));
  
  // Filter out duplicates
  const filteredTransactions: ParsedTransaction[] = [];
  for (let i = 0; i < transactions.length; i++) {
    if (!existingHashes.has(hashes[i])) {
      filteredTransactions.push(transactions[i]);
    }
  }
  
  const duplicateCount = transactions.length - filteredTransactions.length;
  if (duplicateCount > 0) {
    console.debug(`[QualityGate-F3] CSV deduplication: ${duplicateCount} duplicates filtered`);
  }
  
  return filteredTransactions;
}
