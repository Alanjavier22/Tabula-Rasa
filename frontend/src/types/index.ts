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
  metadata_json?: string;
  created_at: string;
  updated_at: string;
  version: number;  // FASE 7: OCC versioning
  needs_review?: boolean;  // FASE 7: Conflict flag
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
  target_date?: string;
  status: GoalStatus;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface Reminder {
  id: string;
  name: string;
  amount?: Cents;
  due_date: string;
  frequency: ReminderFrequency;
  status: ReminderStatus;
  description?: string;
  category_id?: string;
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
  next_billing_date?: string;
  account_id?: string;
  category_id?: string;
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
  expense_breakdown: Array<{ name: string; value: number }>;
  daily_spending: Array<{ date: string; gasto: number }>;
  monthly_comparison: Array<{ mes: string; Ingresos: number; Gastos: number }>;
  sankey_data: {
    nodes: Array<{ name: string }>;
    links: Array<{ source: number; target: number; value: number }>;
  };
  vehicle_cost: number;
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
