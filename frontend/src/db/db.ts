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
  where(_field: string) {
    return new WhereClauseStub<T>();
  }

  orderBy(_field: string) {
    return new CollectionStub<T>();
  }

  async each(_callback: (item: T) => void): Promise<void> {
    return undefined;
  }

  async count(): Promise<number> {
    return 0;
  }

  async add(_item: T): Promise<string> {
    return '';
  }

  async put(_item: T): Promise<string> {
    return '';
  }

  async bulkPut(_items: T[]): Promise<void> {
    return undefined;
  }

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
    return new CollectionStub<T>();
  }
}

/** Minimal WhereClause stub */
class WhereClauseStub<T = unknown> {
  between(_lower: unknown, _upper: unknown, _includeLower?: boolean, _includeUpper?: boolean) {
    return new CollectionStub<T>();
  }

  equals(_value: unknown) {
    return new CollectionStub<T>();
  }

  anyOf(_values: unknown[]) {
    return new CollectionStub<T>();
  }

  and(_predicate: (item: T) => boolean) {
    return new CollectionStub<T>();
  }

  startsWithIgnoreCase(_prefix: string) {
    return new CollectionStub<T>();
  }
}

/** Minimal Collection stub */
class CollectionStub<T = unknown> {
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

  async each(_callback: (item: T) => void): Promise<void> {
    return undefined;
  }

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
 * No backend model exists yet for these (ver `.agents/PROJECT_CONTEXT.md`) — estos
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
  transactions = new TableStub();
  categories = new TableStub();
  accounts = new TableStub();
  budgets = new TableStub();
  subscriptions = new TableStub();
  reminders = new TableStub();
  snapshots = new TableStub();
  sync_queue = new TableStub<SyncQueueRecord>();
  ious = new TableStub();
  statements = new TableStub();
  config = new TableStub();
  exchange_rates = new TableStub();
  net_worth_snapshots = new TableStub();
  credit_card_statements = new TableStub();
  fuel_logs = new TableStub<FuelLogRecord>();
  maintenance_logs = new TableStub<MaintenanceLogRecord>();
  vehicles = new TableStub<VehicleRecord>();

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
