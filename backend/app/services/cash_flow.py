"""
Cash Flow Service - Balance Projection Engine
Projects future balance using subscriptions, IOUs, and seasonal adjustments
Operates on aggregates only (fast, no 50k transaction scans)
"""

from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy.orm import Session
from app.models.account import Account
from app.models.transaction import Transaction
from app.models.subscription import Subscription
from app.models.iou import IOU
from app.models.credit_card_statement import CreditCardStatement
from app.models.debt_share import DebtShare


class ProjectedBalanceResult:
    def __init__(
        self,
        days: int,
        current_balance: int,
        projected_balance: int,
        projected_income: int,
        projected_expenses: int,
        seasonal_adjustment: int,
        breakdown: dict,
    ):
        self.days = days
        self.current_balance = current_balance
        self.projected_balance = projected_balance
        self.projected_income = projected_income
        self.projected_expenses = projected_expenses
        self.seasonal_adjustment = seasonal_adjustment
        self.breakdown = breakdown

    def to_dict(self):
        return {
            "days": self.days,
            "current_balance": self.current_balance,
            "projected_balance": self.projected_balance,
            "projected_income": self.projected_income,
            "projected_expenses": self.projected_expenses,
            "seasonal_adjustment": self.seasonal_adjustment,
            "breakdown": self.breakdown,
        }


