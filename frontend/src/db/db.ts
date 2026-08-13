/**
 * db/db.ts - Stub module for legacy IndexedDB/Dexie services
 * 
 * This project uses a FastAPI + SQLite backend as the source of truth.
 * Multiple frontend services were designed for an offline-first PWA architecture
 * using IndexedDB (Dexie), but that layer was never completed.
 * 
 * This stub satisfies the import contracts so Vite can compile,
 * while all real data flows through the REST API (services/api.ts).
 */

/** Minimal Dexie-compatible table stub */
class TableStub<T = unknown> {
  private name: string;

  constructor(name: string) {
    this.name = name;
  }

  where(_field: string) {
    return new WhereClauseStub<T>(this.name);
  }

  orderBy(_field: string) {
    return new CollectionStub<T>(this.name);
  }

  async each(_callback: (item: T) => void): Promise<void> {}

  async count(): Promise<number> {
    return 0;
  }

  async add(_item: T): Promise<string> {
    return '';
  }

  async put(_item: T): Promise<string> {
    return '';
  }

  async bulkPut(_items: T[]): Promise<void> {}

  async update(_id: string, _changes: Partial<T>): Promise<number> {
    return 0;
  }

  async get(_id: string): Promise<T | undefined> {
    return undefined;
  }

  async toArray(): Promise<T[]> {
    return [];
  }

  filter(_predicate: (item: T) => boolean) {
    return new CollectionStub<T>(this.name);
  }
}

/** Minimal WhereClause stub */
class WhereClauseStub<T = unknown> {
  private tableName: string;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  between(_lower: unknown, _upper: unknown, _includeLower?: boolean, _includeUpper?: boolean) {
    return new CollectionStub<T>(this.tableName);
  }

  equals(_value: unknown) {
    return new CollectionStub<T>(this.tableName);
  }

  anyOf(_values: unknown[]) {
    return new CollectionStub<T>(this.tableName);
  }

  and(_predicate: (item: T) => boolean) {
    return new CollectionStub<T>(this.tableName);
  }

  startsWithIgnoreCase(_prefix: string) {
    return new CollectionStub<T>(this.tableName);
  }
}

/** Minimal Collection stub */
class CollectionStub<T = unknown> {
  constructor(_tableName: string) {}

  and(_predicate: (item: T) => boolean) {
    return this;
  }

  filter(_predicate: (item: T) => boolean) {
    return this;
  }

  reverse() {
    return this;
  }

  limit(_count: number) {
    return this;
  }

  offset(_count: number) {
    return this;
  }

  async each(_callback: (item: T) => void): Promise<void> {}

  async toArray(): Promise<T[]> {
    return [];
  }

  async count(): Promise<number> {
    return 0;
  }

  async first(): Promise<T | undefined> {
    return undefined;
  }
}

/**
 * Shapes for the tables VehicleService.ts actually reads/writes today.
 * No backend model exists yet for these (ver TECH_DEBT.md ítem 11) — estos
 * campos son solo los que ese servicio ya asume, no un diseño de la feature.
 */
interface VehicleRecord {
  id: string;
  current_odometer: number;
  updated_at: string;
}

interface FuelLogRecord {
  id: string;
  is_deleted: boolean;
  updated_at: string;
  vehicle_id: string;
  date: string;
  odometer_reading: number;
  cost_cents: number;
  gallons_or_liters: number;
}

interface MaintenanceLogRecord {
  id: string;
  is_deleted: boolean;
  updated_at: string;
  vehicle_id: string;
  date: string;
  odometer_reading: number;
  cost_cents: number;
  description?: string;
}

interface SyncQueueRecord {
  id: string;
  table_name: string;
  action: string;
  payload: unknown;
  timestamp: string;
  retry_count: number;
}

/** Database stub with all tables referenced by legacy services */
class DatabaseStub {
  transactions = new TableStub('transactions');
  categories = new TableStub('categories');
  accounts = new TableStub('accounts');
  budgets = new TableStub('budgets');
  subscriptions = new TableStub('subscriptions');
  reminders = new TableStub('reminders');
  snapshots = new TableStub('snapshots');
  sync_queue = new TableStub<SyncQueueRecord>('sync_queue');
  ious = new TableStub('ious');
  statements = new TableStub('statements');
  config = new TableStub('config');
  exchange_rates = new TableStub('exchange_rates');
  net_worth_snapshots = new TableStub('net_worth_snapshots');
  credit_card_statements = new TableStub('credit_card_statements');
  fuel_logs = new TableStub<FuelLogRecord>('fuel_logs');
  maintenance_logs = new TableStub<MaintenanceLogRecord>('maintenance_logs');
  vehicles = new TableStub<VehicleRecord>('vehicles');

  async transaction<T>(_mode: string, _tables: string[], callback: () => Promise<T>): Promise<T> {
    return await callback();
  }
}

export const db = new DatabaseStub();

/**
 * Phoenix hard reset - stub for GlobalErrorBoundary
 * Since we use a backend DB, this just reloads the page.
 */
export async function phoenixHardReset(): Promise<void> {
  window.location.reload();
}
