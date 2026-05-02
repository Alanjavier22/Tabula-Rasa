import Dexie, { type Table } from 'dexie';
import { v5 as uuidv5 } from 'uuid';
import type {
  SyncMetadata,
  LocalConfig,
  ExchangeRate,
  LocalCategory,
  LocalAccount,
  LocalTransaction,
  LocalTransactionSplit,
  LocalCreditCardStatement,
  LocalDebtShare,
  LocalIOU,
  LocalBudget,
  LocalGoal,
  LocalReminder,
  LocalSubscription,
  SyncQueueEntry,
  SyncErrorEntry,
  SyncConflictEntry,
  LocalVehicle,
  LocalFuelLog,
  LocalMaintenanceLog,
  NetWorthSnapshot,
  SnapshotRecalcQueue,
  AICacheEntry,
  LocalAsset
} from '../types/schemas';

// Re-export LocalTransaction for convenience in components
export type { LocalTransaction } from '../types/schemas';

export class FinanceDatabase extends Dexie {
  // App data tables
  config!: Table<LocalConfig, string>;
  exchange_rates!: Table<ExchangeRate, string>;
  categories!: Table<LocalCategory, string>;
  accounts!: Table<LocalAccount, string>;
  transactions!: Table<LocalTransaction, string>;
  transaction_splits!: Table<LocalTransactionSplit, string>;
  credit_card_statements!: Table<LocalCreditCardStatement, string>;
  debt_shares!: Table<LocalDebtShare, string>;
  ious!: Table<LocalIOU, string>;
  budgets!: Table<LocalBudget, string>;
  goals!: Table<LocalGoal, string>;
  reminders!: Table<LocalReminder, string>;
  subscriptions!: Table<LocalSubscription, string>;
  vehicles!: Table<LocalVehicle, string>;
  fuel_logs!: Table<LocalFuelLog, string>;
  maintenance_logs!: Table<LocalMaintenanceLog, string>;
  assets!: Table<LocalAsset, string>;
  net_worth_snapshots!: Table<NetWorthSnapshot, string>;
  snapshot_recalc_queue!: Table<SnapshotRecalcQueue, string>; // FASE 3: Async snapshot recalc queue
  ai_cache!: Table<AICacheEntry, string>; // FASE 4: AI categorization cache

  /**
   * FASE 5: Dexie trigger for ai_cache invalidation on Category delete
   * When a category is deleted, clean all ai_cache entries pointing to it
   */
  private setupAIcacheTrigger(): void {
    this.table('categories').hook('deleting', (primaryKey, _obj, trans) => {
      // Delete all ai_cache entries with this category_id
      trans.table('ai_cache').where('category_id').equals(primaryKey).delete();
      console.debug(`[FASE-5] Cleared ai_cache for deleted category: ${primaryKey}`);
    });
  }


  /**
   * FASE 2: Seed SRI Ecuador categories with deterministic UUIDv5
   * Ensures default categories exist with proper tax classification
   */
  async seedSRICategories(): Promise<void> {
    const sriCategories = [
      {
        id: uuidv5('category_alimentacion', uuidv5.URL),
        tax_type: 'iva_0' as const,
        is_deductible: true,
        withholding_rate: null,
      },
      {
        id: uuidv5('category_salud', uuidv5.URL),
        tax_type: 'iva_0' as const,
        is_deductible: true,
        withholding_rate: null,
      },
      {
        id: uuidv5('category_educacion', uuidv5.URL),
        tax_type: 'iva_0' as const,
        is_deductible: true,
        withholding_rate: null,
      },
      {
        id: uuidv5('category_vivienda', uuidv5.URL),
        tax_type: 'iva_0' as const,
        is_deductible: true,
        withholding_rate: null,
      },
      {
        id: uuidv5('category_vestimenta', uuidv5.URL),
        tax_type: 'iva_15' as const,
        is_deductible: true,
        withholding_rate: null,
      },
      {
        id: uuidv5('category_general', uuidv5.URL),
        tax_type: 'iva_15' as const,
        is_deductible: false,
        withholding_rate: null,
      },
    ];

    const now = new Date().toISOString();

    for (const category of sriCategories) {
      const existing = await this.categories.where('id').equals(category.id).first();
      if (!existing) {
        await this.categories.add({
          ...category,
          is_deleted: false,
          updated_at: now,
          version: 1,
        });
        console.debug(`[FASE-2] Seeded SRI category: ${category.id}`);
      }
    }
  }

