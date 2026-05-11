"""add_version_to_goals

Revision ID: 1097e9b78d74
Revises: 64401e702108
Create Date: 2026-05-06 13:54:46.192906

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1097e9b78d74'
down_revision: Union[str, None] = '64401e702108'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add version column to goals table
    with op.batch_alter_table('goals', schema=None) as batch_op:
        batch_op.add_column(sa.Column('version', sa.Integer(), nullable=False, server_default='1'))


def downgrade() -> None:
    # Remove version column from goals table
    with op.batch_alter_table('goals', schema=None) as batch_op:
        batch_op.drop_column('version')
