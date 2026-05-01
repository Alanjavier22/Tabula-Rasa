import axios from 'axios';
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';
import { db } from '../db/db';
import { prepareForAI, hydrateAIResponse } from '../utils/privacy';
import { parseCSVAsync } from '../utils/csvParsers';
import { generateTransactionHash } from '../utils/crypto';
// import { metricsService } from './MetricsService'; // Temporarily unused - using backend API
import { aiCashFlowService } from './AICashFlowService';
import { syncCoordinator } from './SyncCoordinator';

// UUIDv5 Namespace for Tabula Rasa (deterministic IDs)
const TABULA_RASA_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // DNS namespace

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

/**
 * Extract port from URL for port-aware token storage
 */
const getPortFromUrl = (url: string): string => {
  try {
    const urlObj = new URL(url);
    const port = urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80');
    return port;
  } catch {
    return '8001'; // Default fallback
  }
};

/**
 * Get port-specific token key (e.g., finance_token_8001)
 */
export const getTokenKey = (): string => {
  const baseUrl = localStorage.getItem('finance_base_url') || API_BASE_URL;
  const port = getPortFromUrl(baseUrl);
  return `finance_token_${port}`;
};

/**
 * Phoenix Protocol: Environment Health Verification
 * Auto-corrects misconfigured API URLs at startup
 */
export const verifyEnvironmentHealth = (): void => {
  const storedBaseUrl = localStorage.getItem('finance_base_url');
  
  if (storedBaseUrl) {
    // Auto-correct :8000 to :8001
    if (storedBaseUrl.includes(':8000')) {
      console.warn('[Phoenix] Detected :8000 in localStorage, autocorrecting to :8001');
      const correctedUrl = storedBaseUrl.replace(':8000', ':8001');
      localStorage.setItem('finance_base_url', correctedUrl);
    }
    // Auto-correct empty or invalid URLs
    else if (!storedBaseUrl.startsWith('http')) {
      console.warn('[Phoenix] Invalid base URL detected, clearing');
      localStorage.removeItem('finance_base_url');
    }
  }
};

// Run health check on module load
if (typeof window !== 'undefined') {
  verifyEnvironmentHealth();
}

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Dynamic Interceptor for Local-First Auth
api.interceptors.request.use(
  (config) => {
    const baseUrl = localStorage.getItem('finance_base_url');
    const tokenKey = getTokenKey();
    const token = localStorage.getItem(tokenKey);

    if (baseUrl) {
      // Clear old 8000 port from localStorage if present
      if (baseUrl.includes(':8000')) {
        localStorage.removeItem('finance_base_url');
      } else {
        config.baseURL = baseUrl;
      }
    }
    
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 401 Interceptor - Auto-logout on auth failure
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      console.warn('[API] 401 Unauthorized - logging out');
      
      // Stop sync coordinator to prevent infinite 401 loops
      syncCoordinator.stop();
      
      // Clear auth (port-aware)
      const tokenKey = getTokenKey();
      localStorage.removeItem(tokenKey);
      localStorage.removeItem('finance_base_url');
      
      // Redirect to login with message
      window.location.href = '/?msg=Sesión reiniciada por actualización de sistema';
    }
    return Promise.reject(error);
  }
);

// --- OFFLINE-FIRST LOCAL ADAPTERS (DEXIE) ---

const triggerLocalMutation = () => {
  window.dispatchEvent(new CustomEvent('localMutation'));
};

/**
 * FASE 2: Mutation Collapsing - Prevent OCC Thrashing
 * Collapses rapid successive updates to the same record into a single sync queue entry.
 * Wrapped in ACID transaction to prevent race conditions.
 *
 * Logic:
 * - Case A: Existing CREATE → update payload with new record state
 * - Case B: Existing UPDATE → deep merge payload data
 * - Case C: No existing → enqueue new UPDATE
 */
