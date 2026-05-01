"""migrate_pk_to_uuid_phase_1_2

Revision ID: e9aa56991e55
Revises: b2f4c8e91a03
Create Date: 2026-04-29 22:41:40.646032

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import table, column
import uuid

# revision identifiers, used by Alembic.
revision: str = 'e9aa56991e55'
down_revision: Union[str, None] = 'b2f4c8e91a03'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

tables_with_pk = [
    'accounts', 'categories', 'transactions', 'budgets', 'goals', 
    'reminders', 'subscriptions', 'transaction_splits', 'ious', 
    'debt_shares', 'credit_card_statements', 'net_worth_snapshots', 'config'
]

fks_to_update = [
    ('accounts', 'global_linked_account_id', 'accounts', 'linked_account_id'),
    ('budgets', 'global_category_id', 'categories', 'category_id'),
    ('credit_card_statements', 'global_account_id', 'accounts', 'account_id'),
    ('debt_shares', 'global_statement_id', 'credit_card_statements', 'statement_id'),
    ('ious', 'global_transaction_id', 'transactions', 'transaction_id'),
    ('subscriptions', 'global_account_id', 'accounts', 'account_id'),
    ('subscriptions', 'global_category_id', 'categories', 'category_id'),
    ('transactions', 'global_category_id', 'categories', 'category_id'),
    ('transactions', 'global_account_id', 'accounts', 'account_id'),
    ('transaction_splits', 'global_transaction_id', 'transactions', 'transaction_id'),
    ('transaction_splits', 'global_category_id', 'categories', 'category_id'),
    ('reminders', 'global_category_id', 'categories', 'category_id'),
]

def upgrade() -> None:
    bind = op.get_bind()
    
    # FASE 1: EXPANSIÓN
    for t in tables_with_pk:
        op.add_column(t, sa.Column('global_id', sa.String(36), nullable=True))
    
    for child_table, global_fk_col, _, _ in fks_to_update:
        try:
            op.add_column(child_table, sa.Column(global_fk_col, sa.String(36), nullable=True))
        except Exception:
            pass
            
    # FASE 2: TRANSICIÓN
    mappings = {t: {} for t in tables_with_pk}

    print("--- INICIANDO MIGRACIÓN DE DATOS (UUIDs) ---")
    for t in tables_with_pk:
        t_table = table(t, column('id', sa.Integer), column('global_id', sa.String(36)))
        results = bind.execute(sa.select(t_table.c.id)).fetchall()
        
        for row in results:
            new_uuid = str(uuid.uuid4())
            mappings[t][row.id] = new_uuid
            bind.execute(
                t_table.update().where(t_table.c.id == row.id).values(global_id=new_uuid)
            )
        print(f"[{t}] Generados: {len(results)} UUIDs")

    for child_table, global_fk_col, parent_table, old_fk_col in fks_to_update:
        t_child = table(
            child_table, 
            column('id', sa.Integer), 
            column(old_fk_col, sa.Integer), 
            column(global_fk_col, sa.String(36))
        )
        results = bind.execute(sa.select(t_child.c.id, getattr(t_child.c, old_fk_col))).fetchall()
        updated_count = 0
        for row in results:
            old_fk_val = getattr(row, old_fk_col)
            if old_fk_val is not None and old_fk_val in mappings[parent_table]:
                new_uuid_fk = mappings[parent_table][old_fk_val]
                bind.execute(
                    t_child.update().where(t_child.c.id == row.id).values(**{global_fk_col: new_uuid_fk})
                )
                updated_count += 1
        print(f"[{child_table}] Actualizadas {updated_count} referencias FK ({old_fk_col} -> {global_fk_col})")
    print("--- MIGRACIÓN DE DATOS COMPLETADA ---")

def downgrade() -> None:
    pass
