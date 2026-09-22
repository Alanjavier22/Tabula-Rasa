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


def _rewind_balance(
    db: Session,
    account: Account,
    target_end_date: datetime,
    is_past_month: bool,
) -> int:
    """Returns an account balance at the snapshot cutoff."""
    balance = Decimal(str(account.balance or 0))
    if not is_past_month:
        return int(balance)

    future_txns = db.query(Transaction).filter(
        Transaction.account_id == account.id,
        Transaction.date >= target_end_date,
        Transaction.is_deleted == False,
    ).all()
    for txn in future_txns:
        amount = Decimal(str(txn.amount))
        balance -= amount if txn.transaction_type == "income" else -amount
    return int(balance)


def _calculate_assets(
    db: Session,
    accounts: list[Account],
    target_end_date: datetime,
    is_past_month: bool,
) -> int:
    """Calculates assets using running balances when available."""
    total_assets = 0
    for account in accounts:
        last_tx_with_rb = db.query(Transaction).filter(
            Transaction.account_id == account.id,
            Transaction.date < target_end_date,
            Transaction.running_balance != None,
            Transaction.is_deleted == False,
        ).order_by(Transaction.date.desc(), Transaction.created_at.desc()).first()
        total_assets += (
            last_tx_with_rb.running_balance
            if last_tx_with_rb
            else _rewind_balance(db, account, target_end_date, is_past_month)
        )
    return total_assets


def _get_temporal_ious(db: Session, iou_type: IOUType, target_end_date: datetime) -> list[IOU]:
    """Returns IOUs that existed at the snapshot cutoff."""
    return db.query(IOU).filter(
        IOU.iou_type == iou_type,
        IOU.is_deleted == False,
        IOU.created_at < target_end_date,
        (IOU.status == IOUStatus.PENDING) | (IOU.updated_at >= target_end_date),
    ).all()


def _get_pending_debt_shares(db: Session, target_end_date: datetime) -> list[DebtShare]:
    return db.query(DebtShare).filter(
        DebtShare.is_deleted == False,
        DebtShare.created_at < target_end_date,
        (DebtShare.status == "pending") | (DebtShare.updated_at >= target_end_date),
    ).all()


def _calculate_liabilities(
    db: Session,
    accounts: list[Account],
    month: int,
    year: int,
    target_end_date: datetime,
    is_past_month: bool,
) -> int:
    """Calculates credit-card liabilities at the snapshot cutoff."""
    total_liabilities = 0
    for account in accounts:
        live_debt = abs(_rewind_balance(db, account, target_end_date, is_past_month))
        snapshot_stmt = db.query(CreditCardStatement).filter(
            CreditCardStatement.account_id == account.id,
            CreditCardStatement.is_deleted == False,
            CreditCardStatement.year == year,
            CreditCardStatement.month == month,
        ).first()
        statement_debt = snapshot_stmt.statement_balance if snapshot_stmt else 0
        total_liabilities += max(live_debt, statement_debt)
    return total_liabilities


def _build_metadata(
    assets_accounts: list[Account],
    liabilities_accounts: list[Account],
    they_owe_ious: list[IOU],
    i_owe_ious: list[IOU],
    pending_debt_shares: list[DebtShare],
) -> dict:
    return {
        "accounts": [
            {"id": acc.id, "name": acc.name, "type": acc.account_type, "balance": acc.balance}
            for acc in assets_accounts + liabilities_accounts
        ],
        "iou_summary": {
            "they_owe": sum((iou.amount for iou in they_owe_ious), 0),
            "i_owe": sum((iou.amount for iou in i_owe_ious), 0),
        },
        "debt_shares_summary": {
            "total_others_debt": sum((share.amount for share in pending_debt_shares), 0),
        },
        "auto_generated": True,
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "calculation_method": "running_balance_priority",
    }


def _persist_snapshot(
    db: Session,
    existing: NetWorthSnapshot | None,
    month: int,
    year: int,
    total_assets: int,
    total_liabilities: int,
    metadata: dict,
    lock: bool,
) -> NetWorthSnapshot:
    net_worth = total_assets - total_liabilities
    snapshot_date = datetime.now(timezone.utc)
    metadata_json = json.dumps(metadata)
    if existing:
        existing.total_assets = cast(Any, total_assets)
        existing.total_liabilities = cast(Any, total_liabilities)
        existing.net_worth = cast(Any, net_worth)
        existing.snapshot_date = cast(Any, snapshot_date)
        existing.metadata_json = cast(Any, metadata_json)
        if lock:
            existing.is_locked = cast(Any, True)
        db.commit()
        db.refresh(existing)
        return existing

    snapshot = NetWorthSnapshot(
        month=month,
        year=year,
        total_assets=cast(Any, total_assets),
        total_liabilities=cast(Any, total_liabilities),
        net_worth=cast(Any, net_worth),
        snapshot_date=cast(Any, snapshot_date),
        metadata_json=cast(Any, metadata_json),
        is_locked=cast(Any, lock),
    )
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)
    return snapshot


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

        target_end_date = datetime(year + (month == 12), 1 if month == 12 else month + 1, 1, tzinfo=timezone.utc)
        is_past_month = target_end_date < datetime.now(timezone.utc)
        assets_accounts = db.query(Account).filter(
            Account.is_active == 1,
            Account.account_type.in_(["checking", "savings", "investment", "cash"])
        ).all()
        total_assets = _calculate_assets(db, assets_accounts, target_end_date, is_past_month)
        they_owe_ious = _get_temporal_ious(db, IOUType.THEY_OWE, target_end_date)
        pending_debt_shares = _get_pending_debt_shares(db, target_end_date)
        total_assets += sum((iou.amount for iou in they_owe_ious), 0)
        total_assets += sum((share.amount for share in pending_debt_shares), 0)

        liabilities_accounts = db.query(Account).filter(
            Account.is_active == 1,
            Account.account_type == "credit_card"
        ).all()
        total_liabilities = _calculate_liabilities(
            db, liabilities_accounts, month, year, target_end_date, is_past_month
        )
        i_owe_ious = _get_temporal_ious(db, IOUType.I_OWE, target_end_date)
        total_liabilities += sum((i.amount for i in i_owe_ious), 0)
        metadata = _build_metadata(
            assets_accounts,
            liabilities_accounts,
            they_owe_ious,
            i_owe_ious,
            pending_debt_shares,
        )
        return _persist_snapshot(
            db, existing, month, year, total_assets, total_liabilities, metadata, lock
        )

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
