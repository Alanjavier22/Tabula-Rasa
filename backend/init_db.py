"""
Database initialization helper for the Local-First Finance app.

Two modes:
  1. Default (idempotent): create_all — only creates missing tables, leaves existing data.
  2. Big Bang RESET (DEV ONLY): drop_all + create_all when env var DB_RESET=1.

The Big Bang is required when migrating from legacy schemas (INTEGER ids, FLOAT amounts)
to the strict UUID + Integer (centavos) schema needed for LWW sync.

WARNING: DB_RESET=1 destroys all local data. Never run in production.
FAIL-FAST: Schema mismatches will cause errors instead of auto-healing.
"""
import os
import sys
from typing import Optional

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import Base, engine
# Importing models registers them on the Base metadata
import app.models  # noqa: F401


def _get_sqlite_type(sa_type) -> str:
    """Map SQLAlchemy type to SQLite type string."""
    type_str = str(sa_type)

    if any(marker in type_str for marker in ('VARCHAR', 'CHAR', 'TEXT')):
        if '(' in type_str:
            return type_str.upper().replace('VARCHAR', 'TEXT').replace('CHAR', 'TEXT')
        return 'TEXT'

    type_rules = (
        (('INTEGER', 'INT'), 'INTEGER'),
        (('BOOLEAN',), 'BOOLEAN'),
        (('FLOAT', 'REAL', 'DOUBLE', 'DECIMAL', 'NUMERIC'), 'REAL'),
        (('DATETIME', 'TIMESTAMP', 'DATE', 'JSON', 'UUID'), 'TEXT'),
    )
    for markers, sqlite_type in type_rules:
        if any(marker in type_str for marker in markers):
            return sqlite_type
    return 'TEXT'


def init_db(force_reset: Optional[bool] = None) -> None:
    """
    Initialize the database schema.

    Args:
        force_reset: If True, drop all tables and recreate. If None, read from env DB_RESET.
        
    FAIL-FAST: Schema mismatches will cause errors. Auto-healing is disabled to prevent
    silent data corruption. Manual migration required if schema changes.
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
    
    # FAIL-FAST: No auto-healing. Schema mismatches will cause visible errors.


if __name__ == "__main__":
    # Allow standalone execution: `python init_db.py` for explicit reset
    init_db()
