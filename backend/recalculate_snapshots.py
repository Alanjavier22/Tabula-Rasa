import os
import sys

# Add current directory to path
sys.path.append(os.getcwd())

from database import SessionLocal
from app.services.snapshot_service import SnapshotService

def main():
    db = SessionLocal()
    try:
        print("Recalculating snapshots for 2026 (Jan-May)...")
        for m in range(1, 6):
            SnapshotService.create_or_update_snapshot(db, m, 2026)
            print(f"  - Month {m}/2026 updated.")
        
        print("Recalculating snapshot for 12/2025...")
        SnapshotService.create_or_update_snapshot(db, 12, 2025)
        print("  - Month 12/2025 updated.")
        
        print("Success: All snapshots updated with rigorous CC debt and DebtShare logic.")
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    main()