async function enqueueUpdateWithCollapsing(
  tableName: string,
  entityId: string,
  updatedRecord: any,
  timestamp: string
): Promise<void> {
  // @ts-ignore - ACID transaction prevents race conditions
  await db.transaction('rw', ['sync_queue'], async () => {
    // Search for pending operations on same entity/table
    // @ts-ignore
    const existingEntries = await db.sync_queue
      .where('table_name')
      .equals(tableName)
      .filter((entry: any) => {
        // Extract entity_id from payload based on action type
        if (entry.action === 'create') {
          return entry.payload?.id === entityId;
        } else if (entry.action === 'update') {
          return entry.payload?.id === entityId;
        }
        return false;
      })
      .toArray();

    if (existingEntries.length === 0) {
      // Case C: No existing entry → enqueue new UPDATE
      const syncQueueEntry = {
        id: uuidv4(),
        table_name: tableName,
        action: 'update' as const,
        payload: { id: entityId, data: updatedRecord },
        timestamp,
      };
      // @ts-ignore
      await db.sync_queue.add(syncQueueEntry);
      return;
    }

    // Get the most recent entry (highest timestamp)
    const mostRecent = existingEntries.sort((a: any, b: any) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )[0];

    if (mostRecent.action === 'create') {
      // Case A: Existing CREATE → update payload with new record state
      // @ts-ignore
      await db.sync_queue.update(mostRecent.id, {
        payload: updatedRecord, // Replace entire payload with new record state
        timestamp, // Update timestamp to reflect latest change
      });
    } else if (mostRecent.action === 'update') {
      // Case B: Existing UPDATE → deep merge payload data
      // Merge the new data into existing payload.data
      const mergedPayload = {
        id: entityId,
        data: { ...mostRecent.payload.data, ...updatedRecord },
      };
      // @ts-ignore
      await db.sync_queue.update(mostRecent.id, {
        payload: mergedPayload,
        timestamp,
      });
    }
  });
}

// --- HYDRATION MAP ---
// Define relaciones one-to-many que deben hidratarse al hacer localGet.
// Esto replica el `JOIN` que haría el backend, evitando que la UI reciba
// objetos con propiedades anidadas undefined.
//
// Estructura: parentTable -> [{ childTable, foreignKey, attachAs }]
type HydrationRule = {
  childTable: string;
  foreignKey: string;   // columna en la tabla hija que apunta al padre
  attachAs: string;     // nombre del array hidratado en cada padre
};

const HYDRATION_MAP: Record<string, HydrationRule[]> = {
  credit_card_statements: [
    { childTable: 'debt_shares', foreignKey: 'statement_id', attachAs: 'debt_shares' },
  ],
  transactions: [
    { childTable: 'transaction_splits', foreignKey: 'transaction_id', attachAs: 'splits' },
  ],
};

/**
 * Hidrata cada record con sus relaciones declaradas en HYDRATION_MAP.
 * Usa .where(foreignKey).anyOf(parentIds) para cargar solo registros relacionados,
 * evitando cargar toda la tabla hija en memoria.
 */
const hydrateRelations = async (tableName: string, parents: any[]): Promise<any[]> => {
  const rules = HYDRATION_MAP[tableName];
  if (!rules || rules.length === 0 || parents.length === 0) return parents;

  for (const rule of rules) {
    try {
      const parentIds = parents.map(p => p.id).filter(Boolean);
      if (parentIds.length === 0) return parents;

      // @ts-ignore - Query eficiente: solo hijos con foreignKey en parentIds
      const allChildren = await db.table(rule.childTable)
        .where(rule.foreignKey)
        .anyOf(parentIds)
        .filter((c: any) => !c.is_deleted)
        .toArray();

      // Agrupar por foreignKey en un Map para lookups O(1)
      const childrenByParent = new Map<string, any[]>();
      for (const child of allChildren) {
        const parentId = child[rule.foreignKey];
        if (!parentId) continue;
        const arr = childrenByParent.get(parentId) ?? [];
        arr.push(child);
        childrenByParent.set(parentId, arr);
      }

      // Adjuntar siempre un array (aunque vacío) para que la UI nunca vea undefined
      for (const parent of parents) {
        parent[rule.attachAs] = childrenByParent.get(parent.id) ?? [];
      }
    } catch (err) {
      // FASE PHOENIX AGGRESSIVE: Throw all Dexie errors - no fallback
      throw err;
    }
  }

  return parents;
};

