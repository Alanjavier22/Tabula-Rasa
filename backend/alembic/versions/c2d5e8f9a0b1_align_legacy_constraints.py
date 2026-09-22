"""align missing constraints and remove obsolete runtime indexes

Revision ID: c2d5e8f9a0b1
Revises: c1f4a7b8e9d0
"""

from typing import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "c2d5e8f9a0b1"
down_revision: str | None = "c1f4a7b8e9d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _index_names(table_name: str) -> set[str]:
    return {item["name"] for item in inspect(op.get_bind()).get_indexes(table_name)}


def upgrade() -> None:
    # These two relationships were absent from the old runtime schema. Add
    # them without rebuilding the existing relationships that only differ in
    # their historical ON DELETE policy.
    with op.batch_alter_table("accounts") as batch:
        batch.create_foreign_key(
            "fk_accounts_linked_account",
            "accounts",
            ["linked_account_id"],
            ["id"],
            ondelete="SET NULL",
        )

    with op.batch_alter_table("transactions") as batch:
        batch.create_foreign_key(
            "fk_transactions_import_log",
            "import_logs",
            ["import_log_id"],
            ["id"],
            ondelete="SET NULL",
        )

    for index_name in ("ix_transactions_import_log_id", "ix_transactions_is_deleted"):
        if index_name in _index_names("transactions"):
            op.drop_index(index_name, table_name="transactions")


def downgrade() -> None:
    with op.batch_alter_table("transactions") as batch:
        batch.drop_constraint("fk_transactions_import_log", type_="foreignkey")

    with op.batch_alter_table("accounts") as batch:
        batch.drop_constraint("fk_accounts_linked_account", type_="foreignkey")
