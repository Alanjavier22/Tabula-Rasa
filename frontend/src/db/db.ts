import Dexie, { type Table } from 'dexie';
import { v4 as uuidv4 } from 'uuid';
import { tokenizeDescription as tokenizeDesc } from '../utils/searchUtils';

// --- Interfaces for Dexie Tables ---
// We only need to define the properties that are explicitly indexed by Dexie
export interface SyncMetadata {
  key: string;
  value: any;
}

export interface LocalConfig {
  id: string;
  key: string;
  value: string;
  is_deleted: boolean;
  updated_at: string;
}

export interface ExchangeRate {
  id: string;
  pair: string; // e.g., "USD-EUR"
  rate: number; // multiplier to convert from first to second
  timestamp: string;
  is_deleted: boolean;
  updated_at: string;
}

export interface LocalCategory {
  id: string;
  is_deleted: boolean;
  updated_at: string;
}

export interface LocalAccount {
  id: string;
  is_deleted: boolean;
  updated_at: string;
  linked_account_id?: string | null;
  balance: number;
  name?: string;
  currency?: string;
}

export interface LocalTransaction {
  id: string;
  is_deleted: boolean;
  updated_at: string;
  account_id?: string | null;
  category_id?: string | null;
  date: string;
  transaction_type: 'income' | 'expense';
  amount: number;
  description?: string;
  description_words?: string[]; // Tokenized words for indexed search
  hash?: string; // SHA-256 for deduplication
  needs_reindex?: boolean; // Flag for background re-index
  subscription_id?: string;
  version?: number; // FASE 7: OCC versioning for conflict resolution
  needs_review?: boolean; // FASE 7: Conflict flag
}

export interface LocalTransactionSplit {
  id: string;
  is_deleted: boolean;
  updated_at: string;
  transaction_id: string;
  category_id?: string | null;
}

export interface LocalCreditCardStatement {
  id: string;
  is_deleted: boolean;
  updated_at: string;
  account_id: string;
  status: string;
  version?: number; // FASE 7: OCC versioning for conflict resolution
  needs_review?: boolean; // FASE 7: Conflict flag
}

export interface LocalDebtShare {
  id: string;
  is_deleted: boolean;
  updated_at: string;
  statement_id: string;
}

export interface LocalIOU {
  id: string;
  is_deleted: boolean;
  updated_at: string;
  transaction_id?: string | null;
  amount: number;
  amount_paid: number;
  description?: string;
}

export interface LocalBudget {
  id: string;
  is_deleted: boolean;
  updated_at: string;
  category_id: string;
  month: number;
  year: number;
  amount: number;
  version?: number; // FASE 7: OCC versioning for conflict resolution
  needs_review?: boolean; // FASE 7: Conflict flag
}

export interface LocalGoal {
  id: string;
  is_deleted: boolean;
  updated_at: string;
}

export interface LocalReminder {
  id: string;
  is_deleted: boolean;
  updated_at: string;
}

export interface LocalSubscription {
  id: string;
  is_deleted: boolean;
  updated_at: string;
  account_id?: string | null;
  category_id?: string | null;
  name?: string;
  amount_cents?: number;
  next_billing_date?: string;
  frequency?: string;
  payment_method?: string;
  version?: number; // FASE 7: OCC versioning for conflict resolution
  needs_review?: boolean; // FASE 7: Conflict flag
}

export interface SyncQueueEntry {
  id: string;
  table_name: string;
  action: 'create' | 'update' | 'delete';
  payload: any;
  timestamp: string;
  retry_count: number;
}

export interface SyncErrorEntry {
  id: string;
  table_name: string;
  action: 'create' | 'update' | 'delete';
  payload: any;
  timestamp: string;
  retry_count: number;
  error_message: string;
  failed_at: string;
}

