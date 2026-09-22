from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, date
from typing import List, Dict, Optional
from app.models.account import Account
from app.models.credit_card_statement import CreditCardStatement, StatementStatus
from app.models.deferred_payment import DeferredPayment
from app.models.transaction import Transaction, TransactionType

class DebtConsolidatorService:
    """
    Service to provide a single, unified source of truth for credit card debt.
    It combines statements, projected deferred installments, and recent payments.
    """
    def __init__(self, db: Session):
        self.db = db

    def _get_statement_debt(self, statements: list[CreditCardStatement]) -> tuple[Optional[CreditCardStatement], int]:
        latest_statement = statements[0] if statements else None
        if not latest_statement:
            return None, 0
        debt = max(0, (latest_statement.user_share or 0) - (latest_statement.amount_paid or 0))
        return latest_statement, debt

    def _get_projected_deferreds(self, account_id: str, latest_statement: Optional[CreditCardStatement]) -> int:
        if latest_statement:
            return 0
        active_deferreds = self.db.query(DeferredPayment).filter(
            DeferredPayment.account_id == account_id,
            DeferredPayment.is_active == True,
            DeferredPayment.remaining_balance > 0,
        ).all()
        return sum(
            installment.installment_amount - (installment.shared_amount or 0)
            for installment in active_deferreds
        )

    @staticmethod
    def _get_due_date(account: Account, latest_statement: Optional[CreditCardStatement], today: date) -> Optional[str]:
        if latest_statement and latest_statement.payment_due_date:
            return str(latest_statement.payment_due_date)
        if not account.payment_day:
            return None
        try:
            payment_date = today.replace(day=min(account.payment_day, 28))
            if payment_date < today:
                if today.month == 12:
                    payment_date = payment_date.replace(year=today.year + 1, month=1)
                else:
                    payment_date = payment_date.replace(month=today.month + 1)
            return str(payment_date)
        except Exception:
            return None

    def get_account_debt_status(self, account_id: str) -> Dict:
        """
        Calculates the definitive debt for an account.
        Logic: (Latest Unpaid Statement Balance) OR (Projected Deferreds) - (Recent Payments after statement)
        """
        account = self.db.query(Account).filter(Account.id == account_id).first()
        if not account or account.account_type != "credit_card":
            return {"total_debt": 0, "breakdown": {}}

        today = datetime.now().date()
        
        unpaid_statements = self.db.query(CreditCardStatement).filter(
            CreditCardStatement.account_id == account_id,
            CreditCardStatement.status != StatementStatus.PAID,
            CreditCardStatement.is_deleted == False
        ).order_by(CreditCardStatement.year.desc(), CreditCardStatement.month.desc()).all()

        latest_stmt, statement_debt = self._get_statement_debt(unpaid_statements)
        projected_deferreds = self._get_projected_deferreds(account_id, latest_stmt)
        due_date = self._get_due_date(account, latest_stmt, today)

        total_debt = statement_debt + projected_deferreds
        latest_statement = None
        if latest_stmt or due_date:
            latest_statement = {
                "id": latest_stmt.id if latest_stmt else None,
                "month": latest_stmt.month if latest_stmt else None,
                "year": latest_stmt.year if latest_stmt else None,
                "due_date": due_date,
            }
        
        return {
            "account_id": account_id,
            "account_name": account.name,
            "total_debt": total_debt,
            "statement_debt": statement_debt,
            "projected_deferreds": projected_deferreds,
            "latest_statement": latest_statement
        }

    def get_all_debts(self) -> List[Dict]:
        accounts = self.db.query(Account).filter(
            Account.account_type == "credit_card",
            Account.is_active == True
        ).all()
        
        return [self.get_account_debt_status(str(acc.id)) for acc in accounts]
