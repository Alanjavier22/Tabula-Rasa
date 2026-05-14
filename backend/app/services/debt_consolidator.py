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

    def get_account_debt_status(self, account_id: str) -> Dict:
        """
        Calculates the definitive debt for an account.
        Logic: (Latest Unpaid Statement Balance) OR (Projected Deferreds) - (Recent Payments after statement)
        """
        account = self.db.query(Account).filter(Account.id == account_id).first()
        if not account or account.account_type != "credit_card":
            return {"total_debt": 0, "breakdown": {}}

        today = datetime.now().date()
        
        # 1. Get Unpaid Statements
        unpaid_statements = self.db.query(CreditCardStatement).filter(
            CreditCardStatement.account_id == account_id,
            CreditCardStatement.status != StatementStatus.PAID,
            CreditCardStatement.is_deleted == False
        ).order_by(CreditCardStatement.year.desc(), CreditCardStatement.month.desc()).all()

        latest_stmt = unpaid_statements[0] if unpaid_statements else None
        
        # Base debt from the latest statement
        statement_debt = 0
        if latest_stmt:
            statement_debt = max(0, (latest_stmt.user_share or 0) - (latest_stmt.amount_paid or 0))

        # 2. Handle Deferred Installments
        # If there's an unpaid statement, deferreds are ALREADY inside it.
        # If no unpaid statement, we project the NEXT month's installments.
        projected_deferreds = 0
        if not latest_stmt:
            active_deferreds = self.db.query(DeferredPayment).filter(
                DeferredPayment.account_id == account_id,
                DeferredPayment.is_active == True,
                DeferredPayment.remaining_balance > 0
            ).all()
            
            for d in active_deferreds:
                projected_deferreds += (d.installment_amount - (d.shared_amount or 0))

        # 3. Determine Due Date
        due_date = None
        if latest_stmt and latest_stmt.payment_due_date:
            due_date = str(latest_stmt.payment_due_date)
        elif account.payment_day:
            # Project next payment day
            try:
                p_date = today.replace(day=min(account.payment_day, 28))
                if p_date < today:
                    if today.month == 12: p_date = p_date.replace(year=today.year + 1, month=1)
                    else: p_date = p_date.replace(month=today.month + 1)
                due_date = str(p_date)
            except Exception: pass

        total_debt = statement_debt + projected_deferreds
        
        return {
            "account_id": account_id,
            "account_name": account.name,
            "total_debt": total_debt,
            "statement_debt": statement_debt,
            "projected_deferreds": projected_deferreds,
            "latest_statement": {
                "id": latest_stmt.id if latest_stmt else None,
                "month": latest_stmt.month if latest_stmt else None,
                "year": latest_stmt.year if latest_stmt else None,
                "due_date": due_date
            } if (latest_stmt or due_date) else None
        }

    def get_all_debts(self) -> List[Dict]:
        accounts = self.db.query(Account).filter(
            Account.account_type == "credit_card",
            Account.is_active == True
        ).all()
        
        return [self.get_account_debt_status(str(acc.id)) for acc in accounts]
