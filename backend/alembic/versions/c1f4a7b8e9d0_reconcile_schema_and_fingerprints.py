"""reconcile runtime schema and backfill transaction fingerprints

Revision ID: c1f4a7b8e9d0
Revises: 0af83e7f1b6a
"""

from __future__ import annotations

import hashlib
import re
from typing import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text


revision: str = "c1f4a7b8e9d0"
down_revision: str | None = "0af83e7f1b6a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _fingerprint(description, amount, date_value, transaction_type, account_id, running_balance, occurrence):
    normalized_description = re.sub(r"\s+", " ", (description or "").strip().upper())
    payload = "|".join(
        (
            "v2",
            account_id or "",
            str(date_value or ""),
            str(int(amount or 0)),
            str(transaction_type or "").lower(),
            normalized_description,
            "" if running_balance is None else str(int(running_balance)),
            str(occurrence),
        )
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _backfill_fingerprints(connection) -> None:
    rows = connection.execute(text("""
        SELECT id, description, amount, date, transaction_type,
               account_id, running_balance
        FROM transactions
        WHERE fingerprint IS NULL
        ORDER BY created_at, id
    """)).mappings().all()

    used = {
        row[0]
        for row in connection.execute(
            text("SELECT fingerprint FROM transactions WHERE fingerprint IS NOT NULL")
        ).all()
    }
    occurrences = {}

    for row in rows:
        base_key = (
            row["description"], row["amount"], row["date"],
            row["transaction_type"], row["account_id"], row["running_balance"],
        )
        occurrence = occurrences.get(base_key, 0)
        candidate = _fingerprint(*base_key, occurrence)
        while candidate in used:
            occurrence += 1
            candidate = _fingerprint(*base_key, occurrence)
        occurrences[base_key] = occurrence + 1
        used.add(candidate)
        connection.execute(
            text("UPDATE transactions SET fingerprint = :fingerprint WHERE id = :id"),
            {"fingerprint": candidate, "id": row["id"]},
        )


def _create_index_if_missing(connection, table: str, name: str, columns: list[str], unique: bool = False) -> None:
    existing = {item["name"] for item in inspect(connection).get_indexes(table)}
    if name not in existing:
        op.create_index(name, table, columns, unique=unique)


def upgrade() -> None:
    connection = op.get_bind()
    _backfill_fingerprints(connection)

    # Fill values before tightening the runtime invariants.
    connection.execute(text("UPDATE accounts SET balance = 0 WHERE balance IS NULL"))
    connection.execute(text("UPDATE net_worth_snapshots SET snapshot_date = COALESCE(created_at, CURRENT_TIMESTAMP) WHERE snapshot_date IS NULL"))
    connection.execute(text("UPDATE transactions SET description = '' WHERE description IS NULL"))
    connection.execute(text("UPDATE transactions SET payment_method = 'other' WHERE payment_method IS NULL"))
    connection.execute(text("UPDATE transactions SET is_manual = 0 WHERE is_manual IS NULL"))

    # These tables are already present in deployed databases; batch mode keeps
    # SQLite data intact while aligning type/nullability with the models.
    with op.batch_alter_table("accounts", recreate="always") as batch:
        batch.alter_column("is_active", existing_type=sa.Boolean(), type_=sa.Integer())

    with op.batch_alter_table("categories", recreate="always") as batch:
        batch.alter_column("is_default", existing_type=sa.Integer(), type_=sa.Boolean())

    with op.batch_alter_table("net_worth_snapshots", recreate="always") as batch:
        batch.alter_column("snapshot_date", existing_type=sa.DateTime(), nullable=False)

    with op.batch_alter_table("transaction_splits", recreate="always") as batch:
        batch.alter_column("amount", existing_type=sa.Numeric(12, 2), type_=sa.Integer())

    with op.batch_alter_table("transactions", recreate="always") as batch:
        batch.alter_column("description", existing_type=sa.String(), nullable=False)
        batch.alter_column("payment_method", existing_type=sa.String(), nullable=False)
        batch.alter_column("is_manual", existing_type=sa.Boolean(), nullable=False)

    connection = op.get_bind()
    config_indexes = {item["name"]: item for item in inspect(connection).get_indexes("config")}
    config_key_index = config_indexes.get("ix_config_key")
    if config_key_index and not config_key_index.get("unique"):
        op.drop_index("ix_config_key", table_name="config")
        op.create_index("ix_config_key", "config", ["key"], unique=True)
    elif not config_key_index:
        op.create_index("ix_config_key", "config", ["key"], unique=True)

    _create_index_if_missing(connection, "accounts", "ix_accounts_account_type", ["account_type"])
    _create_index_if_missing(connection, "accounts", "ix_accounts_created_at", ["created_at"])
    _create_index_if_missing(connection, "accounts", "ix_accounts_is_active", ["is_active"])
    _create_index_if_missing(connection, "accounts", "ix_accounts_linked_account_id", ["linked_account_id"])
    _create_index_if_missing(connection, "transactions", "ix_transactions_created_at", ["created_at"])
    _create_index_if_missing(connection, "transactions", "ix_transactions_fingerprint", ["fingerprint"], unique=True)


def downgrade() -> None:
    connection = op.get_bind()
    indexes = {item["name"] for item in inspect(connection).get_indexes("transactions")}
    if "ix_transactions_fingerprint" in indexes:
        op.drop_index("ix_transactions_fingerprint", table_name="transactions")
    if "ix_transactions_created_at" in indexes:
        op.drop_index("ix_transactions_created_at", table_name="transactions")

    with op.batch_alter_table("transactions", recreate="always") as batch:
        batch.alter_column("is_manual", existing_type=sa.Boolean(), nullable=True)
        batch.alter_column("payment_method", existing_type=sa.String(), nullable=True)
        batch.alter_column("description", existing_type=sa.String(), nullable=True)

    with op.batch_alter_table("transaction_splits", recreate="always") as batch:
        batch.alter_column("amount", existing_type=sa.Integer(), type_=sa.Numeric(12, 2))

    with op.batch_alter_table("net_worth_snapshots", recreate="always") as batch:
        batch.alter_column("snapshot_date", existing_type=sa.DateTime(), nullable=True)

    with op.batch_alter_table("categories", recreate="always") as batch:
        batch.alter_column("is_default", existing_type=sa.Boolean(), type_=sa.Integer())

    with op.batch_alter_table("accounts", recreate="always") as batch:
        batch.alter_column("is_active", existing_type=sa.Integer(), type_=sa.Boolean())