export interface SyncConflictEntry {
  id: string;
  table_name: string;
  record_id: string;
  local_data: any;
  server_data: any;
  resolved: boolean;
  created_at: string;
  resolved_at?: string;
  error_type?: string; // 'network_exhausted' or 'version_conflict'
  error_message?: string;
}

export interface LocalVehicle {
  id: string;
  is_deleted: boolean;
  updated_at: string;
  make: string;
  model: string;
  year: number;
  current_odometer: number;
  fuel_type: string;
}

export interface LocalFuelLog {
  id: string;
  is_deleted: boolean;
  updated_at: string;
  vehicle_id: string;
  date: string;
  odometer_reading: number;
  cost_cents: number;
  gallons_or_liters: number;
}

export interface LocalMaintenanceLog {
  id: string;
  is_deleted: boolean;
  updated_at: string;
  vehicle_id: string;
  date: string;
  odometer_reading: number;
  cost_cents: number;
  description?: string;
}

export interface NetWorthSnapshot {
  id: string;
  date: string;
  month: number;
  year: number;
  total_assets_cents: number;
  total_liabilities_cents: number;
  net_worth_cents: number;
  income_cents: number;
  expense_cents: number;
  transaction_count: number;
  is_stale: boolean;
  updated_at: string;
}

export interface LocalAsset {
  id: string;
  name: string;
  purchase_price_cents: number;
  purchase_date: string;
  estimated_life_months: number;
  residual_value_cents: number;
  is_deleted: boolean;
  updated_at: string;
  version?: number; // FASE 7: OCC versioning for conflict resolution
  needs_review?: boolean; // FASE 7: Conflict flag
}

export class FinanceDatabase extends Dexie {
  // Sync metadata
  sync_metadata!: Table<SyncMetadata, string>;
  
  // App data tables
  config!: Table<LocalConfig, string>;
  exchange_rates!: Table<ExchangeRate, string>;
  categories!: Table<LocalCategory, string>;
  accounts!: Table<LocalAccount, string>;
  sync_conflicts!: Table<SyncConflictEntry, string>;
  transactions!: Table<LocalTransaction, string>;
  transaction_splits!: Table<LocalTransactionSplit, string>;
  credit_card_statements!: Table<LocalCreditCardStatement, string>;
  debt_shares!: Table<LocalDebtShare, string>;
  ious!: Table<LocalIOU, string>;
  budgets!: Table<LocalBudget, string>;
  goals!: Table<LocalGoal, string>;
  reminders!: Table<LocalReminder, string>;
  subscriptions!: Table<LocalSubscription, string>;
  sync_queue!: Table<SyncQueueEntry, string>;
  sync_errors!: Table<SyncErrorEntry, string>;
  vehicles!: Table<LocalVehicle, string>;
  fuel_logs!: Table<LocalFuelLog, string>;
  maintenance_logs!: Table<LocalMaintenanceLog, string>;
  assets!: Table<LocalAsset, string>;
  net_worth_snapshots!: Table<NetWorthSnapshot, string>;

  /**
   * Tokenize description for indexed search
   * Uses Unicode NFD normalization for accent-insensitive search
   */
  private tokenizeDescription(obj: any): void {
    if (obj.description && typeof obj.description === 'string') {
      obj.description_words = tokenizeDesc(obj.description);
    } else {
      obj.description_words = [];
    }
  }

