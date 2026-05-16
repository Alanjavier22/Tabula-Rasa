"""
Cash Flow Service - Balance Projection Engine
Projects future balance using subscriptions, IOUs, and seasonal adjustments
Operates on aggregates only (fast, no 50k transaction scans)
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, Any, cast
import statistics
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
                return int(cast(Any, sum(t.amount for t in month_income)))

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
            return int(cast(Any, total_income // 3))
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

            # 2. Projected income (Intelligence: Recurrence-based analysis)
            # We look at 180 days to identify STABLE recurring income sources.
            from app.models.category import Category
            from collections import defaultdict
            
            lookback_days = 180
            history_start = now - timedelta(days=lookback_days)
            
            # Subquery to get IDs of categories to ignore
            ignored_categories = db.query(Category.id).filter(
                (Category.name.ilike("%Transferencia%")) | 
                (Category.name.ilike("%Devolucion%")) | 
                (Category.name.ilike("%Ajuste%")) |
                (Category.name.ilike("%Meta%"))
            ).all()
            ignored_ids = [c[0] for c in ignored_categories]

            income_txns_query = (
                db.query(Transaction)
                .filter(Transaction.is_deleted == False)
                .filter(Transaction.is_internal == False) # Ignore CC payments/transfers
                .filter(Transaction.transaction_type == "income")
                .filter(Transaction.date >= history_start)
            )
            
            if ignored_ids:
                income_txns_query = income_txns_query.filter(Transaction.category_id.not_in(ignored_ids))
            
            all_income = income_txns_query.all()
            
            # Group by normalized description to find recurring sources
            sources = defaultdict(list)
            blacklist = ["DENNIS", "DANIEL", "META", "TRANSFERENCIA", "PAGO EN OFIC", "MUCHAS GRACIAS", "TRANSF. DEUDA", "SU PAGO", "ABONO"]
            
            for t in all_income:
                desc = (t.description or "").upper().strip()
                if any(k in desc for k in blacklist):
                    continue
                sources[desc].append(t)
            
            total_recurring_monthly = 0
            for desc, txns in sources.items():
                # Count distinct months this source appeared in
                months_present = set(t.date.strftime("%Y-%m") for t in txns)
                num_months = len(months_present)
                
                # RULE 1: Must be present in at least 2 distinct months in lookback window to be a monthly recurring income
                if num_months < 2:
                    continue
                
                # --- UNIVERSAL SCORING ENGINE ---
                # We look for the "mathematical signature" of a salary/recurring income
                score = 0
                
                # Semantic Shortcut for verified Salaries and Wages (Ecuador/LATAM-aware)
                salary_keywords = ["SUELDO", "NOMINA", "PAYROLL", "SALARY", "HONORARIOS", "VIAMATICA", "PAGO DIRECTO"]
                has_salary_keyword = any(k in desc for k in salary_keywords)
                
                if has_salary_keyword and num_months >= 2:
                    # Verified paycheck: bypass strict volatility checks to allow biweekly/variable amounts
                    score = 100
                else:
                    # 1. Recurrence Score (Max 40 points)
                    presence_ratio = num_months / (lookback_days / 30)
                    score += min(40, presence_ratio * 40)
                    
                    # 2. Temporal Consistency (Max 30 points)
                    # Does it happen on the same days each month? Allow slightly wider window for standard transactions
                    if len(txns) >= 2:
                        days_of_month = [t.date.day for t in txns]
                        try:
                            std_dev_days = statistics.stdev(days_of_month)
                            if std_dev_days < 5: score += 30     # Highly consistent
                            elif std_dev_days < 10: score += 15   # Moderately consistent
                        except statistics.StatisticsError: pass
                    
                    # 3. Amount Stability (Max 20 points)
                    # Allow up to 20% standard deviation variance for standard bills/invoices
                    amounts = [float(t.amount) for t in txns]
                    if len(amounts) >= 2:
                        avg_amt = sum(amounts) / len(amounts)
                        try:
                            std_dev_amt = statistics.stdev(amounts)
                            variation_coeff = std_dev_amt / avg_amt if avg_amt > 0 else 1
                            if variation_coeff < 0.2: score += 20   # Very stable
                            elif variation_coeff < 0.4: score += 10 # Stable
                        except statistics.StatisticsError: pass
                    
                    # 4. Semantic Bonus (Max 10 points)
                    # No keywords matched above, keep as 0

                # --- DECISION ENGINE ---
                if score >= 45:
                    total_source_amount = sum(t.amount for t in txns)
                    expected_monthly = total_source_amount / (lookback_days / 30)
                    
                    # Trust factor based on score (Score 45-100 -> 0.6-0.95 safety)
                    safety = 0.6 + ((score - 45) / 55) * 0.35
                    total_recurring_monthly += (expected_monthly * safety)

            projected_income = round((total_recurring_monthly / 30) * days)

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
