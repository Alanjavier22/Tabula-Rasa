"""
Cash Flow Service - Balance Projection Engine
Projects future balance using subscriptions, IOUs, and seasonal adjustments
Operates on aggregates only (fast, no 50k transaction scans)
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, Any, cast
import statistics
from collections import defaultdict
from sqlalchemy import func
from sqlalchemy.orm import Session
import logging
import json

from app.models.account import Account
from app.models.transaction import Transaction, TransactionType
from app.models.subscription import Subscription
from app.models.iou import IOU
from app.models.credit_card_statement import CreditCardStatement
from app.models.debt_share import DebtShare
from app.utils.date_parser import parse_date_robustly

logger = logging.getLogger(__name__)

DEFAULT_INCOME_BLACKLIST = [
    "DENNIS", "DANIEL", "META", "TRANSFERENCIA", "PAGO EN OFIC",
    "MUCHAS GRACIAS", "TRANSF. DEUDA", "SU PAGO", "ABONO",
]


def _get_current_liquid_balance(db: Session) -> int:
    accounts = db.query(Account).filter(
        Account.is_deleted == False,
        Account.account_type.in_(["checking", "savings"]),
    ).all()
    return sum(account.balance or 0 for account in accounts)


def _load_income_history(db: Session, now: datetime) -> tuple[list[Transaction], list[str], int]:
    from app.models.category import Category
    from app.models.config import Config

    lookback_days = 180
    history_start = now - timedelta(days=lookback_days)
    ignored_categories = db.query(Category.id).filter(
        (Category.name.ilike("%Transferencia%")) |
        (Category.name.ilike("%Devolucion%")) |
        (Category.name.ilike("%Ajuste%")) |
        (Category.name.ilike("%Meta%"))
    ).all()
    ignored_ids = [category[0] for category in ignored_categories]

    income_query = db.query(Transaction).filter(
        Transaction.is_deleted == False,
        Transaction.is_internal == False,
        Transaction.transaction_type == "income",
        Transaction.date >= history_start,
    )
    if ignored_ids:
        income_query = income_query.filter(Transaction.category_id.not_in(ignored_ids))

    config_entry = db.query(Config).filter(
        Config.key == "income_blacklist",
        Config.is_deleted == False,
    ).first()
    if config_entry and config_entry.value:
        try:
            blacklist = json.loads(config_entry.value)
        except Exception:
            blacklist = [item.strip() for item in config_entry.value.split(",") if item.strip()]
    else:
        blacklist = DEFAULT_INCOME_BLACKLIST.copy()
        try:
            db.add(Config(
                key="income_blacklist",
                value=json.dumps(blacklist),
                value_type="json",
                description="Lista de palabras clave para ignorar en proyecciones de ingresos",
                is_public=True,
            ))
            db.commit()
        except Exception:
            db.rollback()

    return income_query.all(), blacklist, lookback_days


def _group_recurring_income(transactions: list[Transaction], blacklist: list[str]) -> dict[str, list[Transaction]]:
    sources = defaultdict(list)
    for transaction in transactions:
        description = (transaction.description or "").upper().strip()
        if any(keyword in description for keyword in blacklist):
            continue
        sources[description].append(transaction)
    return sources


def _get_temporal_consistency_score(transactions: list[Transaction]) -> int:
    if len(transactions) < 2:
        return 0
    try:
        standard_deviation = statistics.stdev([transaction.date.day for transaction in transactions])
        if standard_deviation < 5:
            return 30
        if standard_deviation < 10:
            return 15
    except statistics.StatisticsError:
        pass
    return 0


def _get_amount_stability_score(transactions: list[Transaction]) -> int:
    amounts = [float(transaction.amount) for transaction in transactions]
    if len(amounts) < 2:
        return 0

    average_amount = sum(amounts) / len(amounts)
    try:
        standard_deviation = statistics.stdev(amounts)
        variation_coefficient = standard_deviation / average_amount if average_amount > 0 else 1
        if variation_coefficient < 0.2:
            return 20
        if variation_coefficient < 0.4:
            return 10
    except statistics.StatisticsError:
        pass
    return 0


def _get_income_source_score(description: str, transactions: list[Transaction], lookback_days: int) -> float:
    months_present = {transaction.date.strftime("%Y-%m") for transaction in transactions}
    number_of_months = len(months_present)
    if number_of_months < 2:
        return 0

    salary_keywords = [
        "SUELDO", "NOMINA", "PAYROLL", "SALARY", "HONORARIOS", "VIAMATICA", "PAGO DIRECTO",
    ]
    if any(keyword in description for keyword in salary_keywords):
        return 100

    recurrence_score = min(40, number_of_months / (lookback_days / 30) * 40)
    return recurrence_score + _get_temporal_consistency_score(transactions) + _get_amount_stability_score(transactions)


def _calculate_projected_income(db: Session, now: datetime, days: int) -> int:
    transactions, blacklist, lookback_days = _load_income_history(db, now)
    sources = _group_recurring_income(transactions, blacklist)
    total_recurring_monthly = 0
    for description, source_transactions in sources.items():
        score = _get_income_source_score(description, source_transactions, lookback_days)
        if score < 45:
            continue
        total_source_amount = sum(transaction.amount for transaction in source_transactions)
        expected_monthly = total_source_amount / (lookback_days / 30)
        safety = 0.6 + ((score - 45) / 55) * 0.35
        total_recurring_monthly += expected_monthly * safety
    return round((total_recurring_monthly / 30) * days)


def _is_subscription_due(next_billing: Optional[datetime], now: datetime, future_date: datetime) -> bool:
    if not next_billing:
        return False
    normalized_date = next_billing.replace(tzinfo=None)
    return now.replace(tzinfo=None) <= normalized_date <= future_date.replace(tzinfo=None)


def _calculate_subscription_cost(db: Session, now: datetime, future_date: datetime) -> int:
    subscriptions = db.query(Subscription).filter(
        Subscription.is_deleted == False,
        Subscription.next_billing_date.isnot(None),
    ).all()
    subscription_cost = 0
    for subscription in subscriptions:
        next_billing = parse_date_robustly(subscription.next_billing_date)
        if _is_subscription_due(next_billing, now, future_date):
            subscription_cost += subscription.amount or 0
    return subscription_cost


def _get_iou_totals(db: Session) -> tuple[int, int]:
    from app.models.iou import IOUType

    ious = db.query(IOU).filter(
        IOU.status == "pending",
        IOU.is_deleted == False,
    ).all()
    iou_expense = sum(iou.amount for iou in ious if iou.iou_type == IOUType.I_OWE)
    iou_recovery = sum(iou.amount for iou in ious if iou.iou_type == IOUType.THEY_OWE)
    return iou_expense, iou_recovery


def _get_credit_card_debt(db: Session, future_date: datetime) -> int:
    statements = db.query(CreditCardStatement).filter(
        CreditCardStatement.is_deleted == False,
        CreditCardStatement.status.in_(["PENDING", "PARTIAL"]),
        CreditCardStatement.payment_due_date <= future_date,
    ).all()
    return sum(max(0, statement.user_share - statement.amount_paid) for statement in statements)


def _get_debt_recovery(db: Session) -> int:
    debt_shares = db.query(DebtShare).filter(DebtShare.status == "pending").all()
    return sum(debt_share.amount for debt_share in debt_shares)


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
            if month == 12:
                next_month_start = datetime(year + 1, 1, 1)
            else:
                next_month_start = datetime(year, month + 1, 1)
            month_end = next_month_start - timedelta(days=1)

            month_income_sum = (
                db.query(func.sum(Transaction.amount))
                .filter(Transaction.is_deleted == False)
                .filter(Transaction.transaction_type == "income")
                .filter(Transaction.date >= month_start)
                .filter(Transaction.date <= month_end)
                .scalar()
            )

            if month_income_sum is not None:
                return int(month_income_sum)

            # Fallback: use 90-day average / 3
            ninety_days_ago = datetime.now() - timedelta(days=90)
            recent_income_sum = (
                db.query(func.sum(Transaction.amount))
                .filter(Transaction.is_deleted == False)
                .filter(Transaction.transaction_type == "income")
                .filter(Transaction.date >= ninety_days_ago)
                .scalar()
            )

            if recent_income_sum is not None:
                return int(recent_income_sum) // 3
            return 0
        except Exception:  # pragma: no cover
            logger.exception("[CashFlowService] Error getting monthly income proxy")  # pragma: no cover
            return 0

    @staticmethod
    def get_projected_balance(db: Session, days: int) -> ProjectedBalanceResult:
        """Get projected balance for N days ahead"""
        now = datetime.now()
        future_date = now + timedelta(days=days)

        try:
            current_balance = _get_current_liquid_balance(db)
            projected_income = _calculate_projected_income(db, now, days)
            subscription_cost = _calculate_subscription_cost(db, now, future_date)
            iou_expense, iou_recovery = _get_iou_totals(db)
            cc_total_debt = _get_credit_card_debt(db, future_date)
            debt_recovery = _get_debt_recovery(db)
            seasonal_adjustment = CashFlowService.calculate_seasonal_adjustment(db, now, future_date)

            projected_expenses = subscription_cost + iou_expense + cc_total_debt
            projected_recoveries = iou_recovery + debt_recovery
            projected_balance = (
                current_balance
                + projected_income
                - projected_expenses
                + projected_recoveries
                + seasonal_adjustment
            )

            return ProjectedBalanceResult(
                days=days,
                current_balance=int(cast(Any, current_balance)),
                projected_balance=int(cast(Any, projected_balance)),
                projected_income=int(cast(Any, projected_income)),
                projected_expenses=int(cast(Any, projected_expenses)),
                seasonal_adjustment=int(cast(Any, seasonal_adjustment)),
                breakdown={
                    "subscriptions": int(cast(Any, subscription_cost)),
                    "ious": int(cast(Any, iou_expense - iou_recovery)), # Net IOU position
                    "credit_cards": int(cast(Any, cc_total_debt)),
                    "debt_shares": int(cast(Any, debt_recovery)),
                    "seasonal": int(cast(Any, seasonal_adjustment)),
                },
            )
        except Exception as e:
            logger.exception("[CashFlowService] Error calculating projection")  # pragma: no cover
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