  constructor() {
    super('FinanceLocalFirstDB');

    // We only index properties that we will use in .where() queries.
    // The '&id' means it's a primary key and must be unique.
    // FASE 7: Added version index to critical financial tables for OCC conflict resolution
    // FASE 8.1: Added sync_conflicts table for conflict stashing
    // FASE 3: Added snapshot_recalc_queue for async snapshot recalculation (prevents deadlocks)
    // FASE 4: Added ai_cache for AI categorization caching (avoids redundant API calls)
    this.version(8).stores({
      sync_metadata: '&key',
      config: '&id, key, is_deleted, updated_at',
      exchange_rates: '&id, from_currency, to_currency, is_deleted, updated_at',
      categories: '&id, name, is_deleted, updated_at, version',
      accounts: '&id, name, is_deleted, updated_at, version',
      transactions: '&id, date, account_id, category_id, is_deleted, updated_at, version, hash, needs_review',
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
      net_worth_snapshots: '&id, date, month, year, is_stale, updated_at', // FASE PHOENIX FIX: Added date and updated_at indexes
      snapshot_recalc_queue: '&id, priority, enqueued_at', // FASE 3: Async snapshot recalc queue
      ai_cache: '&id, expires_at' // FASE 4: AI categorization cache with expiration index
    }).upgrade(async () => {
      // Migration from v7 to v8: fix hook initialization order
      console.log('[DB] Upgrading from v7 to v8 - ensuring hooks initialized after schema...');
      // No schema changes, just ensuring proper initialization order
    }).upgrade(async () => {
      // Migration from v6 to v7: add ai_cache table
      console.log('[DB] Upgrading from v6 to v7 - adding ai_cache table...');
      // Dexie automatically handles new table creation
    }).upgrade(async () => {
      // Migration from v5 to v6: add snapshot_recalc_queue table
      console.log('[DB] Upgrading from v5 to v6 - adding snapshot_recalc_queue table...');
      // Dexie automatically handles new table creation
    }).upgrade(async () => {
      // Migration from v2 to v3: add version index for OCC
      console.log('[DB] Upgrading from v2 to v3 - adding version indexes for OCC...');
      // Dexie automatically handles index additions for existing data
    }).upgrade(async () => {
      // Migration from v1 to v2: ensure credit_card_statements has proper indexes
      console.log('[DB] Upgrading from v1 to v2...');
    });

    // FASE 5: Setup AI cache invalidation trigger AFTER schema definition
    this.setupAIcacheTrigger();

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

    // FASE 3: Removed snapshot invalidation hooks - now handled by async SnapshotWorker
    // This prevents deadlocks during mass imports by decoupling snapshot recalculation


    // FASE 2: Temporal Consistency Trigger - Invalidate snapshots on transaction changes
    // When a transaction is created/updated/deleted, mark all snapshots >= transaction date as stale
    const invalidateSnapshots = async (obj: any) => {
      if (!obj.date) return;
      
      try {
        // @ts-ignore
        const staleSnapshots = await this.net_worth_snapshots
          .where('date')
          .aboveOrEqual(obj.date)
          .toArray();
        
        if (staleSnapshots.length > 0) {
          const snapshotIds = staleSnapshots.map((s: any) => s.id);
          const now = new Date().toISOString();
          
          // @ts-ignore
          await this.net_worth_snapshots.bulkUpdate(snapshotIds, {
            is_stale: true,
            updated_at: now
          });
          
          console.debug(`[FASE-2] Invalidated ${staleSnapshots.length} snapshots for transaction date ${obj.date}`);
        }
      } catch (error) {
        console.error('[FASE-2] Error invalidating snapshots:', error);
      }
    };

    this.transactions.hook('creating', (_primKey, obj, _trans) => {
      // Desacoplamos la invalidación para evitar SubTransactionError
      setTimeout(() => {
        invalidateSnapshots(obj).catch(err => {
          console.error('[FASE-2] Background snapshot invalidation error:', err);
        });
      }, 0);
    });

    this.transactions.hook('updating', (_modifications, _primKey, obj, _trans) => {
      // Desacoplamos la invalidación para evitar SubTransactionError
      setTimeout(() => {
        invalidateSnapshots(obj).catch(err => {
          console.error('[FASE-2] Background snapshot invalidation error:', err);
        });
      }, 0);
    });

    this.transactions.hook('deleting', (_primKey, obj, _trans) => {
      // Desacoplamos la invalidación para evitar SubTransactionError
      setTimeout(() => {
        invalidateSnapshots(obj).catch(err => {
          console.error('[FASE-2] Background snapshot invalidation error:', err);
        });
      }, 0);
    });
  }
}

// Phoenix Local Healer: Hard reset for irrecoverable schema corruption
// WARNING: This deletes ALL local data including sync_queue (offline changes)
// Only use when schema is corrupted beyond repair

// Panic counter for consecutive schema failures
let panicFailureCount = 0;
let panicFirstFailureTime: number | null = null;
const PANIC_THRESHOLD = 3; // 3 consecutive failures
const PANIC_WINDOW_MS = 60000; // 1 minute window

function recordSchemaFailure(): void {
  const now = Date.now();
  
  if (panicFirstFailureTime === null || now - panicFirstFailureTime > PANIC_WINDOW_MS) {
    // Reset counter if outside window or first failure
    panicFailureCount = 1;
    panicFirstFailureTime = now;
  } else {
    panicFailureCount++;
  }
  
  console.error(`[Phoenix Panic Counter] Schema failure ${panicFailureCount}/${PANIC_THRESHOLD} in window`);
  
  if (panicFailureCount >= PANIC_THRESHOLD) {
    console.error('[Phoenix Panic Counter] PANIC THRESHOLD REACHED - Triggering hard reset');
    phoenixHardReset();
  }
}

