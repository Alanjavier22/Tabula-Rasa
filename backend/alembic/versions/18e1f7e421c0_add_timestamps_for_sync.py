"""add_timestamps_for_sync

Revision ID: 18e1f7e421c0
Revises: 286b527d1174
Create Date: 2026-04-29 23:22:36.000000

"""
from typing import Sequence, Union
from datetime import datetime, timezone
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '18e1f7e421c0'
down_revision: Union[str, None] = '286b527d1174'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add created_at and updated_at to categories
    with op.batch_alter_table('categories', schema=None) as batch_op:
        batch_op.add_column(sa.Column('created_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('updated_at', sa.DateTime(), nullable=True))

    # Add created_at and updated_at to transaction_splits
    with op.batch_alter_table('transaction_splits', schema=None) as batch_op:
        batch_op.add_column(sa.Column('created_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('updated_at', sa.DateTime(), nullable=True))
        
    # Populate existing rows with a default timestamp
    op.execute("UPDATE categories SET created_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP")
    op.execute("UPDATE transaction_splits SET created_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP")


def downgrade() -> None:
    with op.batch_alter_table('transaction_splits', schema=None) as batch_op:
        batch_op.drop_column('updated_at')
        batch_op.drop_column('created_at')

    with op.batch_alter_table('categories', schema=None) as batch_op:
        batch_op.drop_column('updated_at')
        batch_op.drop_column('created_at')