const localGet = async (tableName: string, options?: { limit?: number; offset?: number }) => {
  try {
    // FIX: Defensive pagination to prevent OOM with 50k+ records
    const limit = options?.limit ?? 100; // Safe default: 100 records
    const offset = options?.offset ?? 0; // Safe default: start at 0
    
    // Delegate sorting to Dexie indexes instead of in-memory .sort()
    const sortField = tableName === 'transactions' ? 'date' : 'updated_at';
    // @ts-ignore – orderBy uses the indexed field for efficient B-tree traversal
    const records = await db.table(tableName)
      .orderBy(sortField)
      .reverse()
      .filter((t: any) => !t.is_deleted)
      .offset(offset)  // FIX: Apply pagination AFTER filter, BEFORE toArray
      .limit(limit)    // FIX: Limit memory footprint
      .toArray();

    // Hidratar relaciones declaradas (e.g. statements ← debt_shares)
    const safeRecords = Array.isArray(records) ? records : [];
    const hydrated = await hydrateRelations(tableName, safeRecords);

    return { data: hydrated };
  } catch (err) {
    // FASE PHOENIX AGGRESSIVE: Throw all Dexie errors - no fallback
    throw err;
  }
};

const localGetById = async (tableName: string, id: string) => {
  // @ts-ignore
  const record = await db.table(tableName).get(id);
  if (!record) throw new Error(`Record not found: ${tableName}/${id}`);
  if (record.is_deleted) throw new Error(`Record deleted: ${tableName}/${id}`);
  return { data: record };
};

// FASE 3: Helper to enqueue snapshot recalculation (prevents deadlocks)
async function enqueueSnapshotRecalc(date: string): Promise<void> {
  try {
    const dateObj = new Date(date);
    const month = dateObj.getMonth() + 1;
    const year = dateObj.getFullYear();
    const queueId = `${year}-${month.toString().padStart(2, '0')}`; // Format: "YYYY-MM"
    const now = new Date().toISOString();
    
    // @ts-ignore
    await db.snapshot_recalc_queue.put({
      id: queueId,
      month,
      year,
      enqueued_at: now,
      priority: 1, // Normal priority
    });
    console.debug(`[FASE-3] Enqueued snapshot recalc for ${queueId}`);
  } catch (error) {
    // FASE PHOENIX AGGRESSIVE: Throw all Dexie errors - no fallback
    throw error;
  }
}

const localCreate = async (tableName: string, data: any) => {
  const now = new Date().toISOString();
  let id: string;
  let hash: string | undefined;

  // Use UUIDv5 + SHA-256 hash for transactions (deterministic identity)
  if (tableName === 'transactions' && data.date && data.description && data.account_id) {
    const seed = `${data.account_id}:${data.date}:${data.description}:${data.amount}`;
    id = uuidv5(seed, TABULA_RASA_NAMESPACE);
    console.debug('[QualityGate-F1] UUIDv5 seed:', seed);
    hash = await generateTransactionHash(data.date, data.amount, data.description, data.account_id);
  } else {
    id = uuidv4(); // Keep uuidv4 for other tables (backward compatibility)
  }

  const newRecord = { ...data, id, is_deleted: false, created_at: now, updated_at: now, hash, version: 1 }; // FASE 1: Initialize version=1 for new transactions
  const syncQueueEntry = {
    id: uuidv4(),
    table_name: tableName,
    action: 'create' as const,
    payload: newRecord,
    timestamp: now,
  };

  // FASE 3: Enqueue snapshot recalc instead of synchronous invalidation (prevents deadlocks)
  if (tableName === 'transactions' && data.date) {
    await enqueueSnapshotRecalc(data.date);
  }

  // @ts-ignore
  await db.transaction('rw', [tableName, 'sync_queue'], async () => {
    // @ts-ignore
    await db.table(tableName).put(newRecord);
    // @ts-ignore
    await db.sync_queue.add(syncQueueEntry);
  });
  
  triggerLocalMutation();
  return { data: newRecord };
};