class CashFlowService:
    """
    Get projected balance for N days ahead
    Fast algorithm using aggregates only
    """

    @staticmethod
    def calculate_seasonal_adjustment(
        db: Session, start_date: datetime, end_date: datetime
    ) -> int:
        """
        Calculate seasonal adjustment for a date range
        Ecuador-specific: April (Utilidades), August/December (Décimos)
        """
        adjustment = 0
        current_year = start_date.year

        # Check if April falls in range (Utilidades)
        april_start = datetime(current_year, 4, 1)
        april_end = datetime(current_year, 4, 30)
        if CashFlowService.date_ranges_overlap(start_date, end_date, april_start, april_end):
            adjustment += CashFlowService.get_monthly_income_proxy(db, current_year, 4)

        # Check if August falls in range (Décimo Tercero)
        august_start = datetime(current_year, 8, 1)
        august_end = datetime(current_year, 8, 31)
        if CashFlowService.date_ranges_overlap(start_date, end_date, august_start, august_end):
            adjustment += CashFlowService.get_monthly_income_proxy(db, current_year, 8)

        # Check if December falls in range (Décimo Cuarto)
        december_start = datetime(current_year, 12, 1)
        december_end = datetime(current_year, 12, 31)
        if CashFlowService.date_ranges_overlap(start_date, end_date, december_start, december_end):
            adjustment += CashFlowService.get_monthly_income_proxy(db, current_year, 12)

        return adjustment

    @staticmethod
    def date_ranges_overlap(start1: datetime, end1: datetime, start2: datetime, end2: datetime) -> bool:
        """Check if two date ranges overlap"""
        return start1 <= end2 and end1 >= start2

    @staticmethod
    def get_monthly_income_proxy(db: Session, year: int, month: int) -> int:
        """
        Get monthly income proxy for seasonal adjustment
        Simplified: use average of last 3 months
        """
        try:
            month_start = datetime(year, month, 1)
            month_end = datetime(year, month + 1, 1) - timedelta(days=1)

            month_income = (
                db.query(Transaction)
                .filter(Transaction.is_deleted == False)
                .filter(Transaction.transaction_type == "income")
                .filter(Transaction.date >= month_start)
                .filter(Transaction.date <= month_end)
                .all()
            )

            if month_income:
                return sum(t.amount for t in month_income)

            # Fallback: use 90-day average / 3
            ninety_days_ago = datetime.now() - timedelta(days=90)
            recent_income = (
                db.query(Transaction)
                .filter(Transaction.is_deleted == False)
                .filter(Transaction.transaction_type == "income")
                .filter(Transaction.date >= ninety_days_ago)
                .all()
            )

            total_income = sum(t.amount for t in recent_income)
            return total_income // 3
        except Exception as e:
            print(f"[CashFlowService] Error getting monthly income proxy: {e}")
            return 0

    @staticmethod
    def get_projected_balance(db: Session, days: int) -> ProjectedBalanceResult:
        """Get projected balance for N days ahead"""
        now = datetime.now()
        future_date = now + timedelta(days=days)

        try:
            # 1. Current balance (Only LIQUID assets: checking + savings)
            # We exclude credit card 'balances' (debt) and investments (not liquid)
            accounts = db.query(Account).filter(
                Account.is_deleted == False,
                Account.account_type.in_(["checking", "savings"])
            ).all()
            current_balance = sum(acc.balance or 0 for acc in accounts)

            # 2. Projected income (90-day average)
            # CRITICAL: We exclude internal transfers and refunds to prevent budget inflation.
            from app.models.category import Category
            
            ninety_days_ago = now - timedelta(days=90)
            
            # Subquery to get IDs of categories to ignore
            ignored_categories = db.query(Category.id).filter(
                (Category.name.ilike("%Transferencia Interna%")) | 
                (Category.name.ilike("%Devolucion%")) | 
                (Category.name.ilike("%Ajuste%")) |
                (Category.name.ilike("%Meta%"))
            ).all()
            ignored_ids = [c[0] for c in ignored_categories]

            recent_income_query = (
                db.query(Transaction)
                .filter(Transaction.is_deleted == False)
                .filter(Transaction.transaction_type == "income")
                .filter(Transaction.date >= ninety_days_ago)
            )
            
            # EXCLUSION LOGIC: Remove noise from salary projection
            # We ignore internal transfers, refunds, and partner contributions to get a "pure" salary average
            if ignored_ids:
                recent_income_query = recent_income_query.filter(Transaction.category_id.not_in(ignored_ids))
            
            # String filters for common non-salary keywords
            recent_income = [
                t for t in recent_income_query.all()
                if not any(k in t.description.upper() for k in ["DENNIS", "DANIEL", "META", "TRANSFERENCIA", "PAGO EN OFIC", "MUCHAS GRACIAS"])
            ]

            total_income = sum(t.amount for t in recent_income)
            avg_daily_income = total_income / 90 if recent_income else 0
            
            # PRUDENCE: Apply a 0.7 safety factor (70%) to projected income.
            # This ensures we don't over-rely on historical averages that might include one-time windfalls.
            projected_income = round(avg_daily_income * days * 0.7)

            # 3. Subscriptions due in period
            subscriptions = (
                db.query(Subscription)
                .filter(Subscription.is_deleted == False)
                .filter(Subscription.next_billing_date.isnot(None))
                .all()
            )

            subscription_cost = 0
            for sub in subscriptions:
                if sub.next_billing_date:
                    next_billing = datetime.fromisoformat(sub.next_billing_date) if isinstance(sub.next_billing_date, str) else sub.next_billing_date
                    if next_billing.replace(tzinfo=None) >= now.replace(tzinfo=None) and next_billing.replace(tzinfo=None) <= future_date.replace(tzinfo=None):
                        subscription_cost += sub.amount or 0

            # 4. IOUs due in period (Only what I OWE is an expense, what they OWE is recovery)
            from app.models.iou import IOUType
            ious = db.query(IOU).filter(IOU.status == "pending", IOU.is_deleted == False).all()
            
            iou_expense = sum(iou.amount for iou in ious if iou.iou_type == IOUType.I_OWE)
            iou_recovery = sum(iou.amount for iou in ious if iou.iou_type == IOUType.THEY_OWE)

            # 5. Credit Card debt: Only statements due in the projection period
            # This allows installments due in future months to not block current liquidity
            statements = (
                db.query(CreditCardStatement)
                .filter(CreditCardStatement.is_deleted == False)
                .filter(CreditCardStatement.status.in_(["PENDING", "PARTIAL"]))
                .filter(CreditCardStatement.payment_due_date <= future_date)
                .all()
            )
            cc_total_debt = sum(max(0, s.user_share - s.amount_paid) for s in statements)

            # 6. Debt Shares (Money others owe me for CC payments - RECOVERY)
            debt_shares = (
                db.query(DebtShare)
                .filter(DebtShare.status == "pending")
                .all()
            )
            debt_recovery = sum(ds.amount for ds in debt_shares)

            # 7. Seasonal adjustment
            seasonal_adjustment = CashFlowService.calculate_seasonal_adjustment(db, now, future_date)

            # Calculate projected balance
            # PRUDENCE: Real expenses vs Real recoveries
            projected_expenses = subscription_cost + iou_expense + cc_total_debt
            projected_recoveries = iou_recovery + debt_recovery
            
            projected_balance = current_balance + projected_income - projected_expenses + projected_recoveries + seasonal_adjustment

            # FINAL RESULTS IN CENTS (Standard)
            return ProjectedBalanceResult(
                days=days,
                current_balance=int(current_balance),
                projected_balance=int(projected_balance),
                projected_income=int(projected_income),
                projected_expenses=int(projected_expenses),
                seasonal_adjustment=int(seasonal_adjustment),
                breakdown={
                    "subscriptions": int(subscription_cost),
                    "ious": int(iou_expense - iou_recovery), # Net IOU position
                    "credit_cards": int(cc_total_debt),
                    "debt_shares": int(debt_recovery),
                    "seasonal": int(seasonal_adjustment),
                },
            )
        except Exception as e:
            import traceback
            traceback.print_exc()
            print(f"[CashFlowService] Error calculating projection: {e}")
            raise e

    @staticmethod
    def get_cash_flow_forecast(db: Session) -> dict:
        """
        Get cash flow forecast for multiple time horizons
        Returns projections for 30, 60, and 90 days
        """
        day30 = CashFlowService.get_projected_balance(db, 30)
        day60 = CashFlowService.get_projected_balance(db, 60)
        day90 = CashFlowService.get_projected_balance(db, 90)

        return {
            "day30": day30.to_dict(),
            "day60": day60.to_dict(),
            "day90": day90.to_dict(),
        }


# Singleton instance
cash_flow_service = CashFlowService()
