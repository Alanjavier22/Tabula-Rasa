"""add_is_stale_simple

Revision ID: 74ee2f5267c0
Revises: 5a9dfa0ae86f
Create Date: 2026-04-30 14:22:48.908197

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '74ee2f5267c0'
down_revision: Union[str, None] = '18e1f7e421c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add is_stale column to net_worth_snapshots
    with op.batch_alter_table('net_worth_snapshots', schema=None) as batch_op:
        batch_op.add_column(sa.Column('is_stale', sa.Boolean(), nullable=False, server_default='0'))
        batch_op.create_index(batch_op.f('ix_net_worth_snapshots_is_stale'), ['is_stale'], unique=False)


def downgrade() -> None:
    # Remove is_stale column from net_worth_snapshots
    with op.batch_alter_table('net_worth_snapshots', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_net_worth_snapshots_is_stale'))
        batch_op.drop_column('is_stale')
