"""add_assets_table

Revision ID: 32182c32333c
Revises: 74ee2f5267c0
Create Date: 2026-04-30 14:28:06.458568

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '32182c32333c'
down_revision: Union[str, None] = '74ee2f5267c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'assets',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('purchase_price_cents', sa.Integer(), nullable=False),
        sa.Column('purchase_date', sa.DateTime(), nullable=False),
        sa.Column('estimated_life_months', sa.Integer(), nullable=False),
        sa.Column('residual_value_cents', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Index('ix_assets_purchase_date', 'purchase_date'),
    )


def downgrade() -> None:
    op.drop_table('assets')
