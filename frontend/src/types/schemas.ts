import { z } from 'zod';

// Branded type for monetary values (cents) - prevents float assignment
const CentsSchema = z.number().int('Amount must be in cents (integer)').nonnegative('Amount must be non-negative').brand<'Cents'>();

// Transaction schema - amount must be integer cents
// FASE 1: Added version and hash for immutable identity with OCC conflict resolution
export const transactionSchema = z.object({
  id: z.string().uuid().optional(),
  account_id: z.string().uuid(),
  category_id: z.string().uuid().optional(),
  amount: CentsSchema, // Branded Cents type
  description: z.string().min(1, 'Description is required'),
  date: z.string().or(z.date()),
  transaction_type: z.enum(['income', 'expense']),
  payment_method: z.enum(['cash', 'credit_card', 'debit_card', 'transfer', 'other']),
  is_deleted: z.boolean().optional(),
  created_at: z.string().or(z.date()).optional(),
  updated_at: z.string().or(z.date()).optional(),
  version: z.number().int().default(1), // FASE 1: Version for OCC - starts at 1
  hash: z.string().optional(), // FASE 1: SHA-256 hash for deduplication/handshake
  needs_review: z.boolean().optional(), // FASE 1: Conflict flag
});

// Account schema - balance must be integer cents
export const accountSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Account name is required'),
  balance: CentsSchema, // Branded Cents type
  account_type: z.enum(['checking', 'savings', 'credit_card', 'cash']),
  is_active: z.boolean().default(true),
  linked_account_id: z.string().uuid().optional(),
  is_deleted: z.boolean().optional(),
  created_at: z.string().or(z.date()).optional(),
  updated_at: z.string().or(z.date()).optional(),
});

// Category schema - FASE 2: SRI Ecuador tax classification
export const categorySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Category name is required'),
  description: z.string().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  is_default: z.boolean().default(false),
  tax_type: z.enum(['iva_15', 'iva_0', 'exempt']).optional(), // FASE 2: SRI tax type
  is_deductible: z.boolean().optional(), // FASE 2: SRI deductible
  withholding_rate: z.number().optional(), // FASE 2: Withholding rate in base 100
  is_deleted: z.boolean().optional(),
  created_at: z.string().or(z.date()).optional(),
  updated_at: z.string().or(z.date()).optional(),
  version: z.number().int().default(1), // FASE 7: OCC versioning
  needs_review: z.boolean().optional(), // FASE 7: Conflict flag
});

export type TransactionInput = z.infer<typeof transactionSchema>;
export type AccountInput = z.infer<typeof accountSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;

// ============================================================================
// Dexie Local-First Interfaces - FASE 4: Moved from db/db to break cycles
// ============================================================================

export interface SyncMetadata {
  key: string;
  value: unknown;
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
  tax_type?: 'iva_15' | 'iva_0' | 'exempt'; // FASE 2: SRI tax classification
  is_deductible?: boolean; // FASE 2: SRI deductible
  withholding_rate?: number | null; // FASE 2: Withholding rate in base 100
  version?: number; // FASE 7: OCC versioning
  needs_review?: boolean; // FASE 7: Conflict flag
}

export interface LocalAccount {
  id: string;
  is_deleted: boolean;
  updated_at: string;
  linked_account_id?: string | null;
  balance: number;
  name?: string;
  currency?: string;
  account_type?: 'checking' | 'savings' | 'credit_card' | 'investment' | 'cash';
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
  payment_method?: 'cash' | 'credit_card' | 'debit_card' | 'transfer' | 'other'; // FASE 5: Payment method for UI display
  hash?: string; // SHA-256 for deduplication
  subscription_id?: string;
  metadata_json?: string; // FASE 4: JSON metadata for RUC, establishment, etc.
  version: number; // FASE 1: Required version field for OCC - starts at 1
  needs_review?: boolean; // FASE 1: Conflict flag
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
  payload: unknown;
  timestamp: string;
  retry_count: number;
}

export interface SyncErrorEntry {
  id: string;
  table_name: string;
  action: 'create' | 'update' | 'delete';
  payload: unknown;
  timestamp: string;
  retry_count: number;
  error_message: string;
  failed_at: string;
}

export interface SyncConflictEntry {
  id: string;
  table_name: string;
  record_id: string;
  local_data: unknown;
  server_data: unknown;
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

export interface SnapshotRecalcQueue {
  id: string; // Format: "YYYY-MM" for deduplication
  month: number;
  year: number;
  enqueued_at: string;
  priority: number; // Lower = higher priority (0 = immediate)
}

export interface AICacheEntry {
  id: string; // Hash of sanitized description + amount
  sanitized_description: string;
  category_id: string;
  confidence: number;
  is_anomaly: boolean;
  reasoning: string;
  cached_at: string;
  expires_at: string; // Cache entries expire after 30 days
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