  constructor() {
    super('FinanceLocalFirstDB');
    
    // We only index properties that we will use in .where() queries.
    // The '&id' means it's a primary key and must be unique.
    // FASE 7: Added version index to critical financial tables for OCC conflict resolution
    // FASE 8.1: Added sync_conflicts table for conflict stashing
    this.version(5).stores({
      sync_metadata: '&key',
      config: '&id, key, is_deleted, updated_at',
      exchange_rates: '&id, from_currency, to_currency, is_deleted, updated_at',
      categories: '&id, name, is_deleted, updated_at, version',
      accounts: '&id, name, is_deleted, updated_at, version',
      transactions: '&id, date, is_deleted, updated_at, description_words, version, hash',
      transaction_splits: '&id, transaction_id, category_id, is_deleted, updated_at',
      credit_card_statements: '&id, is_deleted, updated_at, account_id, status, version',
      debt_shares: '&id, is_deleted, updated_at, statement_id, version',
      ious: '&id, is_deleted, updated_at, transaction_id, version',
      budgets: '&id, is_deleted, updated_at, category_id, version',
      goals: '&id, is_deleted, updated_at',
      reminders: '&id, is_deleted, updated_at, version',
      subscriptions: '&id, is_deleted, updated_at, account_id, category_id, version',
      sync_queue: '&id, timestamp',
      sync_errors: '&id, failed_at',
      sync_conflicts: '&id, table_name, record_id, resolved, error_type',
      vehicles: '&id, is_deleted, updated_at',
      fuel_logs: '&id, is_deleted, updated_at, vehicle_id, date',
      maintenance_logs: '&id, is_deleted, updated_at, vehicle_id, date',
      assets: '&id, is_deleted, updated_at, purchase_date, version',
      net_worth_snapshots: '&id, month, year, is_stale'
    }).upgrade(async () => {
      // Migration from v4 to v5: add error_type/error_message indexes to sync_conflicts
      console.log('[DB] Upgrading from v4 to v5 - adding error_type index to sync_conflicts...');
      // Dexie automatically handles index additions for existing data
    }).upgrade(async () => {
      // Migration from v3 to v4: add sync_conflicts table
      console.log('[DB] Upgrading from v3 to v4 - adding sync_conflicts table...');
      // Dexie automatically handles new table creation
    }).upgrade(async () => {
      // Migration from v2 to v3: add version index for OCC
      console.log('[DB] Upgrading from v2 to v3 - adding version indexes for OCC...');
      // Dexie automatically handles index additions for existing data
    }).upgrade(async () => {
      // Migration from v1 to v2: ensure credit_card_statements has proper indexes
      console.log('[DB] Upgrading from v1 to v2...');
    });

    // Error recovery: if critical failure, delete and reinitialize
    this.on('populate', () => {
      console.log('[DB] Database populated successfully');
    });

    this.on('blocked', () => {
      console.error('[DB] Database blocked - another tab has it open');
      console.warn('[Phoenix] Attempting to close other tabs to allow schema migration');
      // Broadcast message to other tabs to close
      localStorage.setItem('finance_db_migration_required', Date.now().toString());
      setTimeout(() => {
        localStorage.removeItem('finance_db_migration_required');
      }, 5000);
    });

    this.on('versionchange', () => {
      console.warn('[DB] Version change detected - closing connection');
    });

    // Hook: Mark snapshot as stale when transaction changes
    this.transactions.hook('creating', (_primKey, obj, trans) => {
      this.markSnapshotStale(obj.date, trans);
      this.tokenizeDescription(obj);
    });

    this.transactions.hook('updating', (_modifications, _primKey, obj, trans) => {
      this.markSnapshotStale(obj.date, trans);
      this.tokenizeDescription(obj);
    });

    this.transactions.hook('deleting', (_primKey, obj, trans) => {
      this.markSnapshotStale(obj.date, trans);
    });

    // Hook: Mark snapshots as stale when asset changes (range: purchase_date → current)
    this.assets.hook('creating', (_primKey, obj, trans) => {
      this.markAssetSnapshotsStale(obj.purchase_date, trans);
    });

    this.assets.hook('updating', (_modifications, _primKey, obj, trans) => {
      this.markAssetSnapshotsStale(obj.purchase_date, trans);
    });

    this.assets.hook('deleting', (_primKey, obj, trans) => {
      this.markAssetSnapshotsStale(obj.purchase_date, trans);
    });
  }

