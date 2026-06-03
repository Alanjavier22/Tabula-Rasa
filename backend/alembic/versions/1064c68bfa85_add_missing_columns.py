"""add_missing_columns

Revision ID: 1064c68bfa85
Revises: 208245a2ec96
Create Date: 2026-06-03 06:41:57.541236

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1064c68bfa85'
down_revision: Union[str, None] = '208245a2ec96'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add needs_clarification to transactions table (safe for SQLite using batch)
    with op.batch_alter_table('transactions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('needs_clarification', sa.Boolean(), nullable=False, server_default='0'))

    # 2. Add is_locked to net_worth_snapshots table (safe for SQLite using batch)
    with op.batch_alter_table('net_worth_snapshots', schema=None) as batch_op:
        batch_op.add_column(sa.Column('is_locked', sa.Boolean(), nullable=False, server_default='0'))
        batch_op.create_index(batch_op.f('ix_net_worth_snapshots_is_locked'), ['is_locked'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('net_worth_snapshots', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_net_worth_snapshots_is_locked'))
        batch_op.drop_column('is_locked')

    with op.batch_alter_table('transactions', schema=None) as batch_op:
        batch_op.drop_column('needs_clarification')