export const localUpdate = async (tableName: string, id: string, data: any) => {
  const now = new Date().toISOString();
  // @ts-ignore
  const existing = await db.table(tableName).get(id);
  if (!existing) throw new Error(`Record not found for update: ${tableName}/${id}`);
  
  // FASE 1: Immutable identity - keep original UUID, increment version, recalculate hash
  let updatedRecord = { ...existing, ...data, updated_at: now };
  if (tableName === 'transactions' && updatedRecord.date && updatedRecord.description && updatedRecord.account_id) {
    // Keep original id immutable (UUIDv5 from creation)
    // Increment version for OCC conflict resolution
    updatedRecord.version = (existing.version || 1) + 1;
    // Recalculate SHA-256 hash to reflect new data (vital for server handshake)
    updatedRecord.hash = await generateTransactionHash(
      updatedRecord.date,
      updatedRecord.amount,
      updatedRecord.description,
      updatedRecord.account_id
    );
  }

  // FASE 3: Enqueue snapshot recalc instead of synchronous invalidation (prevents deadlocks)
  const txDate = data.date || existing.date;
  if (tableName === 'transactions' && txDate) {
    await enqueueSnapshotRecalc(txDate);
  }

  // @ts-ignore - Update local record
  await db.table(tableName).put(updatedRecord);
  
  // FASE 2: Use mutation collapsing for sync queue (prevents OCC thrashing)
  await enqueueUpdateWithCollapsing(tableName, id, updatedRecord, now);
  
  triggerLocalMutation();
  return { data: updatedRecord };
};

const localDelete = async (tableName: string, id: string) => {
  const now = new Date().toISOString();
  // @ts-ignore
  const existing = await db.table(tableName).get(id);
  if (existing) {
    const updatedRecord = { ...existing, is_deleted: true, updated_at: now };
    const syncQueueEntry = {
      id: uuidv4(),
      table_name: tableName,
      action: 'delete',
      payload: { id },
      timestamp: now,
    };

    let orphanCount = 0;
    let staleCount = 0;
    const txDate = existing.date;

    // Build transaction scope based on table type
    let txTables = [tableName, 'sync_queue'];
    if (tableName === 'transactions') {
      txTables.push('net_worth_snapshots');
    } else if (tableName === 'accounts' || tableName === 'categories') {
      txTables.push('transactions');
    }

    // @ts-ignore
    await db.transaction('rw', txTables, async () => {
      // Handle account/category orphan prevention
      if (tableName === 'accounts' || tableName === 'categories') {
        const foreignKey = tableName === 'accounts' ? 'account_id' : 'category_id';
        // @ts-ignore
        const relatedTransactions = await db.transactions.where(foreignKey).equals(id).toArray();

        if (relatedTransactions.length > 0) {
          orphanCount = relatedTransactions.length;
          for (const txn of relatedTransactions) {
            // @ts-ignore
            await db.transactions.update(txn.id, {
              [foreignKey]: null, // Move to Uncategorized
              needs_review: true,
              updated_at: now,
            });
          }
          console.debug(`[QualityGate-F3] Prevented orphans: ${orphanCount} records moved to review`);
        }
      }

      // Handle snapshot invalidation for transactions
      if (tableName === 'transactions' && txDate) {
        // Invalidate snapshots >= transaction date
        // @ts-ignore
        const staleSnapshots = await db.net_worth_snapshots.where('date').aboveOrEqual(txDate).toArray();
        if (staleSnapshots.length > 0) {
          staleCount = staleSnapshots.length;
          const snapshotIds = staleSnapshots.map((s: any) => s.id);
          // @ts-ignore
          await db.net_worth_snapshots.bulkUpdate(snapshotIds, { is_stale: true, needs_review: true });
          console.debug(`[QualityGate-F4] Marked ${staleCount} snapshots as stale due to retroactive transaction on ${txDate}`);
        }
      }

      // Perform the actual delete/update
      // @ts-ignore
      await db.table(tableName).put(updatedRecord);
      // @ts-ignore
      await db.sync_queue.add(syncQueueEntry);
    });
    
    if (staleCount > 0) {
      window.dispatchEvent(new CustomEvent('snapshotsStale', { detail: { count: staleCount, transactionDate: txDate } }));
    }
    
    triggerLocalMutation();
  }
  return { data: { success: true } };
};

// --- CORE FINANCIAL APIS (LOCAL) ---

export const transactionsAPI = {
  getAll: (options?: { limit?: number; offset?: number }) => localGet('transactions', options), // FIX: Pass pagination options
  getById: (id: string) => localGetById('transactions', id),
  create: (data: any) => localCreate('transactions', data),
  update: (id: string, data: any) => localUpdate('transactions', id, data),
  delete: (id: string) => localDelete('transactions', id),
};

