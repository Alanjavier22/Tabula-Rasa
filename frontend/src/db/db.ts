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
class TableStub {
  private name: string;
  
  constructor(name: string) {
    this.name = name;
  }

  where(_field: string) {
    return new WhereClauseStub(this.name);
  }

  orderBy(_field: string) {
    return new CollectionStub(this.name);
  }

  async each(_callback: (item: any) => void): Promise<void> {}

  async count(): Promise<number> {
    return 0;
  }

  async add(_item: any): Promise<string> {
    return '';
  }

  async put(_item: any): Promise<string> {
    return '';
  }

  async bulkPut(_items: any[]): Promise<void> {}

  async update(_id: string, _changes: any): Promise<number> {
    return 0;
  }

  async get(_id: string): Promise<any> {
    return undefined;
  }

  async toArray(): Promise<any[]> {
    return [];
  }

  filter(_predicate: (item: any) => boolean) {
    return new CollectionStub(this.name);
  }
}

/** Minimal WhereClause stub */
class WhereClauseStub {
  private tableName: string;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  between(_lower: any, _upper: any, _includeLower?: boolean, _includeUpper?: boolean) {
    return new CollectionStub(this.tableName);
  }

  equals(_value: any) {
    return new CollectionStub(this.tableName);
  }

  anyOf(_values: any[]) {
    return new CollectionStub(this.tableName);
  }

  and(_predicate: (item: any) => boolean) {
    return new CollectionStub(this.tableName);
  }

  startsWithIgnoreCase(_prefix: string) {
    return new CollectionStub(this.tableName);
  }
}

/** Minimal Collection stub */
class CollectionStub {
  constructor(_tableName: string) {}

  and(_predicate: (item: any) => boolean) {
    return this;
  }

  filter(_predicate: (item: any) => boolean) {
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

  async each(_callback: (item: any) => void): Promise<void> {}

  async toArray(): Promise<any[]> {
    return [];
  }

  async count(): Promise<number> {
    return 0;
  }

  async first(): Promise<any> {
    return undefined;
  }
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
  sync_queue = new TableStub('sync_queue');
  ious = new TableStub('ious');
  statements = new TableStub('statements');
  config = new TableStub('config');
  exchange_rates = new TableStub('exchange_rates');
  net_worth_snapshots = new TableStub('net_worth_snapshots');
  credit_card_statements = new TableStub('credit_card_statements');
  fuel_logs = new TableStub('fuel_logs');
  maintenance_logs = new TableStub('maintenance_logs');
  vehicles = new TableStub('vehicles');

  async transaction(_mode: string, _table: any, callback: () => Promise<any>): Promise<any> {
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

/** Re-export LocalTransaction type for components that import it from db/db */
export type { LocalTransaction } from '../types/schemas';
