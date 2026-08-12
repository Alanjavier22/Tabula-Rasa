"""drop_authorized_devices_table

Revision ID: 0af83e7f1b6a
Revises: 1064c68bfa85
Create Date: 2026-08-12 00:00:00.000000

Removes the `authorized_devices` table and its ORM model. It was a second,
unused device-auth mechanism (api_key_hash) that shipped alongside the actual
pairing flow (PairedDevice + JWT in app/api/auth.py) but was never wired into
any endpoint - dead attack surface with a schema drift bug (protocol_version
was added to the model but never to this table's own creation migration).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0af83e7f1b6a'
down_revision: Union[str, None] = '1064c68bfa85'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table('authorized_devices')


def downgrade() -> None:
    op.create_table('authorized_devices',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('device_name', sa.String(length=100), nullable=False),
    sa.Column('api_key_hash', sa.String(length=64), nullable=False),
    sa.Column('protocol_version', sa.Integer(), server_default='1', nullable=False),
    sa.Column('is_active', sa.Boolean(), server_default='1', nullable=False),
    sa.Column('is_deleted', sa.Boolean(), server_default='0', nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.Column('updated_at', sa.DateTime(), nullable=True),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('api_key_hash')
    )
    with op.batch_alter_table('authorized_devices', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_authorized_devices_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_authorized_devices_api_key_hash'), ['api_key_hash'], unique=False)