export const categoriesAPI = {
  getAll: (options?: { limit?: number; offset?: number }) => localGet('categories', options), // FIX: Pass pagination options
  getById: (id: string) => localGetById('categories', id),
  create: (data: any) => localCreate('categories', data),
  update: (id: string, data: any) => localUpdate('categories', id, data),
  delete: (id: string) => localDelete('categories', id),
};

export const accountsAPI = {
  getAll: (options?: { limit?: number; offset?: number }) => localGet('accounts', options), // FIX: Pass pagination options
  getById: (id: string) => localGetById('accounts', id),
  create: (data: any) => localCreate('accounts', data), // FIX: Eliminated SQLite relic 1/0 casting, Dexie supports native booleans
  update: (id: string, data: any) => localUpdate('accounts', id, data), // FIX: Eliminated SQLite relic 1/0 casting, Dexie supports native booleans
  delete: (id: string) => localDelete('accounts', id),
};

export const budgetsAPI = {
  getAll: (options?: { limit?: number; offset?: number }) => localGet('budgets', options), // FIX: Pass pagination options
  getById: (id: string) => localGetById('budgets', id),
  create: (data: any) => localCreate('budgets', data),
  update: (id: string, data: any) => localUpdate('budgets', id, data),
  delete: (id: string) => localDelete('budgets', id),
};

export const goalsAPI = {
  getAll: (options?: { limit?: number; offset?: number }) => localGet('goals', options), // FIX: Pass pagination options
  getById: (id: string) => localGetById('goals', id),
  create: (data: any) => localCreate('goals', data),
  update: (id: string, data: any) => localUpdate('goals', id, data),
  delete: (id: string) => localDelete('goals', id),
};

export const remindersAPI = {
  getAll: (options?: { limit?: number; offset?: number }) => localGet('reminders', options), // FIX: Pass pagination options
  getById: (id: string) => localGetById('reminders', id),
  create: (data: any) => localCreate('reminders', data),
  update: (id: string, data: any) => localUpdate('reminders', id, data),
  delete: (id: string) => localDelete('reminders', id),
};

export const subscriptionsAPI = {
  getAll: (options?: { limit?: number; offset?: number }) => localGet('subscriptions', options), // FIX: Pass pagination options
  getById: (id: string) => localGetById('subscriptions', id),
  create: (data: any) => localCreate('subscriptions', data),
  update: (id: string, data: any) => localUpdate('subscriptions', id, data),
  delete: (id: string) => localDelete('subscriptions', id),
};

export const statementsAPI = {
  getAll: (options?: { limit?: number; offset?: number }) => localGet('credit_card_statements', options), // FIX: Pass pagination options
  getById: (id: string) => localGetById('credit_card_statements', id),
  create: (data: any) => localCreate('credit_card_statements', data),
  update: (id: string, data: any) => localUpdate('credit_card_statements', id, data),
  delete: (id: string) => localDelete('credit_card_statements', id),
  addShare: (statementId: string, data: any) => localCreate('debt_shares', { ...data, statement_id: statementId }),
  updateShare: (shareId: string, data: any) => localUpdate('debt_shares', shareId, data),
  deleteShare: (shareId: string) => localDelete('debt_shares', shareId),
};

