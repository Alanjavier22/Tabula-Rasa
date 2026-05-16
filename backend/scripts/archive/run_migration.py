"""
Phase 12: Automated Migration with Autocalibration

Extracts data from legacy_finance.db, migrates to new system with UUIDv5,
validates checksum integrity, and auto-rolls back on failure.
"""

import os
import sys
import sqlite3
from datetime import datetime
from typing import Any, Dict
from pathlib import Path

# Set AI_ENABLED=false for cold load migration
os.environ["AI_ENABLED"] = "false"


def extract_legacy_data(legacy_db_path: str) -> dict[str, Any]:
    """
    Extract data from legacy_finance.db in READ-ONLY mode.
    
    Returns:
        Dictionary with tables data and checksum baseline
    """
    print("📂 Connecting to legacy database (READ-ONLY)...")
    
    # Connect in READ-ONLY mode
    conn = sqlite3.connect(f"file:{legacy_db_path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Get all tables
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [row[0] for row in cursor.fetchall()]
    print(f"📋 Found tables: {tables}")
    
    legacy_data = {}
    record_counts = {}
    
    # Extract data from each table
    for table in tables:
        cursor.execute(f"SELECT * FROM {table}")
        columns = [desc[0] for desc in cursor.description]
        rows = cursor.fetchall()
        
        # Convert to dict list
        records = []
        for row in rows:
            record = dict(row)
            # Convert datetime strings to datetime objects if needed
            for key, value in record.items():
                if isinstance(value, str) and key in ['created_at', 'updated_at', 'date', 'due_date']:
                    try:
                        record[key] = datetime.fromisoformat(value.replace('Z', '+00:00'))
                    except:
                        pass
            records.append(record)
        
        legacy_data[table] = records
        record_counts[table] = len(records)
        print(f"  ✅ {table}: {len(records)} records")
    
    # Calculate initial checksum (income - expenses = expected account balance)
    expected_total_cents = 0
    if 'transactions' in legacy_data:
        for tx in legacy_data['transactions']:
            amount = tx.get('amount', 0)
            tx_type = tx.get('transaction_type', 'expense')
            if isinstance(amount, (int, float)):
                amount_cents = int(round(float(amount) * 100))
                if tx_type.lower() == 'income':
                    expected_total_cents += amount_cents
                else:
                    expected_total_cents -= amount_cents
    
    print(f"\n💰 Legacy Checksum (expected account balance): {expected_total_cents} cents (${expected_total_cents / 100:.2f})")
    
    conn.close()
    
    return {
        "legacy_data": legacy_data,
        "record_counts": record_counts,
        "expected_total_cents": expected_total_cents
    }


def run_automated_migration(legacy_db_path: str):
    """
    Execute full automated migration with autocalibration.
    """
    # Import app modules AFTER legacy extraction (avoid dependency issues)
    print("📦 Loading migration modules...")
    sys.path.insert(0, str(Path(__file__).parent))
    from database import SessionLocal, _DB_PATH
    from migration_loader import MigrationLoader, verify_migration_integrity
    
    print("=" * 60)
    print("🚀 PHASE 12: AUTOMATED MIGRATION WITH AUTOCALIBRATION")
    print("=" * 60)
    print()
    
    # Step 1: Extract baseline from legacy DB
    print("📊 STEP 1: EXTRACTING BASELINE FROM LEGACY DB")
    print("-" * 60)
    baseline = extract_legacy_data(legacy_db_path)
    print()
    
    # Step 2: Initialize loader
    print("📦 STEP 2: INITIALIZING MIGRATION LOADER")
    print("-" * 60)
    loader = MigrationLoader(baseline["legacy_data"])
    print()
    
    # Step 3: Prepare migration (backup + lock)
    print("🔒 STEP 3: PREPARING MIGRATION (BACKUP + LOCK)")
    print("-" * 60)
    try:
        backup_path = loader.prepare()
        print(f"✅ Backup created: {backup_path}")
        print("✅ System locked for maintenance")
    except Exception as e:
        print(f"❌ Failed to prepare migration: {e}")
        loader.close()
        sys.exit(1)
    print()
    
    # Step 4: Execute migration with batch processing
    print("🔄 STEP 4: EXECUTING MIGRATION (BATCH PROCESSING)")
    print("-" * 60)
    try:
        stats = loader.execute_migration(skip_balance_recalc=True)
        print(f"✅ Migration completed")
        print(f"📊 Migration stats: {stats}")
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        print("🔄 Auto-rollback initiated...")
        try:
            loader.rollback()
            print("✅ Rollback completed")
        except Exception as rollback_error:
            print(f"❌ Rollback failed: {rollback_error}")
        loader.close()
        sys.exit(1)
    print()
    
    # Step 5: Recalculate balances
    print("💰 STEP 5: RECALCULATING ACCOUNT BALANCES")
    print("-" * 60)
    from app.api.sync import recalculate_all_balances
    db = SessionLocal()
    try:
        updated_count = recalculate_all_balances(db)
        db.commit()
        print(f"✅ Recalculated {updated_count} account balances")
    except Exception as e:
        print(f"❌ Balance recalculation failed: {e}")
        db.rollback()
        loader.close()
        sys.exit(1)
    finally:
        db.close()
    print()
    
    # Step 6: Validate integrity
    print("🔍 STEP 6: VALIDATING INTEGRITY (CHECKSUM)")
    print("-" * 60)
    validation_result = verify_migration_integrity(baseline["expected_total_cents"])
    print()
    
    # Step 7: Final report
    print("=" * 60)
    print("📋 MIGRATION REPORT")
    print("=" * 60)
    print(f"Legacy checksum: ${baseline['expected_total_cents'] / 100:.2f}")
    print(f"New checksum: ${validation_result['actual_total_cents'] / 100:.2f}")
    print(f"Difference: ${validation_result['difference_cents'] / 100:.2f}")
    print(f"Accounts updated: {validation_result['accounts_updated']}")
    print(f"Validation status: {validation_result['status']}")
    print()
    
    print("Records migrated:")
    for table, count in baseline["record_counts"].items():
        print(f"  {table}: {count}")
    print(f"  Total: {sum(baseline['record_counts'].values())}")
    print()
    
    if validation_result["status"] == "SUCCESS":
        print("✅ MIGRATION SUCCESSFUL - System unlocked")
        loader.close()
        sys.exit(0)
    else:
        print("❌ VALIDATION FAILED - Auto-rollback initiated")
        try:
            loader.rollback()
            print("✅ Rollback completed")
        except Exception as rollback_error:
            print(f"❌ Rollback failed: {rollback_error}")
        loader.close()
        sys.exit(1)


if __name__ == "__main__":
    # Path to legacy database
    backend_dir = Path(__file__).parent
    legacy_db_path = backend_dir / "legacy_finance.db"
    
    if not legacy_db_path.exists():
        print(f"❌ Legacy database not found: {legacy_db_path}")
        sys.exit(1)
    
    run_automated_migration(str(legacy_db_path))