  /**
   * Mark snapshot as stale for a given transaction date
   * Atomic operation within the same transaction
   * Creates snapshot with zero values if missing
   */
  private async markSnapshotStale(transactionDate: string, trans: any): Promise<void> {
    try {
      const date = new Date(transactionDate);
      const month = date.getMonth() + 1;
      const year = date.getFullYear();
      const now = new Date().toISOString();
      const snapshotDate = new Date(year, month - 1, 1).toISOString();

      // Find snapshot for this month/year
      // @ts-ignore
      const snapshot = await trans.table('net_worth_snapshots')
        .where('[month+year]')
        .equals([month, year])
        .first();

      if (snapshot) {
        // Mark as stale atomically
        // @ts-ignore
        await trans.table('net_worth_snapshots').update(snapshot.id, {
          is_stale: true,
          updated_at: now
        });
      } else {
        // Create snapshot with zero values if missing (edge case: new month)
        // @ts-ignore
        await trans.table('net_worth_snapshots').add({
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
          updated_at: now
        });
      }
    } catch (error) {
      console.error('Error marking snapshot stale:', error);
    }
  }

  /**
   * Mark snapshots as stale for asset changes (range: purchase_date → current month)
   * Atomic operation within the same transaction
   */
  private async markAssetSnapshotsStale(purchaseDate: string, trans: any): Promise<void> {
    try {
      const purchase = new Date(purchaseDate);
      const current = new Date();
      const now = current.toISOString();

      const startMonth = purchase.getMonth() + 1;
      const startYear = purchase.getFullYear();
      const endMonth = current.getMonth() + 1;
      const endYear = current.getFullYear();

      // Iterate through all months from purchase_date to current
      for (let year = startYear; year <= endYear; year++) {
        const monthStart = (year === startYear) ? startMonth : 1;
        const monthEnd = (year === endYear) ? endMonth : 12;

        for (let month = monthStart; month <= monthEnd; month++) {
          // Find snapshot for this month/year
          // @ts-ignore
          const snapshot = await trans.table('net_worth_snapshots')
            .where('[month+year]')
            .equals([month, year])
            .first();

          if (snapshot) {
            // Mark as stale atomically
            // @ts-ignore
            await trans.table('net_worth_snapshots').update(snapshot.id, {
              is_stale: true,
              updated_at: now
            });
          } else {
            // Create snapshot with zero values if missing
            const snapshotDate = new Date(year, month - 1, 1).toISOString();
            // @ts-ignore
            await trans.table('net_worth_snapshots').add({
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
              updated_at: now
            });
          }
        }
      }
    } catch (error) {
      console.error('Error marking asset snapshots stale:', error);
    }
  }
}

// Error recovery function for critical database failures
export async function recoverFromCriticalError(): Promise<void> {
  try {
    console.warn('[DB] Attempting error recovery...');
    await db.delete();
    console.log('[DB] Database deleted, reinitializing...');
    // The db instance will be recreated on next access
    window.location.reload(); // Force reload to reinitialize
  } catch (error) {
    console.error('[DB] Error recovery failed:', error);
    // If recovery fails, clear localStorage as last resort
    localStorage.clear();
    window.location.reload();
  }
}

// Safe database open with error recovery
export async function safeOpenDB(): Promise<void> {
  try {
    await db.open();
    console.log('[DB] Database opened successfully');
  } catch (error) {
    console.error('[DB] Critical error opening database:', error);
    // Check if it's a schema error (e.g., missing table)
    if ((error as any).name === 'NotFoundError' || (error as any).message?.includes('credit_card_statements')) {
      console.warn('[DB] Schema error detected, initiating recovery...');
      await recoverFromCriticalError();
    } else {
      throw error; // Re-throw non-recoverable errors
    }
  }
}

export const db = new FinanceDatabase();

// Initialize database with error recovery
if (typeof window !== 'undefined') {
  safeOpenDB().catch(err => {
    console.error('[DB] Failed to initialize database:', err);
  });
}
