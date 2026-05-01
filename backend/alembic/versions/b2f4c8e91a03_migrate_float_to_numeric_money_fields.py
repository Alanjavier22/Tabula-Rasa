"""migrate_float_to_numeric_money_fields

Revision ID: b2f4c8e91a03
Revises: a139c5630622
Create Date: 2026-04-30 02:18:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2f4c8e91a03'
down_revision: Union[str, None] = 'a139c5630622'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Migrate all monetary Float columns to Numeric(12, 2) across 10 tables.
    
    SQLite does not support ALTER COLUMN, so we use Alembic's batch_alter_table
    which creates a temp table, copies data, drops the old table, and renames.
    
    The data conversion is safe because:
    - Existing float values like 1500.5 become Decimal("1500.50") 
    - SQLAlchemy Numeric on SQLite stores as TEXT with exact precision
    - All existing data is preserved during the copy operation
    """

    # 1. transactions: amount
    with op.batch_alter_table('transactions', schema=None) as batch_op:
        batch_op.alter_column('amount',
                              existing_type=sa.Float(),
                              type_=sa.Numeric(precision=12, scale=2),
                              existing_nullable=False)

    # 2. accounts: balance
    with op.batch_alter_table('accounts', schema=None) as batch_op:
        batch_op.alter_column('balance',
                              existing_type=sa.Float(),
                              type_=sa.Numeric(precision=12, scale=2),
                              existing_nullable=True)

    # 3. budgets: amount, spent
    with op.batch_alter_table('budgets', schema=None) as batch_op:
        batch_op.alter_column('amount',
                              existing_type=sa.Float(),
                              type_=sa.Numeric(precision=12, scale=2),
                              existing_nullable=False)
        batch_op.alter_column('spent',
                              existing_type=sa.Float(),
                              type_=sa.Numeric(precision=12, scale=2),
                              existing_nullable=True)

    # 4. transaction_splits: amount
    with op.batch_alter_table('transaction_splits', schema=None) as batch_op:
        batch_op.alter_column('amount',
                              existing_type=sa.Float(),
                              type_=sa.Numeric(precision=12, scale=2),
                              existing_nullable=False)

    # 5. credit_card_statements: statement_balance, user_share, amount_paid
    with op.batch_alter_table('credit_card_statements', schema=None) as batch_op:
        batch_op.alter_column('statement_balance',
                              existing_type=sa.Float(),
                              type_=sa.Numeric(precision=12, scale=2),
                              existing_nullable=False)
        batch_op.alter_column('user_share',
                              existing_type=sa.Float(),
                              type_=sa.Numeric(precision=12, scale=2),
                              existing_nullable=False)
        batch_op.alter_column('amount_paid',
                              existing_type=sa.Float(),
                              type_=sa.Numeric(precision=12, scale=2),
                              existing_nullable=True)

    # 6. debt_shares: amount
    with op.batch_alter_table('debt_shares', schema=None) as batch_op:
        batch_op.alter_column('amount',
                              existing_type=sa.Float(),
                              type_=sa.Numeric(precision=12, scale=2),
                              existing_nullable=False)

    # 7. goals: target_amount, current_amount
    with op.batch_alter_table('goals', schema=None) as batch_op:
        batch_op.alter_column('target_amount',
                              existing_type=sa.Float(),
                              type_=sa.Numeric(precision=12, scale=2),
                              existing_nullable=False)
        batch_op.alter_column('current_amount',
                              existing_type=sa.Float(),
                              type_=sa.Numeric(precision=12, scale=2),
                              existing_nullable=True)

    # 8. ious: amount
    with op.batch_alter_table('ious', schema=None) as batch_op:
        batch_op.alter_column('amount',
                              existing_type=sa.Float(),
                              type_=sa.Numeric(precision=12, scale=2),
                              existing_nullable=False)

    # 9. net_worth_snapshots: total_assets, total_liabilities, net_worth
    with op.batch_alter_table('net_worth_snapshots', schema=None) as batch_op:
        batch_op.alter_column('total_assets',
                              existing_type=sa.Float(),
                              type_=sa.Numeric(precision=12, scale=2),
                              existing_nullable=False)
        batch_op.alter_column('total_liabilities',
                              existing_type=sa.Float(),
                              type_=sa.Numeric(precision=12, scale=2),
                              existing_nullable=False)
        batch_op.alter_column('net_worth',
                              existing_type=sa.Float(),
                              type_=sa.Numeric(precision=12, scale=2),
                              existing_nullable=False)

    # 10. subscriptions: amount
    with op.batch_alter_table('subscriptions', schema=None) as batch_op:
        batch_op.alter_column('amount',
                              existing_type=sa.Float(),
                              type_=sa.Numeric(precision=12, scale=2),
                              existing_nullable=False)

    # 11. reminders: amount
    with op.batch_alter_table('reminders', schema=None) as batch_op:
        batch_op.alter_column('amount',
                              existing_type=sa.Float(),
                              type_=sa.Numeric(precision=12, scale=2),
                              existing_nullable=True)


