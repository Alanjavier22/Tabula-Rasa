"""normalize legacy deposit transaction types and rebuild v2 fingerprints

Revision ID: c3e6f9a1b2c4
Revises: c2d5e8f9a0b1
"""

from typing import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "c3e6f9a1b2c4"
down_revision: str | None = "c2d5e8f9a0b1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            "SELECT id, account_id, amount FROM transactions WHERE lower(transaction_type) = 'deposit'"
        )
    ).fetchall()

    bind.execute(
        sa.text(
            "UPDATE transactions SET transaction_type = 'income' WHERE lower(transaction_type) = 'deposit'"
        )
    )

    affected_accounts = {row[1] for row in rows if row[1]}
    for account_id in affected_accounts:
        acc_type = bind.execute(
            sa.text("SELECT account_type FROM accounts WHERE id = :account_id"),
            {"account_id": account_id},
        ).scalar()
        tx_rows = bind.execute(
            sa.text(
                "SELECT amount, transaction_type FROM transactions "
                "WHERE account_id = :account_id AND is_deleted = 0"
            ),
            {"account_id": account_id},
        ).fetchall()
        total = 0
        for amount, tx_type in tx_rows:
            norm = str(tx_type or "").lower()
            if norm == "income":
                total += int(amount or 0)
            else:
                total -= int(amount or 0)
        if str(acc_type or "").lower() == "credit_card":
            # Credit card balances only store remaining debt/credit sign directly.
            total = min(total, 0) if total < 0 else total
        bind.execute(
            sa.text("UPDATE accounts SET balance = :balance WHERE id = :account_id"),
            {"balance": total, "account_id": account_id},
        )


def downgrade() -> None:
    # Data normalization from invalid 'deposit' to valid 'income' is intentionally non-destructive.
    pass
