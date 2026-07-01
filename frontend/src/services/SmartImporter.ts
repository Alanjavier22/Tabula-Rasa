/**
 * Smart Importer - Hash-based Upsert for duplicate detection
 * Uses SHA-256 hash to prevent duplicate transactions
 * Logic: If Hash exists → Ignore (Duplicate). If not → Create + Update Balance + Mark Snapshot Stale
 */

import { db } from '../db/db';
import { v4 as uuidv4 } from 'uuid';
import { generateTransactionHash } from '../utils/crypto';

export interface ImportResult {
  imported: number;
  skipped: number;
  duplicates: number;
  errors: string[];
}

export class SmartImporter {
  /**
   * Import transactions with hash-based deduplication
   * Atomic: all or nothing for each transaction
   */
  async importTransactions(transactions: unknown[]): Promise<ImportResult> {
    const result: ImportResult = {
      imported: 0,
      skipped: 0,
      duplicates: 0,
      errors: [],
    };

    const now = new Date().toISOString();

    // Get existing hashes for efficient lookup
    const existingTxns = await db.transactions.toArray();
    const existingHashes = new Set<string>();
    for (const txn of existingTxns) {
      if (txn.hash) existingHashes.add(txn.hash);
    }

    for (const txn of transactions) {
      try {
        // Generate hash from RAW data (date + amount + description + account_id)
        // Hash covers: Fecha + Monto + Descripción CRUDA + Cuenta (no category)
        const hash = await generateTransactionHash(
          txn.date,
          txn.amount,
          txn.description || '',
          txn.account_id || ''
        );

        // Check if hash already exists (duplicate)
        if (existingHashes.has(hash)) {
          result.duplicates++;
          result.skipped++;
          continue;
        }

        // Atomic transaction: create transaction + update account balance + mark snapshot stale
        await db.transaction('rw', [db.transactions, db.accounts, db.net_worth_snapshots, db.sync_queue], async () => {
          // Get account
          const account = await db.accounts.get(txn.account_id);
          if (!account) {
            throw new Error(`Account not found: ${txn.account_id}`);
          }

          // Create transaction
          const newTxnId = uuidv4();
          const newTxn = {
            id: newTxnId,
            date: txn.date,
            description: txn.description,
            amount: txn.amount,
            transaction_type: txn.transaction_type || 'expense',
            category_id: txn.category_id || null,
            account_id: txn.account_id,
            payment_method: txn.payment_method || 'transfer',
            is_deleted: false,
            created_at: now,
            updated_at: now,
            hash, // Store hash for future deduplication
          };

          await db.transactions.put(newTxn);

          // Update account balance atomically
          const balanceChange = txn.transaction_type === 'income' ? txn.amount : -txn.amount;
          await db.accounts.update(txn.account_id, {
            balance: account.balance + balanceChange,
            updated_at: now,
          });

          // Mark snapshot as stale (atomic in same transaction)
          const date = new Date(txn.date);
          const month = date.getMonth() + 1;
          const year = date.getFullYear();

          const snapshot = await db.net_worth_snapshots
            .where('[month+year]')
            .equals([month, year])
            .first();

          if (snapshot) {
            await db.net_worth_snapshots.update(snapshot.id, {
              is_stale: true,
              updated_at: now,
            });
          } else {
            // Create snapshot with zero values if missing
            const snapshotDate = new Date(year, month - 1, 1).toISOString();
            await db.net_worth_snapshots.add({
              id: uuidv4(),
              date: snapshotDate,
              month,
              year,
              total_assets_cents: 0,
              total_liabilities_cents: 0,
              net_worth_cents: 0,
              income_cents: 0,
              expense_cents: 0,
              transaction_count: 0,
              is_stale: true,
              updated_at: now,
            });
          }

          // Add to sync queue
          await db.sync_queue.add({
            id: uuidv4(),
            table_name: 'transactions',
            action: 'create',
            payload: newTxn,
            timestamp: now,
            retry_count: 0,
          });

          await db.sync_queue.add({
            id: uuidv4(),
            table_name: 'accounts',
            action: 'update',
            payload: { ...account, balance: account.balance + balanceChange, updated_at: now },
            timestamp: now,
            retry_count: 0,
          });
        });

        result.imported++;
        existingHashes.add(hash); // Add to local cache for subsequent checks
      } catch (error: unknown) {
        result.errors.push(`Error importing transaction: ${error.message}`);
      }
    }

    return result;
  }

  /**
   * Import single transaction with hash-based deduplication
   */
  async importTransaction(transaction: unknown): Promise<ImportResult> {
    return this.importTransactions([transaction]);
  }
}

export const smartImporter = new SmartImporter();