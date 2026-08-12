import argparse
import os
import sys
from datetime import datetime

# Add current directory to path
sys.path.append(os.getcwd())

from database import SessionLocal
from app.services.snapshot_service import SnapshotService


def main():
    parser = argparse.ArgumentParser(description="Recalculate net worth snapshots for a range of months.")
    parser.add_argument("--year", type=int, default=datetime.now().year, help="Year to recalculate (default: current year)")
    parser.add_argument("--start-month", type=int, default=datetime.now().month, help="First month to recalculate, 1-12 (default: current month)")
    parser.add_argument("--end-month", type=int, default=datetime.now().month, help="Last month to recalculate, 1-12 (default: current month)")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        print(f"Recalculating snapshots for {args.year} (month {args.start_month}-{args.end_month})...")
        for m in range(args.start_month, args.end_month + 1):
            SnapshotService.create_or_update_snapshot(db, m, args.year)
            print(f"  - Month {m}/{args.year} updated.")

        print("Success: snapshots updated with current CC debt and DebtShare logic.")
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()


if __name__ == "__main__":
    main()
