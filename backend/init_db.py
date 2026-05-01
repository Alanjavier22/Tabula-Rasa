"""
Database initialization helper for the Local-First Finance app.

Two modes:
  1. Default (idempotent): create_all — only creates missing tables, leaves existing data.
  2. Big Bang RESET (DEV ONLY): drop_all + create_all when env var DB_RESET=1.

The Big Bang is required when migrating from legacy schemas (INTEGER ids, FLOAT amounts)
to the strict UUID + Integer (centavos) schema needed for LWW sync.

WARNING: DB_RESET=1 destroys all local data. Never run in production.
"""
import os
import sys
from typing import Optional

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import Base, engine
# Importing models registers them on the Base metadata
from app.models import *  # noqa: F401,F403
from app.models.device import PairedDevice  # noqa: F401


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


if __name__ == "__main__":
    # Allow standalone execution: `python init_db.py` for explicit reset
    init_db()
