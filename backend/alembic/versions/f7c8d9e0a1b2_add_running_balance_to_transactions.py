"""add_running_balance_to_transactions

Revision ID: f7c8d9e0a1b2
Revises: 32182c32333c, a1b2c3d4e5f6
Create Date: 2026-05-05 14:58:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f7c8d9e0a1b2'
down_revision: Union[str, Sequence[str], None] = ('32182c32333c', 'a1b2c3d4e5f6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add running_balance column to transactions (nullable, used for deduplication)
    with op.batch_alter_table('transactions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('running_balance', sa.Integer(), nullable=True))


def downgrade() -> None:
    # Remove running_balance column from transactions
    with op.batch_alter_table('transactions', schema=None) as batch_op:
        batch_op.drop_column('running_balance')
