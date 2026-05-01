"""
Database initialization helper for the Local-First Finance app.

Two modes:
  1. Default (idempotent): create_all — only creates missing tables, leaves existing data.
  2. Big Bang RESET (DEV ONLY): drop_all + create_all when env var DB_RESET=1.

The Big Bang is required when migrating from legacy schemas (INTEGER ids, FLOAT amounts)
to the strict UUID + Integer (centavos) schema needed for LWW sync.

Phoenix DB Healer: Auto-heals schema by adding missing columns to existing tables
without requiring DB_RESET. This prevents data loss when adding new fields.

WARNING: DB_RESET=1 destroys all local data. Never run in production.
"""
import os
import sys
from typing import Optional
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.ext.declarative import DeclarativeMeta

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import Base, engine
# Importing models registers them on the Base metadata
from app.models import *  # noqa: F401,F403
from app.models.device import PairedDevice  # noqa: F401


def _get_sqlite_type(sa_type) -> str:
    """Map SQLAlchemy type to SQLite type string."""
    type_str = str(sa_type)
    
    # Common mappings
    if 'INTEGER' in type_str or 'INT' in type_str:
        return 'INTEGER'
    elif 'VARCHAR' in type_str or 'CHAR' in type_str or 'TEXT' in type_str:
        # Extract length if present, otherwise default
        if '(' in type_str:
            return type_str.upper().replace('VARCHAR', 'TEXT').replace('CHAR', 'TEXT')
        return 'TEXT'
    elif 'BOOLEAN' in type_str:
        return 'BOOLEAN'
    elif 'FLOAT' in type_str or 'REAL' in type_str or 'DOUBLE' in type_str:
        return 'REAL'
    elif 'DECIMAL' in type_str or 'NUMERIC' in type_str:
        return 'REAL'  # SQLite doesn't have DECIMAL, use REAL
    elif 'DATETIME' in type_str or 'TIMESTAMP' in type_str:
        return 'TEXT'  # SQLite stores dates as TEXT
    elif 'DATE' in type_str:
        return 'TEXT'
    elif 'JSON' in type_str:
        return 'TEXT'
    elif 'UUID' in type_str:
        return 'TEXT'
    else:
        return 'TEXT'  # Safe default


def auto_heal_schema(engine: Engine, Base: DeclarativeMeta) -> None:
    """
    Phoenix DB Healer: Auto-heals schema by adding missing columns to existing tables.
    
    This function compares the expected schema (from SQLAlchemy models) with the
    actual database schema and executes ALTER TABLE statements for missing columns.
    """
    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()
    
    print("[Phoenix DB Healer] Starting schema auto-heal...")
    
    for table_name, table in Base.metadata.tables.items():
        if table_name not in existing_tables:
            # Table doesn't exist, will be created by create_all
            continue
        
        existing_columns = {col['name'] for col in inspector.get_columns(table_name)}
        expected_columns = set(table.columns.keys())
        
        missing_columns = expected_columns - existing_columns
        
        if missing_columns:
            print(f"[Phoenix DB Healer] Table '{table_name}' has {len(missing_columns)} missing columns: {missing_columns}")
            
            with engine.connect() as conn:
                for col_name in missing_columns:
                    column = table.columns[col_name]
                    sqlite_type = _get_sqlite_type(column.type)
                    
                    # Build default value if column is required (not nullable)
                    default_clause = ''
                    if not column.nullable and column.default is None:
                        # For required columns without default, use a safe default
                        if 'INTEGER' in sqlite_type or 'BOOLEAN' in sqlite_type:
                            default_clause = ' DEFAULT 0'
                        else:
                            default_clause = " DEFAULT ''"
                    elif column.default is not None:
                        # Use the default from the model if available
                        default_val = column.default.arg if hasattr(column.default, 'arg') else column.default
                        if isinstance(default_val, str):
                            default_clause = f" DEFAULT '{default_val}'"
                        elif isinstance(default_val, bool):
                            default_clause = f" DEFAULT {1 if default_val else 0}"
                        elif default_val is not None:
                            default_clause = f" DEFAULT {default_val}"
                    
                    alter_sql = f"ALTER TABLE {table_name} ADD COLUMN {col_name} {sqlite_type}{default_clause}"
                    
                    try:
                        conn.execute(text(alter_sql))
                        conn.commit()
                        print(f"[Phoenix DB Healer] Added column '{col_name}' ({sqlite_type}) to table '{table_name}'")
                    except Exception as e:
                        print(f"[Phoenix DB Healer] ERROR adding column '{col_name}' to '{table_name}': {e}")
                        # Continue with other columns even if one fails
    
    print("[Phoenix DB Healer] Schema auto-heal complete.")


def init_db(force_reset: Optional[bool] = None) -> None:
    """
    Initialize the database schema.

    Args:
        force_reset: If True, drop all tables and recreate. If None, read from env DB_RESET.
    """
    if force_reset is None:
        force_reset = os.getenv("DB_RESET", "0") == "1"

    if force_reset:
        print("[DB] DB_RESET=1 detected — DROPPING all tables (Big Bang).")
        Base.metadata.drop_all(bind=engine)
        print("[DB] All tables dropped.")

    print("[DB] Creating tables (idempotent)...")
    Base.metadata.create_all(bind=engine)
    print(f"[DB] Schema ready. Tables: {sorted(Base.metadata.tables.keys())}")
    
    # Phoenix DB Healer: Auto-heal schema by adding missing columns
    try:
        auto_heal_schema(engine, Base)
    except Exception as e:
        print(f"[Phoenix DB Healer] Auto-heal failed (non-critical): {e}")


if __name__ == "__main__":
    # Allow standalone execution: `python init_db.py` for explicit reset
    init_db()
