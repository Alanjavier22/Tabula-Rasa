from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.transaction import Transaction
from app.models.net_worth_snapshot import NetWorthSnapshot
from app.services.snapshot_reconciler import SnapshotReconciler
import logging

logger = logging.getLogger(__name__)

class AutonomousSnapshotService:
    """
    Service that automatically ensures net worth snapshots exist for all months
    that have financial activity, preventing data gaps.
    """
    
    @staticmethod
    def run_reconciliation(db: Session):
        # Desactivado para evitar creación infinita de snapshots inconsistentes
        return {"created": 0, "reconciled": 0}
        
        # logger.info("[AutonomousSnapshot] Starting reconciliation run...")
        # 
        # # 1. Reconcile existing stale snapshots first
        # reconcile_results = SnapshotReconciler.reconcile_stale_snapshots(db)
        # logger.info(f"[AutonomousSnapshot] Stale reconciliation: {reconcile_results['message']}")
        # 
        # # 2. Find all unique month/year combinations in transactions
        # # This ensures we have a snapshot for every month the user has data
        # distinct_months = db.query(
        #     Transaction.date
        # ).filter(Transaction.is_deleted == False).distinct().all()
        # 
        # active_periods = set()
        # for (date,) in distinct_months:
        #     if date:
        #         active_periods.add((date.month, date.year))
        # 
        # # 3. Check which periods are missing a snapshot
        # created_count = 0
        # for month, year in active_periods:
        #     # Skip current month (it's always "in progress", snapshots are for closed/past state)
        #     now = datetime.now(timezone.utc)
        #     if month == now.month and year == now.year:
        #         continue
        #         
        #     existing = db.query(NetWorthSnapshot).filter(
        #         NetWorthSnapshot.month == month,
        #         NetWorthSnapshot.year == year,
        #         NetWorthSnapshot.is_deleted == False
        #     ).first()
        #     
        #     if not existing:
        #         logger.info(f"[AutonomousSnapshot] Creating missing snapshot for {month}/{year}")
        #         try:
        #             totals = SnapshotReconciler.calculate_month_totals(db, month, year)
        #             
        #             new_snapshot = NetWorthSnapshot(
        #                 month=month,
        #                 year=year,
        #                 total_assets=totals['total_assets_cents'],
        #                 total_liabilities=totals['total_liabilities_cents'],
        #                 net_worth=totals['net_worth_cents'],
        #                 snapshot_date=datetime(year, month, 1, tzinfo=timezone.utc),
        #                 is_stale=False
        #             )
        #             db.add(new_snapshot)
        #             db.commit()
        #             created_count += 1
        #         except Exception as e:
        #             db.rollback()
        #             logger.error(f"[AutonomousSnapshot] Failed to create snapshot for {month}/{year}: {e}")
        # 
        # if created_count > 0:
        #     logger.info(f"[AutonomousSnapshot] Successfully created {created_count} missing snapshots.")
        # else:
        #     logger.info("[AutonomousSnapshot] No missing snapshots found.")
        #     
        # return {
        #     "created": created_count,
        #     "reconciled": reconcile_results['reconciled_count']
        # }
