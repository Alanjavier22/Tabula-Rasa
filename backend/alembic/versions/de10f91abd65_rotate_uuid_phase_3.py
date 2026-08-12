"""rotate_uuid_phase_3

Revision ID: de10f91abd65
Revises: e9aa56991e55
Create Date: 2026-04-29

Strategy: Pure SQL (CREATE-COPY-DROP-RENAME) to avoid batch_alter_table
index reflection bugs. Each table definition matches the ACTUAL schema
inspected from the live database.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'de10f91abd65'
down_revision: Union[str, None] = 'e9aa56991e55'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (table_name, create_sql, insert_sql)
# Columns verified against PRAGMA table_info output.
# All Numeric(12,2) columns preserved. Only id/FK types change to VARCHAR(36).

TABLE_DEFINITIONS = []

# --- accounts ---
# Original cols: id, name, account_type, balance, currency, description, is_active, created_at, updated_at, bank_name, linked_account_id
TABLE_DEFINITIONS.append(('accounts', """
CREATE TABLE accounts_new (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    name VARCHAR NOT NULL,
    account_type VARCHAR(11) NOT NULL,
    balance NUMERIC(12, 2),
    currency VARCHAR,
    description VARCHAR,
    is_active INTEGER,
    created_at DATETIME,
    updated_at DATETIME,
    bank_name TEXT,
    linked_account_id VARCHAR(36) REFERENCES accounts_new(id) ON DELETE SET NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT 0
)
""", """
INSERT INTO accounts_new (id, name, account_type, balance, currency, description, is_active, created_at, updated_at, bank_name, linked_account_id, is_deleted)
SELECT global_id, name, account_type, balance, currency, description, is_active, created_at, updated_at, bank_name, global_linked_account_id, 0
FROM accounts
"""))

# --- categories ---
# Original cols: id, name, description, color, icon, is_default
# NO created_at, NO updated_at
TABLE_DEFINITIONS.append(('categories', """
CREATE TABLE categories_new (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    name VARCHAR NOT NULL UNIQUE,
    description VARCHAR,
    color VARCHAR,
    icon VARCHAR,
    is_default INTEGER,
    is_deleted BOOLEAN NOT NULL DEFAULT 0
)
""", """
INSERT INTO categories_new (id, name, description, color, icon, is_default, is_deleted)
SELECT global_id, name, description, color, icon, is_default, 0
FROM categories
"""))

# --- transactions ---
# Original cols: id, amount, description, transaction_type, expense_type, payment_method, date, category_id, account_id, created_at, updated_at, metadata_json
TABLE_DEFINITIONS.append(('transactions', """
CREATE TABLE transactions_new (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    amount NUMERIC(12, 2) NOT NULL,
    description VARCHAR NOT NULL,
    transaction_type VARCHAR(7) NOT NULL,
    expense_type VARCHAR(10),
    payment_method VARCHAR(11) NOT NULL,
    date DATETIME NOT NULL,
    category_id VARCHAR(36) REFERENCES categories(id) ON DELETE SET NULL,
    account_id VARCHAR(36) REFERENCES accounts(id) ON DELETE CASCADE,
    created_at DATETIME,
    updated_at DATETIME,
    metadata_json VARCHAR,
    is_deleted BOOLEAN NOT NULL DEFAULT 0
)
""", """
INSERT INTO transactions_new (id, amount, description, transaction_type, expense_type, payment_method, date, category_id, account_id, created_at, updated_at, metadata_json, is_deleted)
SELECT global_id, amount, description, transaction_type, expense_type, payment_method, date, global_category_id, global_account_id, created_at, updated_at, metadata_json, 0
FROM transactions
"""))

# --- budgets ---
# Original cols: id, name, amount, spent, month, year, category_id, created_at, updated_at
TABLE_DEFINITIONS.append(('budgets', """
CREATE TABLE budgets_new (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    name VARCHAR NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    spent NUMERIC(12, 2),
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    category_id VARCHAR(36) REFERENCES categories(id) ON DELETE SET NULL,
    created_at DATETIME,
    updated_at DATETIME,
    is_deleted BOOLEAN NOT NULL DEFAULT 0
)
""", """
INSERT INTO budgets_new (id, name, amount, spent, month, year, category_id, created_at, updated_at, is_deleted)
SELECT global_id, name, amount, spent, month, year, global_category_id, created_at, updated_at, 0
FROM budgets
"""))

# --- goals ---
# Original cols: id, name, target_amount, current_amount, target_date, status, description, created_at, updated_at
TABLE_DEFINITIONS.append(('goals', """
CREATE TABLE goals_new (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    name VARCHAR NOT NULL,
    target_amount NUMERIC(12, 2) NOT NULL,
    current_amount NUMERIC(12, 2),
    target_date DATETIME,
    status VARCHAR(9),
    description VARCHAR,
    created_at DATETIME,
    updated_at DATETIME,
    is_deleted BOOLEAN NOT NULL DEFAULT 0
)
""", """
INSERT INTO goals_new (id, name, target_amount, current_amount, target_date, status, description, created_at, updated_at, is_deleted)
SELECT global_id, name, target_amount, current_amount, target_date, status, description, created_at, updated_at, 0
FROM goals
"""))

# --- reminders ---
# Original cols: id, name, amount, due_date, frequency, status, description, category_id, is_active, created_at, updated_at
TABLE_DEFINITIONS.append(('reminders', """
CREATE TABLE reminders_new (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    name VARCHAR NOT NULL,
    amount NUMERIC(12, 2),
    due_date DATETIME NOT NULL,
    frequency VARCHAR(7),
    status VARCHAR(9),
    description VARCHAR,
    category_id VARCHAR(36),
    is_active BOOLEAN,
    created_at DATETIME,
    updated_at DATETIME,
    is_deleted BOOLEAN NOT NULL DEFAULT 0
)
""", """
INSERT INTO reminders_new (id, name, amount, due_date, frequency, status, description, category_id, is_active, created_at, updated_at, is_deleted)
SELECT global_id, name, amount, due_date, frequency, status, description, global_category_id, is_active, created_at, updated_at, 0
FROM reminders
"""))

# --- subscriptions ---
# Original cols: id, name, amount, frequency, next_billing_date, account_id, category_id, is_active, created_at, updated_at
TABLE_DEFINITIONS.append(('subscriptions', """
CREATE TABLE subscriptions_new (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    name VARCHAR NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    frequency VARCHAR(9) NOT NULL,
    next_billing_date DATETIME,
    account_id VARCHAR(36) REFERENCES accounts(id) ON DELETE SET NULL,
    category_id VARCHAR(36) REFERENCES categories(id) ON DELETE SET NULL,
    is_active BOOLEAN,
    created_at DATETIME,
    updated_at DATETIME,
    is_deleted BOOLEAN NOT NULL DEFAULT 0
)
""", """
INSERT INTO subscriptions_new (id, name, amount, frequency, next_billing_date, account_id, category_id, is_active, created_at, updated_at, is_deleted)
SELECT global_id, name, amount, frequency, next_billing_date, global_account_id, global_category_id, is_active, created_at, updated_at, 0
FROM subscriptions
"""))

# --- transaction_splits ---
# Original cols: id, transaction_id, amount, category_id, description
# NO created_at, NO updated_at
TABLE_DEFINITIONS.append(('transaction_splits', """
CREATE TABLE transaction_splits_new (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    transaction_id VARCHAR(36) NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL,
    category_id VARCHAR(36) REFERENCES categories(id) ON DELETE SET NULL,
    description VARCHAR,
    is_deleted BOOLEAN NOT NULL DEFAULT 0
)
""", """
INSERT INTO transaction_splits_new (id, transaction_id, amount, category_id, description, is_deleted)
SELECT global_id, global_transaction_id, amount, global_category_id, description, 0
FROM transaction_splits
"""))

# --- ious ---
# Original cols: id, person_name, amount, iou_type, status, transaction_id, description, due_date, created_at, updated_at
TABLE_DEFINITIONS.append(('ious', """
CREATE TABLE ious_new (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    person_name VARCHAR NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    iou_type VARCHAR(8) NOT NULL,
    status VARCHAR(7) NOT NULL,
    transaction_id VARCHAR(36) REFERENCES transactions(id) ON DELETE SET NULL,
    description VARCHAR,
    due_date DATETIME,
    created_at DATETIME,
    updated_at DATETIME,
    is_deleted BOOLEAN NOT NULL DEFAULT 0
)
""", """
INSERT INTO ious_new (id, person_name, amount, iou_type, status, transaction_id, description, due_date, created_at, updated_at, is_deleted)
SELECT global_id, person_name, amount, iou_type, status, global_transaction_id, description, due_date, created_at, updated_at, 0
FROM ious
"""))

# --- credit_card_statements ---
# Original cols: id, account_id, statement_balance, user_share, payment_due_date, cut_off_date, amount_paid, status, month, year, notes, created_at, updated_at
TABLE_DEFINITIONS.append(('credit_card_statements', """
CREATE TABLE credit_card_statements_new (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    account_id VARCHAR(36) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    statement_balance NUMERIC(12, 2) NOT NULL,
    user_share NUMERIC(12, 2) NOT NULL,
    payment_due_date DATETIME,
    cut_off_date DATETIME,
    amount_paid NUMERIC(12, 2),
    status VARCHAR(7),
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    notes VARCHAR,
    created_at DATETIME,
    updated_at DATETIME,
    is_deleted BOOLEAN NOT NULL DEFAULT 0
)
""", """
INSERT INTO credit_card_statements_new (id, account_id, statement_balance, user_share, payment_due_date, cut_off_date, amount_paid, status, month, year, notes, created_at, updated_at, is_deleted)
SELECT global_id, global_account_id, statement_balance, user_share, payment_due_date, cut_off_date, amount_paid, status, month, year, notes, created_at, updated_at, 0
FROM credit_card_statements
"""))

# --- debt_shares ---
# Original cols: id, statement_id, person_name, amount, description, status, created_at, updated_at
TABLE_DEFINITIONS.append(('debt_shares', """
CREATE TABLE debt_shares_new (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    statement_id VARCHAR(36) NOT NULL REFERENCES credit_card_statements(id) ON DELETE CASCADE,
    person_name VARCHAR NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    description VARCHAR,
    status VARCHAR(12),
    created_at DATETIME,
    updated_at DATETIME,
    is_deleted BOOLEAN NOT NULL DEFAULT 0
)
""", """
INSERT INTO debt_shares_new (id, statement_id, person_name, amount, description, status, created_at, updated_at, is_deleted)
SELECT global_id, global_statement_id, person_name, amount, description, status, created_at, updated_at, 0
FROM debt_shares
"""))

# --- net_worth_snapshots ---
# Original cols: id, month, year, total_assets, total_liabilities, net_worth, snapshot_date, metadata_json
# NO created_at, NO updated_at
TABLE_DEFINITIONS.append(('net_worth_snapshots', """
CREATE TABLE net_worth_snapshots_new (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    total_assets NUMERIC(12, 2) NOT NULL,
    total_liabilities NUMERIC(12, 2) NOT NULL,
    net_worth NUMERIC(12, 2) NOT NULL,
    snapshot_date DATETIME NOT NULL,
    metadata_json VARCHAR,
    is_deleted BOOLEAN NOT NULL DEFAULT 0
)
""", """
INSERT INTO net_worth_snapshots_new (id, month, year, total_assets, total_liabilities, net_worth, snapshot_date, metadata_json, is_deleted)
SELECT global_id, month, year, total_assets, total_liabilities, net_worth, snapshot_date, metadata_json, 0
FROM net_worth_snapshots
"""))

# --- config ---
# Original cols: id, key, value, value_type, description, is_public
# NO created_at, NO updated_at
TABLE_DEFINITIONS.append(('config', """
CREATE TABLE config_new (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    key VARCHAR NOT NULL UNIQUE,
    value TEXT,
    value_type VARCHAR,
    description VARCHAR,
    is_public BOOLEAN,
    is_deleted BOOLEAN NOT NULL DEFAULT 0
)
""", """
INSERT INTO config_new (id, key, value, value_type, description, is_public, is_deleted)
SELECT global_id, key, value, value_type, description, is_public, 0
FROM config
"""))


def upgrade() -> None:
    bind = op.get_bind()

    # 1. Disable FK enforcement during restructuring
    bind.execute(sa.text("PRAGMA foreign_keys=OFF"))

    for table_name, create_sql, insert_sql in TABLE_DEFINITIONS:
        print(f"[Phase 3] Rotating: {table_name}")

        # Drop all indexes on the old table first
        indexes = bind.execute(
            sa.text(f"SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='{table_name}'")
        ).fetchall()
        for idx in indexes:
            if idx[0] and not idx[0].startswith('sqlite_autoindex'):
                bind.execute(sa.text(f"DROP INDEX IF EXISTS [{idx[0]}]"))

        # Drop leftover temp tables from failed attempts
        bind.execute(sa.text(f"DROP TABLE IF EXISTS {table_name}_new"))

        # Create the new table with UUID PKs
        bind.execute(sa.text(create_sql))

        # Copy data from old to new
        bind.execute(sa.text(insert_sql))

        # Verify row count integrity
        old_count = bind.execute(sa.text(f"SELECT COUNT(*) FROM {table_name}")).scalar()
        new_count = bind.execute(sa.text(f"SELECT COUNT(*) FROM {table_name}_new")).scalar()
        assert old_count == new_count, f"Row count mismatch for {table_name}: {old_count} vs {new_count}"

        # Drop old, rename new
        bind.execute(sa.text(f"DROP TABLE {table_name}"))
        bind.execute(sa.text(f"ALTER TABLE {table_name}_new RENAME TO {table_name}"))

        print(f"  -> {new_count} rows migrated successfully")

    # Recreate critical indexes
    index_stmts = [
        "CREATE INDEX ix_accounts_id ON accounts(id)",
        "CREATE INDEX ix_accounts_account_type ON accounts(account_type)",
        "CREATE INDEX ix_accounts_is_active ON accounts(is_active)",
        "CREATE INDEX ix_accounts_linked_account_id ON accounts(linked_account_id)",
        "CREATE INDEX ix_accounts_created_at ON accounts(created_at)",
        "CREATE INDEX ix_categories_id ON categories(id)",
        "CREATE INDEX ix_transactions_id ON transactions(id)",
        "CREATE INDEX ix_transactions_category_id ON transactions(category_id)",
        "CREATE INDEX ix_transactions_account_id ON transactions(account_id)",
        "CREATE INDEX ix_transactions_transaction_type ON transactions(transaction_type)",
        "CREATE INDEX ix_transactions_date ON transactions(date)",
        "CREATE INDEX ix_transactions_created_at ON transactions(created_at)",
        "CREATE INDEX ix_budgets_id ON budgets(id)",
        "CREATE INDEX ix_budgets_category_id ON budgets(category_id)",
        "CREATE INDEX ix_goals_id ON goals(id)",
        "CREATE INDEX ix_reminders_id ON reminders(id)",
        "CREATE INDEX ix_subscriptions_id ON subscriptions(id)",
        "CREATE INDEX ix_subscriptions_account_id ON subscriptions(account_id)",
        "CREATE INDEX ix_subscriptions_category_id ON subscriptions(category_id)",
        "CREATE INDEX ix_subscriptions_is_active ON subscriptions(is_active)",
        "CREATE INDEX ix_subscriptions_created_at ON subscriptions(created_at)",
        "CREATE INDEX ix_transaction_splits_id ON transaction_splits(id)",
        "CREATE INDEX ix_transaction_splits_transaction_id ON transaction_splits(transaction_id)",
        "CREATE INDEX ix_transaction_splits_category_id ON transaction_splits(category_id)",
        "CREATE INDEX ix_ious_id ON ious(id)",
        "CREATE INDEX ix_ious_transaction_id ON ious(transaction_id)",
        "CREATE INDEX ix_ious_status ON ious(status)",
        "CREATE INDEX ix_ious_iou_type ON ious(iou_type)",
        "CREATE INDEX ix_ious_created_at ON ious(created_at)",
        "CREATE INDEX ix_credit_card_statements_id ON credit_card_statements(id)",
        "CREATE INDEX ix_credit_card_statements_account_id ON credit_card_statements(account_id)",
        "CREATE INDEX ix_debt_shares_id ON debt_shares(id)",
        "CREATE INDEX ix_debt_shares_statement_id ON debt_shares(statement_id)",
        "CREATE INDEX ix_net_worth_snapshots_id ON net_worth_snapshots(id)",
        "CREATE INDEX ix_net_worth_snapshots_month ON net_worth_snapshots(month)",
        "CREATE INDEX ix_net_worth_snapshots_year ON net_worth_snapshots(year)",
        "CREATE INDEX ix_net_worth_snapshots_snapshot_date ON net_worth_snapshots(snapshot_date)",
        "CREATE INDEX ix_config_id ON config(id)",
        "CREATE INDEX ix_config_key ON config(key)",
    ]
    for stmt in index_stmts:
        bind.execute(sa.text(stmt))

    # 2. Re-enable FK enforcement
    bind.execute(sa.text("PRAGMA foreign_keys=ON"))

    # 3. Integrity check
    result = bind.execute(sa.text("PRAGMA integrity_check")).scalar()
    print(f"[Phase 3] Integrity check: {result}")
    assert result == "ok", f"INTEGRITY CHECK FAILED: {result}"

    print("[Phase 3] === ROTACION ESTRUCTURAL COMPLETADA ===")


def downgrade() -> None:
    # Genuinely irreversible: upgrade() drops the original integer-PK tables
    # outright (CREATE-COPY-DROP-RENAME) without preserving the old id anywhere,
    # so there is no data left to reconstruct sequential integer PKs/FKs from.
    # A `pass` here would be actively dangerous - alembic would mark this
    # revision as downgraded and rewind alembic_version while the schema stays
    # exactly as-is, desyncing version tracking from actual schema state. Fail
    # loudly instead so nobody mistakes silence for a successful rollback.
    raise NotImplementedError(
        "de10f91abd65 (rotate_uuid_phase_3) cannot be downgraded: the original "
        "integer primary keys were dropped during upgrade() with no mapping "
        "preserved. Restore from a pre-migration database backup instead."
    )