export const iousAPI = {
  getAll: (options?: { limit?: number; offset?: number }) => localGet('ious', options), // FIX: Pass pagination options
  getPending: async () => {
    // @ts-ignore
    const records = await db.table('ious').filter(t => !t.is_deleted && t.amount > t.amount_paid).toArray();
    return { data: records };
  },
  getById: (id: string) => localGetById('ious', id),
  create: (data: any) => localCreate('ious', data),
  update: (id: string, data: any) => localUpdate('ious', id, data),
  settle: async (id: string, data: { account_id?: string }) => {
    const now = new Date().toISOString();
    
    // @ts-ignore - Atomic transaction across ious, transactions, accounts
    return await db.transaction('rw', [db.ious, db.transactions, db.accounts], async () => {
      // @ts-ignore
      const iou = await db.ious.get(id);
      if (!iou) throw new Error(`IOU not found: ${id}`);
      if (iou.is_deleted) throw new Error(`IOU deleted: ${id}`);

      const remaining = iou.amount - (iou.amount_paid || 0);
      if (remaining <= 0) throw new Error('Already fully paid');

      // Validate account balance if provided
      if (data.account_id) {
        // @ts-ignore
        const account = await db.accounts.get(data.account_id);
        if (!account) throw new Error(`Account not found: ${data.account_id}`);
        if (account.is_deleted) throw new Error(`Account deleted: ${data.account_id}`);
        if (account.balance < remaining) throw new Error('Insufficient account balance');

        // Update account balance (subtract payment amount)
        // @ts-ignore
        await db.accounts.update(data.account_id, { balance: account.balance - remaining, updated_at: now });
      }

      // Create transaction record for the payment
      const txnId = uuidv4();
      const paymentTxn = {
        id: txnId,
        description: `IOU Payment: ${iou.description || 'Payment'}`,
        amount: remaining,
        transaction_type: 'expense',
        payment_method: 'transfer',
        date: now,
        category_id: null,
        account_id: data.account_id || null,
        expense_type: null,
        is_deleted: false,
        created_at: now,
        updated_at: now,
      };
      // @ts-ignore
      await db.transactions.put(paymentTxn);

      // Update IOU with amount_paid
      const updatedIou = { ...iou, amount_paid: (iou.amount_paid || 0) + remaining, transaction_id: txnId, updated_at: now };
      // @ts-ignore
      await db.ious.put(updatedIou);

      // Add sync queue entries for atomic operations (complete objects)
      // @ts-ignore
      await db.sync_queue.add({
        id: uuidv4(),
        table_name: 'transactions',
        action: 'create',
        payload: paymentTxn,
        timestamp: now,
      });
      // @ts-ignore
      await db.sync_queue.add({
        id: uuidv4(),
        table_name: 'ious',
        action: 'update',
        payload: updatedIou, // Complete object, not delta
        timestamp: now,
      });
      if (data.account_id) {
        // @ts-ignore
        const updatedAccount = await db.accounts.get(data.account_id);
        // @ts-ignore
        await db.sync_queue.add({
          id: uuidv4(),
          table_name: 'accounts',
          action: 'update',
          payload: updatedAccount, // Complete object after mutation
          timestamp: now,
        });
      }

      triggerLocalMutation();
      return { data: updatedIou };
    });
  },
  delete: (id: string) => localDelete('ious', id),
};

// --- ONLINE REQUIRED APIS (AXIOS) ---

export const metricsAPI = {
  getSafeToSpend: () => api.get('/metrics/safe-to-spend'),
  getNetWorth: () => api.get('/metrics/net-worth'),
  getVehicleTelemetry: () => api.get('/metrics/vehicle-telemetry'),
  getCashFlowForecast: () => api.get('/metrics/cash-flow-forecast'),
  getDashboardSummary: async () => {
    try {
      // Use snapshots instead of processing all transactions
      // @ts-ignore
      const snapshots = await db.net_worth_snapshots
        .orderBy('date')
        .reverse()
        .limit(12)
        .toArray();

      if (snapshots.length > 0) {
        // Calculate summary from snapshots (cached data)
        const latest = snapshots[0];
        const totalNetWorth = latest.net_worth_cents;
        const monthlyIncome = snapshots.reduce((sum, s) => sum + s.income_cents, 0) / snapshots.length;
        const monthlyExpense = snapshots.reduce((sum, s) => sum + s.expense_cents, 0) / snapshots.length;

        return {
          data: {
            net_worth: totalNetWorth,
            monthly_income: Math.round(monthlyIncome),
            monthly_expense: Math.round(monthlyExpense),
            snapshot_count: snapshots.length,
            source: 'snapshots'
          }
        };
      }
    } catch (err) {
      // FASE PHOENIX AGGRESSIVE: Throw all Dexie errors - no fallback
      throw err;
    }

    // Fallback to API if no snapshots or Dexie error
    return api.get('/metrics/dashboard-summary');
  },
  getInsights: () => api.get('/ai/insights'),
};

