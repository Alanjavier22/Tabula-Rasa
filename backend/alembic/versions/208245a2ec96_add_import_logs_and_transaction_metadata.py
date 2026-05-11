"""add_import_logs_and_transaction_metadata

Revision ID: 208245a2ec96
Revises: 931397a55371
Create Date: 2026-05-08 10:52:09.208439

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '208245a2ec96'
down_revision: Union[str, None] = '931397a55371'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # 1. Crear tabla import_logs
    op.create_table('import_logs',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('file_hash', sa.String(length=64), nullable=False),
        sa.Column('filename', sa.String(), nullable=False),
        sa.Column('account_id', sa.String(length=36), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('metadata_json', sa.String(), nullable=True),
        sa.Column('error_message', sa.String(), nullable=True),
        sa.Column('is_deleted', sa.Boolean(), server_default='0', nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('import_logs', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_import_logs_created_at'), ['created_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_import_logs_file_hash'), ['file_hash'], unique=True)
        batch_op.create_index(batch_op.f('ix_import_logs_id'), ['id'], unique=False)

    # 2. Actualizar transactions con columnas nuevas (batch mode para SQLite)
    with op.batch_alter_table('transactions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('is_manual', sa.Boolean(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('fingerprint', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('import_log_id', sa.String(length=36), nullable=True))
        batch_op.create_index(batch_op.f('ix_transactions_fingerprint'), ['fingerprint'], unique=True)
        batch_op.create_foreign_key('fk_transactions_import_log', 'import_logs', ['import_log_id'], ['id'], ondelete='SET NULL')

    # 3. Asegurar índice en net_worth_snapshots
    with op.batch_alter_table('net_worth_snapshots', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_net_worth_snapshots_is_stale'), ['is_stale'], unique=False)

def downgrade() -> None:
    with op.batch_alter_table('net_worth_snapshots', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_net_worth_snapshots_is_stale'))

    with op.batch_alter_table('transactions', schema=None) as batch_op:
        batch_op.drop_constraint('fk_transactions_import_log', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_transactions_fingerprint'))
        batch_op.drop_column('import_log_id')
        batch_op.drop_column('fingerprint')
        batch_op.drop_column('is_manual')

    with op.batch_alter_table('import_logs', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_import_logs_id'))
        batch_op.drop_index(batch_op.f('ix_import_logs_file_hash'))
        batch_op.drop_index(batch_op.f('ix_import_logs_created_at'))

    op.drop_table('import_logs')
