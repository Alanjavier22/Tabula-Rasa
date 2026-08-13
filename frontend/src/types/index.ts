export type TransactionType = 'income' | 'expense';

// Branded type for monetary values (cents) - prevents float assignment
export type Cents = number & { __brand: 'Cents' };

export type ExpenseType = 'fixed' | 'variable' | 'occasional';

export type PaymentMethod = 'cash' | 'credit_card' | 'debit_card' | 'transfer' | 'other';

export type AccountType = 'checking' | 'savings' | 'credit_card' | 'investment' | 'cash';

export type GoalStatus = 'active' | 'completed' | 'cancelled';

export type ReminderFrequency = 'once' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export type ReminderStatus = 'pending' | 'completed' | 'skipped';

export type SubscriptionFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface TransactionSplit {
  id: string;
  transaction_id: string;
  amount: Cents;
  category_id?: string;
  description?: string;
}

export interface Transaction {
  id: string;
  amount: Cents;
  description: string;
  transaction_type: TransactionType;
  expense_type?: ExpenseType;
  payment_method: PaymentMethod;
  date: string;
  category_id?: string;
  account_id?: string;
  goal_id?: string | null;
  metadata_json?: string;
  is_deleted?: boolean;
  hash?: string | null;
  created_at: string;
  updated_at: string;
  version: number;  // FASE 7: OCC versioning
  needs_review?: boolean;  // FASE 7: Conflict flag
  needs_clarification?: boolean;
  category?: Category;
  splits?: TransactionSplit[];
}

export type TaxType = 'iva_15' | 'iva_0' | 'exempt';

export interface Category {
  id: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  is_default: boolean;
  tax_type?: TaxType; // FASE 2: SRI Ecuador tax classification
  is_deductible?: boolean; // FASE 2: SRI deductible for personal expenses
  withholding_rate?: number; // FASE 2: Withholding rate in base 100 (e.g., 175 for 1.75%)
  version: number;  // FASE 7: OCC versioning
  needs_review?: boolean;  // FASE 7: Conflict flag
}

export interface Account {
  id: string;
  name: string;
  account_type: AccountType;
  balance: Cents;
  currency: string;
  credit_limit?: Cents;
  description?: string;
  bank_name?: string;
  linked_account_id?: string;
  is_active: boolean;
  statement_day?: number;
  payment_day?: number;
  created_at: string;
  updated_at: string;
  version: number;  // FASE 7: OCC versioning
  needs_review?: boolean;  // FASE 7: Conflict flag
}

// El backend usa `exclude_unset=True` en los PUT de accounts/statements: un
// campo enviado como `null` explícito borra el valor existente en la DB,
// distinto de omitirlo (que lo deja intacto). Por eso estos payloads de
// escritura permiten `null` en los campos opcionales que el usuario puede
// "vaciar" desde el form, a diferencia de Account/CreditCardStatement (los
// tipos de lectura), donde esos mismos campos son `T | undefined`.
export type AccountPayload = Partial<Omit<Account, 'credit_limit' | 'statement_day' | 'payment_day'>> & {
  credit_limit?: Cents | null;
  statement_day?: number | null;
  payment_day?: number | null;
};

export type StatementPayload = Partial<Omit<CreditCardStatement, 'payment_due_date' | 'cut_off_date' | 'notes'>> & {
  payment_due_date?: string | null;
  cut_off_date?: string | null;
  notes?: string | null;
};

