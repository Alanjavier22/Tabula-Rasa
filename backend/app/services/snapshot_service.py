from sqlalchemy.orm import Session
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
    def create_or_update_snapshot(db: Session, month: int, year: int) -> NetWorthSnapshot:
        """
        Calculates and saves a Net Worth snapshot for a specific month/year.
        Automates the capture of assets, liabilities, and IOUs.
        """
        # Temporal Rewind Logic: If requesting a past month, adjust current balance
        # by reversing transactions that happened after that month.
        now = datetime.now(timezone.utc)
        target_end_date = datetime(year, month, 1, tzinfo=timezone.utc)
        if month == 12:
            target_end_date = target_end_date.replace(year=year + 1, month=1)
        else:
            target_end_date = target_end_date.replace(month=month + 1)

        is_past_month = target_end_date < now

        # 1. Assets: checking + savings + investment + IOUs + DebtShares
        assets_accounts = db.query(Account).filter(
            Account.is_active == 1,
            Account.account_type.in_(["checking", "savings", "investment", "cash"])
        ).all()
        
        total_assets = 0
        for acc in assets_accounts:
            # Priority 1: Last transaction with running balance
            last_tx_with_rb = db.query(Transaction).filter(
                Transaction.account_id == acc.id,
                Transaction.date < target_end_date,
                Transaction.running_balance != None,
                Transaction.is_deleted == False
            ).order_by(Transaction.date.desc(), Transaction.created_at.desc()).first()

            if last_tx_with_rb:
                total_assets += last_tx_with_rb.running_balance
                continue

            # Priority 2: Temporal Rewind
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

        # Add pending "they_owe" IOUs and DebtShares to assets
        they_owe_ious = db.query(IOU).filter(
            IOU.iou_type == IOUType.THEY_OWE,
            IOU.status == IOUStatus.PENDING
        ).all()
        total_assets += sum((i.amount for i in they_owe_ious), 0)
        
        pending_debt_shares = db.query(DebtShare).filter(DebtShare.status == "pending").all()
        total_assets += sum((ds.amount for ds in pending_debt_shares), 0)

        # 2. Liabilities: credit card debt + I_OWE IOUs
        liabilities_accounts = db.query(Account).filter(
            Account.is_active == 1,
            Account.account_type == "credit_card"
        ).all()
        
        total_liabilities = 0
        for acc in liabilities_accounts:
            # We must get the TRUE DEBT (current consumption + deferred installments)
            # We take the max between live balance magnitude and the latest statement balance
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
            
            # Magnitude of current live debt
            live_debt = abs(int(balance))
            
            # Fetch latest statement to see if it has more debt (deferred)
            latest_stmt = db.query(CreditCardStatement).filter(
                CreditCardStatement.account_id == acc.id,
                CreditCardStatement.is_deleted == False
            ).order_by(CreditCardStatement.year.desc(), CreditCardStatement.month.desc()).first()
            
            # Fetch statement corresponding to the snapshot month/year
            latest_stmt = db.query(CreditCardStatement).filter(
                CreditCardStatement.account_id == acc.id,
                CreditCardStatement.is_deleted == False,
                CreditCardStatement.year == year,
                CreditCardStatement.month == month
            ).first()
            
            # Fallback to the most recent one if exact month not found (only if it's in the past)
            if not latest_stmt:
                latest_stmt = db.query(CreditCardStatement).filter(
                    CreditCardStatement.account_id == acc.id,
                    CreditCardStatement.is_deleted == False,
                    (CreditCardStatement.year < year) | ((CreditCardStatement.year == year) & (CreditCardStatement.month <= month))
                ).order_by(CreditCardStatement.year.desc(), CreditCardStatement.month.desc()).first()
            
            stmt_debt = latest_stmt.statement_balance if latest_stmt else 0
            
            # The real liability is whichever is greater
            total_liabilities += max(live_debt, stmt_debt)

        # Add pending "i_owe" IOUs to liabilities
        i_owe_ious = db.query(IOU).filter(
            IOU.iou_type == IOUType.I_OWE,
            IOU.status == IOUStatus.PENDING
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
            "last_updated": datetime.now(timezone.utc).isoformat()
        }

        existing = db.query(NetWorthSnapshot).filter(
            NetWorthSnapshot.month == month,
            NetWorthSnapshot.year == year
        ).first()

        if existing:
            existing.total_assets = total_assets
            existing.total_liabilities = total_liabilities
            existing.net_worth = net_worth
            existing.snapshot_date = datetime.now(timezone.utc)
            existing.metadata_json = json.dumps(metadata)
            db.commit()
            db.refresh(existing)
            return existing
        else:
            snapshot = NetWorthSnapshot(
                month=month,
                year=year,
                total_assets=total_assets,
                total_liabilities=total_liabilities,
                net_worth=net_worth,
                snapshot_date=datetime.now(timezone.utc),
                metadata_json=json.dumps(metadata)
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
        SnapshotService.create_or_update_snapshot(db, s.month, s.year)
        s.is_stale = False
        db.commit()
        updated_count += 1
    
    return updated_count