export const aiAPI = {
  audioToTransactions: (audioData: { audio_base64: string; audio_format?: string }) => 
    api.post('/ai/audio-to-txns', audioData),
  documentToTransactions: (documentData: { document_base64: string; document_type?: string }) => 
    api.post('/ai/document-to-txns', documentData),
  batchCategoryMapping: (descriptions: { descriptions: string[] }) => {
    const { sanitized } = prepareForAI(descriptions);
    return api.post('/ai/batch-category-mapping', { descriptions: sanitized });
  },
  suggestCategories: (data: { transactions: any[]; categories: any[] }) => 
    api.post('/ai/suggest-categories', data),
};

export const snapshotsAPI = {
  create: (data: { month: number; year: number }) => api.post('/snapshots/create', data),
  getAll: (params?: any) => api.get('/snapshots', { params }),
  getById: (id: string) => api.get(`/snapshots/${id}`),
  getByMonthYear: (month: number, year: number) => api.get(`/snapshots/month/${month}/year/${year}`),
  delete: (id: string) => api.delete(`/snapshots/${id}`),
  analyze: (id: string) => api.post(`/snapshots/${id}/analyze`),
  reconcile: () => api.post('/snapshots/reconcile'), // FASE 6: Manual reconciliation endpoint
};

export const aiAssistantAPI = {
  chat: async (message: string, includeCashFlow: boolean = false, includeAssets: boolean = false) => {
    // Sanitize message with hydration map
    const { sanitized: sanitizedMessage, hydrationMap: messageMap } = prepareForAI(message);

    // Get CashFlow context if requested
    let cashFlowContext = null;
    if (includeCashFlow) {
      const context = await aiCashFlowService.getAIContext();
      cashFlowContext = {
        current_balance_cents: context.current_balance_cents,
        safe_to_spend_30d: context.safe_to_spend_30d,
        safe_to_spend_60d: context.safe_to_spend_60d,
        safe_to_spend_90d: context.safe_to_spend_90d,
        projected_income_30d: context.projected_income_30d,
        projected_expenses_30d: context.projected_expenses_30d,
        seasonal_adjustment_30d: context.seasonal_adjustment_30d,
        subscriptions_due_30d: context.subscriptions_due_30d,
        ious_pending_30d: context.ious_pending_30d,
      };
    }

    // Get Assets context if requested
    let assetsContext = null;
    if (includeAssets) {
      const context = await aiCashFlowService.getAIContext();
      assetsContext = {
        assets_total_value_cents: context.assets_total_value_cents,
        assets_details: context.assets_details,
      };
    }

    const response = await api.post('/ai-assistant/chat', {
      message: sanitizedMessage,
      cash_flow_context: cashFlowContext,
      assets_context: assetsContext,
    });

    // Hydrate response with original values
    const hydratedResponse = hydrateAIResponse(response.data.response, messageMap);

    return {
      ...response.data,
      response: hydratedResponse,
    };
  },
};

