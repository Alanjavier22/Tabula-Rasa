"""
Balance Sheet Service
Executive reporting: Assets - Liabilities = Equity
Source of truth: net_worth_snapshots for aggregates
"""

from datetime import datetime
from typing import List, Optional
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
        return sum(acc.balance or 0 for acc in accounts)

    @staticmethod
    def get_ious_pending_value(db: Session) -> int:
        """Calculate IOUs pending value"""
        ious = (
            db.query(IOU)
            .filter(IOU.is_deleted == False)
            .filter(IOU.amount > (IOU.amount_paid or 0))
            .all()
        )
        return sum(iou.amount - (iou.amount_paid or 0) for iou in ious)

    @staticmethod
    def get_credit_card_balances(db: Session) -> int:
        """Calculate credit card balances (unpaid statements)"""
        statements = (
            db.query(CreditCardStatement)
            .filter(CreditCardStatement.is_deleted == False)
            .filter(CreditCardStatement.status != "paid")
            .all()
        )
        # Placeholder: calculate from unpaid statements
        # For now, use simple count * average balance
        return len(statements) * 100000  # Placeholder: $1000 per unpaid statement

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
            is_stale=snapshot.is_stale,
        )

        return balance_sheet.to_dict()

    @staticmethod
    def get_current_balance_sheet(db: Session) -> Optional[dict]:
        """Get balance sheet for current month"""
        now = datetime.utcnow()
        return BalanceSheetService.get_balance_sheet(db, now.month, now.year)

    @staticmethod
    def get_balance_sheet_history(db: Session, limit: int = 12) -> List[dict]:
        """Get balance sheet history (last N months)"""
        snapshots = (
            db.query(NetWorthSnapshot)
            .order_by(NetWorthSnapshot.date.desc())
            .limit(limit)
            .all()
        )

        balance_sheets = []

        for snapshot in snapshots:
            cash_accounts_cents = BalanceSheetService.get_cash_accounts_value(db)
            snapshot_date = datetime.fromisoformat(snapshot.date) if isinstance(snapshot.date, str) else snapshot.date
            physical_assets_cents = asset_depreciation_service.get_total_assets_value(db, snapshot_date)
            ious_pending_cents = BalanceSheetService.get_ious_pending_value(db)
            credit_card_balances_cents = BalanceSheetService.get_credit_card_balances(db)

            total_assets_cents = cash_accounts_cents + physical_assets_cents
            total_liabilities_cents = ious_pending_cents + credit_card_balances_cents
            equity_cents = total_assets_cents - total_liabilities_cents

            balance_sheet = BalanceSheet(
                month=snapshot.month,
                year=snapshot.year,
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
                is_stale=snapshot.is_stale,
            )

            balance_sheets.append(balance_sheet.to_dict())

        return balance_sheets


# Singleton instance
balance_sheet_service = BalanceSheetService()
