"""
Balance Sheet Service
Executive reporting: Assets - Liabilities = Equity
Source of truth: net_worth_snapshots for aggregates
"""

from datetime import datetime, timezone
from typing import List, Optional, Any, cast
import json
from sqlalchemy.orm import Session
from app.models.account import Account
from app.models.iou import IOU
from app.models.credit_card_statement import CreditCardStatement
from app.models.net_worth_snapshot import NetWorthSnapshot
from app.services.asset_depreciation import asset_depreciation_service


class BalanceSheet:
    def __init__(
        self,
        month: int,
        year: int,
        date: str,
        assets: dict,
        liabilities: dict,
        equity_cents: int,
        is_stale: bool,
    ):
        self.month = month
        self.year = year
        self.date = date
        self.assets = assets
        self.liabilities = liabilities
        self.equity_cents = equity_cents
        self.is_stale = is_stale

    def to_dict(self):
        return {
            "month": self.month,
            "year": self.year,
            "date": self.date,
            "assets": self.assets,
            "liabilities": self.liabilities,
            "equity_cents": self.equity_cents,
            "is_stale": self.is_stale,
        }


class BalanceSheetService:
    """
    Get balance sheet for a specific month/year
    Uses net_worth_snapshot as source of truth for aggregates
    """

    @staticmethod
    def get_cash_accounts_value(db: Session) -> int:
        """Calculate cash accounts value (checking + savings)"""
        accounts = (
            db.query(Account)
            .filter(Account.is_deleted == False)
            .filter(Account.account_type.in_(["checking", "savings"]))
            .all()
        )
        return cast(int, sum(cast(int, acc.balance or 0) for acc in accounts))

    @staticmethod
    def get_ious_pending_value(db: Session) -> int:
        """Calculate IOUs pending value"""
        ious = (
            db.query(IOU)
            .filter(IOU.is_deleted == False)
            .filter(IOU.status == "pending")
            .filter(IOU.iou_type == "i_owe")
            .all()
        )
        return cast(int, sum((cast(int, iou.amount or 0)) - (cast(int, iou.amount_paid or 0)) for iou in ious))

    @staticmethod
    def get_credit_card_balances(db: Session) -> int:
        """Calculate credit card balances (unpaid statements + live unbilled debt)"""
        statements = (
            db.query(CreditCardStatement)
            .filter(CreditCardStatement.is_deleted == False)
            .filter(CreditCardStatement.status != "paid")
            .all()
        )
        
        # 1. Unpaid statements (formal debt)
        stmt_balance = sum(
            max((stmt.user_share or 0) - (stmt.amount_paid or 0), 0)
            for stmt in statements
        )
        
        # 2. Live balance from CC accounts (unbilled debt)
        cc_accounts = db.query(Account).filter(Account.account_type == "credit_card", Account.is_deleted == False).all()
        live_cc_balance = sum(acc.balance or 0 for acc in cc_accounts)
        
        return cast(int, stmt_balance + live_cc_balance)

    @staticmethod
    def get_balance_sheet(db: Session, month: int, year: int) -> Optional[dict]:
        """Get balance sheet for a specific month/year"""
        snapshot = (
            db.query(NetWorthSnapshot)
            .filter(NetWorthSnapshot.month == month)
            .filter(NetWorthSnapshot.year == year)
            .first()
        )

        if not snapshot:
            return None

        # Calculate detailed breakdown
        cash_accounts_cents = BalanceSheetService.get_cash_accounts_value(db)
        snapshot_date = datetime.fromisoformat(snapshot.date) if isinstance(snapshot.date, str) else snapshot.date
        physical_assets_cents = asset_depreciation_service.get_total_assets_value(db, snapshot_date)
        ious_pending_cents = BalanceSheetService.get_ious_pending_value(db)
        credit_card_balances_cents = BalanceSheetService.get_credit_card_balances(db)

        total_assets_cents = cash_accounts_cents + physical_assets_cents
        total_liabilities_cents = ious_pending_cents + credit_card_balances_cents
        equity_cents = total_assets_cents - total_liabilities_cents

        balance_sheet = BalanceSheet(
            month=month,
            year=year,
            date=snapshot.date,
            assets={
                "cash_accounts_cents": cash_accounts_cents,
                "physical_assets_cents": physical_assets_cents,
                "total_assets_cents": total_assets_cents,
            },
            liabilities={
                "ious_pending_cents": ious_pending_cents,
                "credit_card_balances_cents": credit_card_balances_cents,
                "total_liabilities_cents": total_liabilities_cents,
            },
            equity_cents=equity_cents,
            is_stale=cast(bool, snapshot.is_stale),
        )

        return balance_sheet.to_dict()

    @staticmethod
    def get_current_balance_sheet(db: Session) -> Optional[dict]:
        """Get balance sheet for current month (Real-time calculation)"""
        now = datetime.now(timezone.utc)
        # For current month, we calculate from live account balances
        cash_accounts_cents = BalanceSheetService.get_cash_accounts_value(db)
        physical_assets_cents = asset_depreciation_service.get_total_assets_value(db, now)
        ious_pending_cents = BalanceSheetService.get_ious_pending_value(db)
        credit_card_balances_cents = BalanceSheetService.get_credit_card_balances(db)

        total_assets_cents = cash_accounts_cents + physical_assets_cents
        total_liabilities_cents = ious_pending_cents + credit_card_balances_cents
        equity_cents = total_assets_cents - total_liabilities_cents

        return {
            "month": now.month,
            "year": now.year,
            "date": now.isoformat(),
            "assets": {
                "cash_accounts_cents": cash_accounts_cents,
                "physical_assets_cents": physical_assets_cents,
                "total_assets_cents": total_assets_cents,
            },
            "liabilities": {
                "ious_pending_cents": ious_pending_cents,
                "credit_card_balances_cents": credit_card_balances_cents,
                "total_liabilities_cents": total_liabilities_cents,
            },
            "equity_cents": equity_cents,
            "is_stale": False,
        }

    @staticmethod
    def get_balance_sheet_history(db: Session, limit: int = 12) -> List[dict]:
        """Get balance sheet history (last N months) using Snapshot data as Source of Truth"""
        snapshots = (
            db.query(NetWorthSnapshot)
            .filter(NetWorthSnapshot.is_deleted == False)
            .order_by(NetWorthSnapshot.year.desc(), NetWorthSnapshot.month.desc())
            .limit(limit)
            .all()
        )

        balance_sheets = []

        for snapshot in snapshots:
            # TRY TO EXTRACT DATA FROM METADATA (The "Photo" taken at that time)
            try:
                metadata = json.loads(cast(str, snapshot.metadata_json)) if snapshot.metadata_json else {}
                
                # Check if we have detailed account data in metadata
                accounts_meta = metadata.get("accounts", [])
                if accounts_meta:
                    cash_accounts_cents = sum(acc["balance"] for acc in accounts_meta if acc["type"] in ["checking", "savings"])
                    # Liabilities are handled specifically in CC logic
                else:
                    # Fallback to the snapshot aggregate if detail is missing
                    cash_accounts_cents = snapshot.total_assets - (snapshot.total_assets * 0.1) # Proxy if metadata is empty
            except:
                cash_accounts_cents = snapshot.total_assets

            # Calculate historical physical assets value at THAT time
            snapshot_date = datetime.fromisoformat(snapshot.snapshot_date.isoformat()) if hasattr(snapshot.snapshot_date, 'isoformat') else snapshot.snapshot_date
            physical_assets_cents = asset_depreciation_service.get_total_assets_value(db, cast(datetime, snapshot_date))
            
            # Recalculate equity based on snapshot's verified totals
            total_assets_cents = snapshot.total_assets
            total_liabilities_cents = snapshot.total_liabilities
            equity_cents = snapshot.net_worth

            balance_sheet = {
                "month": snapshot.month,
                "year": snapshot.year,
                "date": snapshot.snapshot_date.isoformat() if hasattr(snapshot.snapshot_date, 'isoformat') else snapshot.snapshot_date,
                "assets": {
                    "cash_accounts_cents": int(cast(Any, cash_accounts_cents)),
                    "physical_assets_cents": int(cast(Any, physical_assets_cents)),
                    "total_assets_cents": int(cast(Any, total_assets_cents)),
                },
                "liabilities": {
                    "total_liabilities_cents": int(cast(Any, total_liabilities_cents)),
                },
                "equity_cents": int(cast(Any, equity_cents)),
                "is_stale": snapshot.is_stale,
            }

            balance_sheets.append(balance_sheet)

        return balance_sheets


# Singleton instance
balance_sheet_service = BalanceSheetService()