export const importAPI = {
  uploadCSV: async (file: File, accountId: string, onProgress?: (progress: number) => void) => {
    // Read CSV locally
    const text = await file.text();
    
    // Parse using async chunked parser (prevents RAM overflow with 50k+ records)
    // Deduplication now happens inside parseCSVAsync
    const parsedTransactions = await parseCSVAsync(text, accountId, onProgress);
    
    if (parsedTransactions.length === 0) {
      return { data: { imported: 0, message: 'No valid transactions found' } };
    }

    // Get existing transaction hashes to detect duplicates (optimized with index)
    // Note: Deduplication already handled in parseCSVAsync, but keep for safety
    const batchHashes: string[] = [];
    for (const txn of parsedTransactions) {
      const hash = await generateTransactionHash(
        txn.date, 
        txn.amount, 
        txn.description, 
        accountId
      );
      batchHashes.push(hash);
    }

    // Use indexed query for efficient hash lookup
    // @ts-ignore
    const existingTxnsByHash = await db.transactions
      .where('hash')
      .anyOf(batchHashes)
      .toArray();
    
    const existingHashes = new Map<string, boolean>();
    for (const txn of existingTxnsByHash) {
      if (txn.hash) {
        existingHashes.set(txn.hash, true);
      }
    }

    // Filter out duplicates using SHA-256
    const newTransactions: typeof parsedTransactions = [];
    for (let i = 0; i < parsedTransactions.length; i++) {
      const txn = parsedTransactions[i];
      const hash = batchHashes[i];
      if (!existingHashes.has(hash)) {
        newTransactions.push(txn);
      }
    }

    if (newTransactions.length === 0) {
      return { data: { imported: 0, message: 'All transactions already exist' } };
    }

    // Extract descriptions for AI categorization
    const descriptions = newTransactions.map(t => t.description).filter(d => d);

    // Sanitize descriptions before sending to AI
    const sanitizedDescriptions = descriptions.map(d => prepareForAI(d));

    // Get category suggestions from AI
    const aiResponse = await api.post('/ai/batch-category-mapping', {
      descriptions: sanitizedDescriptions,
    });

    const categoryMap = aiResponse.data?.mappings || {};

    // Calculate total amount for balance update
    const totalAmount = newTransactions.reduce((sum, t) => {
      return t.transaction_type === 'income' ? sum + t.amount : sum - t.amount;
    }, 0);

    // ATOMIC TRANSACTION: All or nothing with chunked bulkAdd (prevents blocking)
    const now = new Date().toISOString();
    const CHUNK_SIZE = 1000;
    // @ts-ignore
    await db.transaction('rw', [db.transactions, db.accounts, db.sync_queue], async () => {
      // Get current account balance
      // @ts-ignore
      const account = await db.accounts.get(accountId);
      if (!account) throw new Error('Account not found');

      // Insert transactions in chunks with UI yielding
      for (let i = 0; i < newTransactions.length; i += CHUNK_SIZE) {
        const chunk = newTransactions.slice(i, i + CHUNK_SIZE);
        const chunkTxns: any[] = [];
        
        for (const txn of chunk) {
          const id = uuidv4();
          const sanitized = prepareForAI(txn);
          const hash = await generateTransactionHash(
            txn.date,
            txn.amount,
            txn.description,
            accountId
          );
          const newTxn = {
            ...sanitized,
            id,
            account_id: accountId,
            category_id: categoryMap[txn.description] || null,
            payment_method: 'transfer',
            is_deleted: false,
            created_at: now,
            updated_at: now,
            hash, // Save SHA-256 hash for future deduplication
          };
          chunkTxns.push(newTxn);
        }
        
        // Bulk add chunk to Dexie
        // @ts-ignore
        await db.transactions.bulkAdd(chunkTxns);
        
        // Add sync queue entries for chunk
        for (const txn of chunkTxns) {
          // @ts-ignore
          await db.sync_queue.add({
            id: uuidv4(),
            table_name: 'transactions',
            action: 'create',
            payload: txn,
            timestamp: now,
            retry_count: 0,
          });
        }
        
        // Yield UI after each chunk (prevents browser freeze)
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      // Update account balance atomically
      // @ts-ignore
      await db.accounts.update(accountId, { 
        balance: account.balance + totalAmount,
        updated_at: now 
      });
      // @ts-ignore
      await db.sync_queue.add({
        id: uuidv4(),
        table_name: 'accounts',
        action: 'update',
        payload: { ...account, balance: account.balance + totalAmount, updated_at: now },
        timestamp: now,
        retry_count: 0,
      });
    });

    return { data: { imported: newTransactions.length, total: parsedTransactions.length, duplicates: parsedTransactions.length - newTransactions.length } };
  },
};

export const configAPI = {
  getAll: (params?: any) => api.get('/config', { params }),
  getByKey: (key: string) => api.get(`/config/${key}`),
  create: (data: any) => api.post('/config', data),
  update: (key: string, data: any) => api.put(`/config/${key}`, data),
  delete: (key: string) => api.delete(`/config/${key}`),
};

export const authAPI = {
  generatePairingCode: () => api.post('/auth/pair/generate'),
  consumePairingCode: (pin: string, deviceName: string) => api.post('/auth/pair/consume', { pin, device_name: deviceName }),
  getPairingStatus: (pin: string) => api.get(`/auth/pair/status?pin=${pin}`),
  pairLocalhost: () => axios.post('http://127.0.0.1:8001/auth/pair/localhost'),
};

export const syncAPI = {
  syncChanges: (payload: any) => api.post('/sync', payload),
  getStatus: () => api.get('/sync/status'),
};

export default api;
