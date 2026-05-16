from sqlalchemy.orm import Session
from typing import Any, cast
from datetime import datetime, timezone
import json
from app.models.net_worth_snapshot import NetWorthSnapshot
from app.models.account import Account
from app.models.iou import IOU, IOUType, IOUStatus
from app.models.transaction import Transaction
from sqlalchemy import func
from decimal import Decimal

from app.models.credit_card_statement import CreditCardStatement
from app.models.debt_share import DebtShare

class SnapshotService:
    @staticmethod
    def create_or_update_snapshot(db: Session, month: int, year: int, lock: bool = False) -> NetWorthSnapshot:
        """
        Calculates and saves a Net Worth snapshot for a specific month/year.
        Automates the capture of assets, liabilities, and IOUs with temporal filtering.
        """
        # --- PHASE 0: Lock Check ---
        existing = db.query(NetWorthSnapshot).filter(
            NetWorthSnapshot.month == month,
            NetWorthSnapshot.year == year,
            NetWorthSnapshot.is_deleted == False
        ).first()

        if existing and existing.is_locked:
            # DO NOT OVERWRITE manually locked or verified snapshots
            return existing

        # --- PHASE 1: Time Window Setup ---
        now = datetime.now(timezone.utc)
        target_start_date = datetime(year, month, 1, tzinfo=timezone.utc)
        
        # End of the month (exclusive)
        if month == 12:
            target_end_date = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        else:
            target_end_date = datetime(year, month + 1, 1, tzinfo=timezone.utc)

        is_past_month = target_end_date < now

        # 1. Assets: checking + savings + investment + cash
        assets_accounts = db.query(Account).filter(
            Account.is_active == 1,
            Account.account_type.in_(["checking", "savings", "investment", "cash"])
        ).all()
        
        total_assets = 0
        for acc in assets_accounts:
            # PRIORITY 1: Last transaction with running balance before the end of the target month
            last_tx_with_rb = db.query(Transaction).filter(
                Transaction.account_id == acc.id,
                Transaction.date < target_end_date,
                Transaction.running_balance != None,
                Transaction.is_deleted == False
            ).order_by(Transaction.date.desc(), Transaction.created_at.desc()).first()

            if last_tx_with_rb:
                total_assets += last_tx_with_rb.running_balance
                continue

            # PRIORITY 2: Temporal Rewind from Current Balance (Only if no RB found)
            balance = Decimal(str(acc.balance or 0))
            if is_past_month:
                future_txns = db.query(Transaction).filter(
                    Transaction.account_id == acc.id,
                    Transaction.date >= target_end_date,
                    Transaction.is_deleted == False
                ).all()
                for txn in future_txns:
                    amount = Decimal(str(txn.amount))
                    if txn.transaction_type == 'income':
                        balance -= amount
                    else:
                        balance += amount
            total_assets += int(balance)

        # INTELLIGENCE: Only add IOUs and DebtShares that EXISTED at the time of the snapshot
        they_owe_ious = db.query(IOU).filter(
            IOU.iou_type == IOUType.THEY_OWE,
            IOU.is_deleted == False,
            IOU.created_at < target_end_date, # MUST have been created before the end of the month
            (IOU.status == IOUStatus.PENDING) | (IOU.updated_at >= target_end_date) # Either still pending OR settled AFTER the snapshot month
        ).all()
        total_assets += sum((i.amount for i in they_owe_ious), 0)
        
        pending_debt_shares = db.query(DebtShare).filter(
            DebtShare.is_deleted == False,
            DebtShare.created_at < target_end_date,
            (DebtShare.status == "pending") | (DebtShare.updated_at >= target_end_date)
        ).all()
        total_assets += sum((ds.amount for ds in pending_debt_shares), 0)

        # 2. Liabilities: credit card debt + I_OWE IOUs
        liabilities_accounts = db.query(Account).filter(
            Account.is_active == 1,
            Account.account_type == "credit_card"
        ).all()
        
        total_liabilities = 0
        for acc in liabilities_accounts:
            # We must get the TRUE DEBT (current consumption + deferred installments)
            balance = Decimal(str(acc.balance or 0))
            if is_past_month:
                future_txns = db.query(Transaction).filter(
                    Transaction.account_id == acc.id,
                    Transaction.date >= target_end_date,
                    Transaction.is_deleted == False
                ).all()
                for txn in future_txns:
                    amount = Decimal(str(txn.amount))
                    if txn.transaction_type == 'income':
                        balance -= amount
                    else:
                        balance += amount
            
            # Magnitude of current live debt (usually negative in balance, so we take abs)
            live_debt = abs(int(balance))
            
            # Fetch statement corresponding to the snapshot month/year
            snapshot_stmt = db.query(CreditCardStatement).filter(
                CreditCardStatement.account_id == acc.id,
                CreditCardStatement.is_deleted == False,
                CreditCardStatement.year == year,
                CreditCardStatement.month == month
            ).first()
            
            stmt_debt = snapshot_stmt.statement_balance if snapshot_stmt else 0
            
            # The liability is the live balance at the time, or the statement balance if it was higher (due to pending settlements)
            total_liabilities += max(live_debt, stmt_debt)

        # Temporal filtering for I_OWE IOUs
        i_owe_ious = db.query(IOU).filter(
            IOU.iou_type == IOUType.I_OWE,
            IOU.is_deleted == False,
            IOU.created_at < target_end_date,
            (IOU.status == IOUStatus.PENDING) | (IOU.updated_at >= target_end_date)
        ).all()
        total_liabilities += sum((i.amount for i in i_owe_ious), 0)

        net_worth = total_assets - total_liabilities

        # Build metadata
        metadata = {
            "accounts": [
                {"id": acc.id, "name": acc.name, "type": acc.account_type, "balance": acc.balance}
                for acc in assets_accounts + liabilities_accounts
            ],
            "iou_summary": {
                "they_owe": sum((i.amount for i in they_owe_ious), 0),
                "i_owe": sum((i.amount for i in i_owe_ious), 0)
            },
            "debt_shares_summary": {
                "total_others_debt": sum((ds.amount for ds in pending_debt_shares), 0)
            },
            "auto_generated": True,
            "last_updated": datetime.now(timezone.utc).isoformat(),
            "calculation_method": "running_balance_priority"
        }

        if existing:
            existing.total_assets = cast(Any, total_assets)
            existing.total_liabilities = cast(Any, total_liabilities)
            existing.net_worth = cast(Any, net_worth)
            existing.snapshot_date = cast(Any, datetime.now(timezone.utc))
            existing.metadata_json = cast(Any, json.dumps(metadata))
            if lock:
                existing.is_locked = cast(Any, True)
            db.commit()
            db.refresh(existing)
            return existing
        else:
            snapshot = NetWorthSnapshot(
                month=month,
                year=year,
                total_assets=cast(Any, total_assets),
                total_liabilities=cast(Any, total_liabilities),
                net_worth=cast(Any, net_worth),
                snapshot_date=cast(Any, datetime.now(timezone.utc)),
                metadata_json=cast(Any, json.dumps(metadata)),
                is_locked=cast(Any, lock)
            )
            db.add(snapshot)
            db.commit()
            db.refresh(snapshot)
            return snapshot

    @staticmethod
    def get_historical_trends(db: Session, limit: int = 6) -> list:
        """Fetch the last N snapshots for trend analysis"""
        snapshots = db.query(NetWorthSnapshot).order_by(
            NetWorthSnapshot.year.desc(), 
            NetWorthSnapshot.month.desc()
        ).limit(limit).all()
        
        return [
            {
                "period": f"{s.month}/{s.year}",
                "net_worth": s.net_worth / 100,
                "assets": s.total_assets / 100,
                "liabilities": s.total_liabilities / 100
            } for s in reversed(snapshots)
        ]

def mark_snapshots_as_stale(db: Session, month: int, year: int):
    """
    Marks all snapshots from a certain date forward as stale.
    This triggers the auto-healer.
    """
    db.query(NetWorthSnapshot).filter(
        (NetWorthSnapshot.year > year) | 
        ((NetWorthSnapshot.year == year) & (NetWorthSnapshot.month >= month))
    ).update({"is_stale": True})
    db.commit()

def recalculate_stale_snapshots(db: Session):
    """
    Finds all stale snapshots and recalculates them one by one.
    """
    stale_snapshots = db.query(NetWorthSnapshot).filter(
        NetWorthSnapshot.is_stale == True
    ).order_by(NetWorthSnapshot.year.asc(), NetWorthSnapshot.month.asc()).all()
    
    updated_count = 0
    for s in stale_snapshots:
        SnapshotService.create_or_update_snapshot(db, cast(int, s.month), cast(int, s.year))
        s.is_stale = cast(Any, False)
        db.commit()
        updated_count += 1
    
    return updated_count