def downgrade() -> None:
    """Revert Numeric(12, 2) columns back to Float."""

    with op.batch_alter_table('reminders', schema=None) as batch_op:
        batch_op.alter_column('amount',
                              existing_type=sa.Numeric(precision=12, scale=2),
                              type_=sa.Float(),
                              existing_nullable=True)

    with op.batch_alter_table('subscriptions', schema=None) as batch_op:
        batch_op.alter_column('amount',
                              existing_type=sa.Numeric(precision=12, scale=2),
                              type_=sa.Float(),
                              existing_nullable=False)

    with op.batch_alter_table('net_worth_snapshots', schema=None) as batch_op:
        batch_op.alter_column('total_assets',
                              existing_type=sa.Numeric(precision=12, scale=2),
                              type_=sa.Float(),
                              existing_nullable=False)
        batch_op.alter_column('total_liabilities',
                              existing_type=sa.Numeric(precision=12, scale=2),
                              type_=sa.Float(),
                              existing_nullable=False)
        batch_op.alter_column('net_worth',
                              existing_type=sa.Numeric(precision=12, scale=2),
                              type_=sa.Float(),
                              existing_nullable=False)

    with op.batch_alter_table('ious', schema=None) as batch_op:
        batch_op.alter_column('amount',
                              existing_type=sa.Numeric(precision=12, scale=2),
                              type_=sa.Float(),
                              existing_nullable=False)

    with op.batch_alter_table('goals', schema=None) as batch_op:
        batch_op.alter_column('target_amount',
                              existing_type=sa.Numeric(precision=12, scale=2),
                              type_=sa.Float(),
                              existing_nullable=False)
        batch_op.alter_column('current_amount',
                              existing_type=sa.Numeric(precision=12, scale=2),
                              type_=sa.Float(),
                              existing_nullable=True)

    with op.batch_alter_table('debt_shares', schema=None) as batch_op:
        batch_op.alter_column('amount',
                              existing_type=sa.Numeric(precision=12, scale=2),
                              type_=sa.Float(),
                              existing_nullable=False)

    with op.batch_alter_table('credit_card_statements', schema=None) as batch_op:
        batch_op.alter_column('statement_balance',
                              existing_type=sa.Numeric(precision=12, scale=2),
                              type_=sa.Float(),
                              existing_nullable=False)
        batch_op.alter_column('user_share',
                              existing_type=sa.Numeric(precision=12, scale=2),
                              type_=sa.Float(),
                              existing_nullable=False)
        batch_op.alter_column('amount_paid',
                              existing_type=sa.Numeric(precision=12, scale=2),
                              type_=sa.Float(),
                              existing_nullable=True)

    with op.batch_alter_table('transaction_splits', schema=None) as batch_op:
        batch_op.alter_column('amount',
                              existing_type=sa.Numeric(precision=12, scale=2),
                              type_=sa.Float(),
                              existing_nullable=False)

    with op.batch_alter_table('budgets', schema=None) as batch_op:
        batch_op.alter_column('amount',
                              existing_type=sa.Numeric(precision=12, scale=2),
                              type_=sa.Float(),
                              existing_nullable=False)
        batch_op.alter_column('spent',
                              existing_type=sa.Numeric(precision=12, scale=2),
                              type_=sa.Float(),
                              existing_nullable=True)

    with op.batch_alter_table('accounts', schema=None) as batch_op:
        batch_op.alter_column('balance',
                              existing_type=sa.Numeric(precision=12, scale=2),
                              type_=sa.Float(),
                              existing_nullable=True)

    with op.batch_alter_table('transactions', schema=None) as batch_op:
        batch_op.alter_column('amount',
                              existing_type=sa.Numeric(precision=12, scale=2),
                              type_=sa.Float(),
                              existing_nullable=False)