export async function phoenixHardReset(): Promise<void> {
  console.warn('[Phoenix Local Healer] Iniciando hard reset de IndexedDB...');
  
  // FASE 5: Export emergency JSON to localStorage before deletion
  // FASE 7: Fallback to Blob download if JSON exceeds 4MB (localStorage limit ~5MB)
  try {
    const tablesToExport = [
      'transactions', 'accounts', 'categories', 'budgets', 
      'subscriptions', 'ious', 'net_worth_snapshots'
    ];
    
    const emergencyExport: any = {
      timestamp: new Date().toISOString(),
      version: '7',
      tables: {}
    };
    
    for (const tableName of tablesToExport) {
      try {
        // @ts-ignore
        const data = await db.table(tableName).toArray();
        emergencyExport.tables[tableName] = data;
        console.debug(`[Phoenix Local Healer] Exported ${data.length} records from ${tableName}`);
      } catch (error) {
        console.warn(`[Phoenix Local Healer] Failed to export ${tableName}:`, error);
      }
    }
    
    const jsonString = JSON.stringify(emergencyExport);
    const sizeInBytes = new Blob([jsonString]).size;
    const sizeInMB = sizeInBytes / (1024 * 1024);
    
    console.log(`[Phoenix Local Healer] Emergency backup size: ${sizeInMB.toFixed(2)}MB (${sizeInBytes} bytes)`);
    
    // FASE 7: Fallback to Blob download if > 4MB (localStorage limit is ~5MB)
    if (sizeInBytes > 4 * 1024 * 1024) {
      console.warn(`[Phoenix Local Healer] Backup too large for localStorage (${sizeInMB.toFixed(2)}MB), triggering Blob download`);
      
      try {
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tabula_rasa_emergency_backup_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('[Phoenix Local Healer] Emergency backup downloaded as file');
      } catch (error) {
        console.error('[Phoenix Local Healer] Failed to download Blob backup:', error);
      }
    } else {
      // Store in localStorage as emergency backup
      const exportKey = 'phoenix_emergency_backup';
      try {
        localStorage.setItem(exportKey, jsonString);
        console.log(`[Phoenix Local Healer] Emergency backup saved to localStorage (${sizeInBytes} bytes)`);
      } catch (error) {
        console.error('[Phoenix Local Healer] Failed to save emergency backup to localStorage:', error);
        // FASE 7: Fallback to Blob download if localStorage fails
        try {
          const blob = new Blob([jsonString], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `tabula_rasa_emergency_backup_${new Date().toISOString().slice(0, 10)}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          console.log('[Phoenix Local Healer] Fallback: Emergency backup downloaded as file');
        } catch (blobError) {
          console.error('[Phoenix Local Healer] Failed to download Blob backup as fallback:', blobError);
        }
      }
    }
  } catch (error) {
    console.error('[Phoenix Local Healer] Error during emergency export:', error);
  }
  
  // Proceed with database deletion
  try {
    await db.delete();
    console.log('[Phoenix Local Healer] IndexedDB eliminada exitosamente');
  } catch (error) {
    console.error('[Phoenix Local Healer] Error al eliminar IndexedDB:', error);
  } finally {
    // Always reload after attempting deletion
    console.log('[Phoenix Local Healer] Recargando página...');
    window.location.reload();
  }
}

// Handle database opening errors with Phoenix auto-heal
function handleDbError(error: any): void {
  const errorName = error?.name || '';
  const errorMessage = error?.message || '';
  
  // Check for schema corruption errors that require hard reset
  const isSchemaError = 
    errorName === 'UpgradeError' ||
    errorName === 'SchemaError' ||
    errorName === 'VersionError' ||
    errorMessage.includes('DatabaseClosed') ||
    errorMessage.includes('schema') ||
    errorMessage.includes('version');
  
  if (isSchemaError) {
    console.error('[Phoenix Local Healer] Corrupción de esquema detectada, registrando fallo...');
    console.error('[Phoenix Local Healer] Error:', errorName, errorMessage);
    recordSchemaFailure(); // Record failure for panic counter
  } else {
    console.error('[DB] Error opening database (non-critical):', error);
  }
}

// Safe database open with error recovery
export async function safeOpenDB(): Promise<void> {
  try {
    await db.open();
    console.log('[DB] Database opened successfully');
    
    // FASE PHOENIX PROACTIVE: Health check - verify database is functional
    try {
      // Test read from transactions table to verify schema is valid
      await db.transactions.limit(1).toArray();
      console.log('[DB] Health check passed - database is functional');
    } catch (healthError) {
      console.error('[DB] Health check failed - database may be corrupted:', healthError);
      handleDbError(healthError);
    }
  } catch (error) {
    console.error('[DB] Critical error opening database:', error);
    handleDbError(error);
  }
}

export const db = new FinanceDatabase();

// Initialize database with error recovery
if (typeof window !== 'undefined') {
  safeOpenDB().catch(err => {
    console.error('[DB] Failed to initialize database:', err);
  });
}