export interface PaymentAlert {
  account_id: string;
  account_name: string;
  bank_name?: string;
  alert_type: 'payment_due' | 'statement_cut' | 'overdue';
  due_date?: string;
  days_remaining: number;
  amount_pending: number;
  statement_id?: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface AlertsResponse {
  alerts: PaymentAlert[];
  total_pending: number;
}

export interface Budget {
  id: string;
  name: string;
  amount: Cents;
  spent: Cents;
  month: number;
  year: number;
  category_id?: string;
  created_at: string;
  updated_at: string;
  version: number;  // FASE 7: OCC versioning
  needs_review?: boolean;  // FASE 7: Conflict flag
}

export interface Goal {
  id: string;
  name: string;
  target_amount: Cents;
  current_amount: Cents;
  target_date?: string | null;
  status: GoalStatus;
  description?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Reminder {
  id: string;
  name: string;
  amount?: Cents | null;
  due_date: string;
  frequency: ReminderFrequency;
  status: ReminderStatus;
  description?: string | null;
  category_id?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  version: number;  // FASE 7: OCC versioning
  needs_review?: boolean;  // FASE 7: Conflict flag
}

export interface Subscription {
  id: string;
  name: string;
  amount: Cents;
  frequency: SubscriptionFrequency;
  next_billing_date?: string | null;
  account_id?: string | null;
  category_id?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  version: number;  // FASE 7: OCC versioning
  needs_review?: boolean;  // FASE 7: Conflict flag
}

export type IOUType = 'i_owe' | 'they_owe';

export type IOUStatus = 'pending' | 'settled';

export interface IOU {
  id: string;
  person_name: string;
  amount: Cents;
  amount_paid?: Cents;
  iou_type: IOUType;
  status: IOUStatus;
  transaction_id?: string;
  description?: string;
  due_date?: string;
  created_at: string;
  updated_at: string;
  version: number;  // FASE 7: OCC versioning
  needs_review?: boolean;  // FASE 7: Conflict flag
}

export interface NetWorthSnapshot {
  id: string;
  month: number;
  year: number;
  total_assets: Cents;
  total_liabilities: Cents;
  net_worth: Cents;
  snapshot_date: string;
  metadata_json?: string;
}

export interface DebtShare {
  id: string;
  statement_id: string;
  person_name: string;
  amount: Cents;
  description?: string;
  status: string;
  version: number;  // FASE 7: OCC versioning
  needs_review?: boolean;  // FASE 7: Conflict flag
}

export interface CreditCardStatement {
  id: string;
  account_id: string;
  account_name?: string;
  statement_balance: Cents;
  user_share: Cents;
  payment_due_date?: string;
  cut_off_date?: string;
  amount_paid: Cents;
  status: string;
  month: number;
  year: number;
  notes?: string;
  debt_shares: DebtShare[];
  version: number;  // FASE 7: OCC versioning
  needs_review?: boolean;  // FASE 7: Conflict flag
}

export interface SafeToSpendResponse {
  safe_to_spend: number;
  monthly_income: number;
  current_balance: number;
  projected_fixed_expenses: number;
  actual_expenses: number;
  pending_cc_payments: number;
  pending_debt_shares: number;
  safe_to_spend_buffer: number;
  anomaly_leaks: number;
  projected_taxes: number;
  breakdown: {
    subscriptions: number;
    ious: number;
    credit_cards: number;
    debt_shares: number;
    seasonal: number;
  };
}

// Local service result (different from backend response)
export interface SafeToSpendResult {
  current_balance: number;
  projected_income: number;
  monthly_budgets: number;
  pending_debts: number;
  seasonal_projection: number;
  vehicle_maintenance_projection: number;
  base_safe_to_spend: number;
  ai_adjusted_safe_to_spend: number;
  days_until_month_end: number;
  prediction: 'positive' | 'negative';
}

export interface NetWorthResponse {
  net_worth: number;
  assets: number;
  liabilities: number;
  history: Array<{
    month: string;
    income: number;
    expense: number;
  }>;
}

export interface VehicleTelemetryResponse {
  total_distance: number;
  cost_per_km: number;
  total_vehicle_cost: number;
  month: number;
  year: number;
  historical_cost_per_km: number;
  next_maintenance_estimate: number | null;
}

export interface CashFlowForecastResponse {
  forecast: Array<{
    date: string;
    projected_balance: number;
  }>;
  current_balance: number;
  has_negative_balance: boolean;
}

export interface DashboardSummaryResponse {
  total_income: number;
  total_expenses: number;
  // El backend declara estos 3 arrays como `list[dict]` (sin schema Pydantic
  // estricto) y `value`/`gasto` salen de columnas Decimal - Pydantic las
  // serializa como string, no number, de ahí el union.
  expense_breakdown: Array<{ name: string; value: number | string }>;
  daily_spending: Array<{ date: string; gasto: number | string }>;
  monthly_comparison: Array<{ mes: string; Ingresos: number | string; Gastos: number | string }>;
  sankey_data: {
    nodes: Array<{ name: string }>;
    links: Array<{ source: number; target: number; value: number }>;
  };
  vehicle_cost: number;
}

// --- GET /categories/export ---
export interface CategoryExportItem {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  is_default: boolean;
  version: number;
}

// --- GET /metrics/cash-flow-projection/{days} ---
export interface CashFlowProjectionDaysResponse {
  days: number;
  current_balance: number;
  projected_balance: number;
  projected_income: number;
  projected_expenses: number;
  seasonal_adjustment: number;
  breakdown: {
    subscriptions: number;
    ious: number;
    credit_cards: number;
    debt_shares: number;
    seasonal: number;
  };
}

// --- GET /ai/insights ---
export interface AiInsightsResponse {
  insights: string[];
  alerts: string[];
  patterns: string[];
}

// --- GET /backup/list ---
export interface BackupFile {
  id: string;
  name: string;
  createdTime: string;
  size?: string | null;
  is_older_than_current?: boolean | null;
  age_hours?: number | null;
}

export interface BackupsListResponse {
  success: boolean;
  backups: BackupFile[];
  message: string;
}

// --- GET /fiscal/report, GET /fiscal/trend ---
// Los Decimal de Pydantic se serializan como string por defecto (no number).
export interface FiscalTotals {
  total_income: string;
  total_expenses: string;
  iva_projected: string;
  retencion_projected: string;
  total_deductible: string;
  iva_pagado_15: string;
  monto_objeto_retencion: string;
  transaction_count: number;
}

export interface FiscalCategoryBreakdownItem {
  category_id: string;
  category_name: string;
  amount: string;
  formatted: string;
}

export interface FiscalReportResponse {
  totals: FiscalTotals;
  category_breakdown: FiscalCategoryBreakdownItem[];
}

export interface MonthlyTrendItem {
  month: string;
  income: string;
  expenses: string;
  iva_projected: string;
}

// --- POST /api/ai/audio-to-txns, POST /api/ai/parse-receipt ---
export interface AiExtractedTransaction {
  description: string;
  amount: number;
  transaction_type: string;
  date: string;
  category_id?: string | null;
  account_id?: string | null;
}

export interface AudioToTxnResponse {
  transactions: AiExtractedTransaction[];
}

// --- GET /api/ai/whatif/suggest-scenarios ---
export interface SuggestedScenario {
  title: string;
  description: string;
  user_prompt: string;
}

// --- POST /api/ai/suggest-categories ---
export interface CategorySuggestion {
  transaction_id: string;
  suggested_category_id: string;
  confidence: number;
  reasoning: string;
}

// --- GET /api/ai/test-component ---
export interface TestComponentResponse {
  status: 'success' | 'error';
  message: string;
}

// --- GET /ai/goals/smart-recommendations ---
export interface GoalRecommendation {
  goal_id: string;
  goal_name: string;
  suggested_transfer_cents: number;
  reasoning: string;
}

export interface SmartGoalResponse {
  recommendations: GoalRecommendation[];
  total_suggested_cents: number;
  summary_message: string;
}

// --- POST /intelligence/import-statement/{account_id}, /intelligence/confirm-import/{id} ---
export interface StatementExtractedTransaction {
  date: string;
  description: string;
  amount_cents: number;
  transaction_type: string;
  category_name: string | null;
  is_deferred: boolean;
  deferred_info: string | null;
  fingerprint: string;
  category_id?: string;
  needs_clarification?: boolean;
  is_duplicate: boolean;
}

export interface StatementParsingResponse {
  issuer_identity: string;
  issuer_confidence: number;
  bank_name: string;
  card_type: string;
  statement_period: string;
  statement_month: number;
  statement_year: number;
  statement_balance_cents: number;
  payment_due_date: string | null;
  cut_off_date: string | null;
  total_new_consumos_cents: number;
  total_pagos_cents: number;
  credit_limit_cents: number | null;
  transactions: StatementExtractedTransaction[];
  audit: {
    consumos_match: boolean;
    pagos_match: boolean;
    calculated_consumos: number;
    calculated_pagos: number;
    extraction_method: string;
  };
}

export interface ImportStatementResponse {
  import_log_id: string;
  parsed_data: StatementParsingResponse;
}

export interface ConfirmImportResponse {
  status: 'success';
  imported_count: number;
  message: string;
}

// --- POST /intelligence/parse-account/{account_id}, /intelligence/confirm-account-import/{id} ---
export interface AccountExtractedTransaction {
  date: string;
  description: string;
  amount_cents: number;
  transaction_type: string;
  category_id?: string | null;
  category_name?: string | null;
  beneficiary?: string | null;
  balance_cents?: number | null;
  fingerprint: string;
  needs_clarification?: boolean;
  is_duplicate: boolean;
}

export interface AccountParsingResponse {
  bank_name: string;
  account_type: string;
  period_start: string | null;
  period_end: string | null;
  total_income_cents: number | null;
  total_expense_cents: number | null;
  transactions: AccountExtractedTransaction[];
}

export interface ParseAccountResponse {
  import_log_id: string;
  parsed_data: AccountParsingResponse;
}

export interface ConfirmAccountImportResponse {
  status: 'success';
  imported_count: number;
  message: string;
}

// --- POST /snapshots/{id}/analyze, POST /snapshots/reconcile ---
export interface AnalyzeSnapshotResponse {
  analysis: string | null;
  comparison_data: {
    current_month: string;
    previous_month: string;
    current: { total_assets: number; total_liabilities: number; net_worth: number; metadata: Record<string, unknown> };
    previous: { total_assets: number; total_liabilities: number; net_worth: number; metadata: Record<string, unknown> };
    changes: {
      assets_change: number;
      liabilities_change: number;
      net_worth_change: number;
      net_worth_percent_change: number;
    };
  };
}

export interface ReconcileStaleSnapshotsResponse {
  reconciled_count: number;
  failed_count: number;
  message: string;
}

// --- POST /transactions/import-batch ---
export interface ImportBatchResponse {
  imported_count: number;
  message: string;
}

// --- /config ---
export interface Config {
  id: string;
  key: string;
  value: string | null;
  value_type: string;
  description: string | null;
  is_public: boolean;
}

export interface GoogleDriveCredentials {
  client_id: string;
  client_secret: string;
  refresh_token: string;
}

// --- GET /auth/devices ---
export interface AuthDevice {
  id: string;
  device_name: string;
  last_sync: string | null;
  is_active: boolean;
  created_at: string | null;
}

export interface DeferredPayment {
  id: string;
  account_id: string;
  name: string;
  description?: string;
  total_amount: Cents;
  installment_amount: Cents;
  total_installments: number;
  current_installment: number;
  remaining_balance: Cents;
  is_shared: boolean;
  shared_with?: string;
  shared_amount?: Cents;
  start_date?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  version: number;
}
