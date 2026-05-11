"""
Alerts API: Payment due date reminders and upcoming deadlines for credit cards.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta
from database import get_db
from app.api.auth import get_current_device
from app.models.account import Account
from app.models.credit_card_statement import CreditCardStatement

router = APIRouter(
    prefix="/alerts", 
    tags=["alerts"], 
    dependencies=[Depends(get_current_device)],
    redirect_slashes=False
)


class PaymentAlert(BaseModel):
    account_id: str
    account_name: str
    bank_name: Optional[str] = None
    alert_type: str  # "payment_due", "statement_cut", "overdue"
    due_date: Optional[str] = None
    days_remaining: int
    amount_pending: int  # cents
    statement_id: Optional[str] = None
    severity: str  # "info", "warning", "critical"


class AlertsResponse(BaseModel):
    alerts: List[PaymentAlert]
    total_pending: int  # total cents pending across all cards


@router.get("/payment-reminders", response_model=AlertsResponse)
def get_payment_reminders(days_ahead: int = 15, db: Session = Depends(get_db)):
    """
    Get upcoming payment due dates and statement cut-off alerts.
    
    Checks both:
    1. CreditCardStatement payment_due_date (specific statements)
    2. Account payment_day/statement_day (recurring monthly dates)
    """
    now = datetime.now()
    today = now.date()
    alerts: List[PaymentAlert] = []
    total_pending = 0

    # --- 1. Check existing statements with upcoming payment_due_date ---
    upcoming_statements = db.query(CreditCardStatement).filter(
        CreditCardStatement.status != "paid",
        CreditCardStatement.is_deleted == False,
    ).all()

    processed_account_ids = set()

    for stmt in upcoming_statements:
        account = db.query(Account).filter(Account.id == stmt.account_id).first()
        if not account:
            continue

        pending_amount = max(0, (stmt.user_share or 0) - (stmt.amount_paid or 0))
        
        if stmt.payment_due_date:
            due_date = stmt.payment_due_date
            if hasattr(due_date, 'date'):
                due_date_d = due_date.date()
            else:
                due_date_d = datetime.fromisoformat(str(due_date)).date()
            
            days_remaining = (due_date_d - today).days

            # Overdue
            if days_remaining < 0 and pending_amount > 0:
                alerts.append(PaymentAlert(
                    account_id=account.id,
                    account_name=account.name,
                    bank_name=account.bank_name,
                    alert_type="overdue",
                    due_date=str(due_date_d),
                    days_remaining=days_remaining,
                    amount_pending=pending_amount,
                    statement_id=stmt.id,
                    severity="critical",
                ))
                total_pending += pending_amount
                processed_account_ids.add(account.id)

            # Upcoming within days_ahead
            elif 0 <= days_remaining <= days_ahead and pending_amount > 0:
                severity = "critical" if days_remaining <= 3 else "warning" if days_remaining <= 7 else "info"
                alerts.append(PaymentAlert(
                    account_id=account.id,
                    account_name=account.name,
                    bank_name=account.bank_name,
                    alert_type="payment_due",
                    due_date=str(due_date_d),
                    days_remaining=days_remaining,
                    amount_pending=pending_amount,
                    statement_id=stmt.id,
                    severity=severity,
                ))
                total_pending += pending_amount
                processed_account_ids.add(account.id)

        # (Statement cut-off date logic removed per user request)

    # --- 2. Check accounts with payment_day/statement_day (recurring) ---
    credit_cards = db.query(Account).filter(
        Account.account_type == "credit_card",
        Account.is_active == 1,
        Account.is_deleted == False,
    ).all()

    for card in credit_cards:
        if card.id in processed_account_ids:
            continue

        # Generate upcoming payment date from payment_day
        if card.payment_day:
            try:
                # Calculate next payment date
                payment_date = today.replace(day=min(card.payment_day, 28))
                if payment_date < today:
                    # Move to next month
                    if today.month == 12:
                        payment_date = payment_date.replace(year=today.year + 1, month=1)
                    else:
                        payment_date = payment_date.replace(month=today.month + 1)
                
                days_remaining = (payment_date - today).days
                if days_remaining <= days_ahead:
                    # Use account balance as pending amount (approximate)
                    pending = abs(card.balance) if card.balance < 0 else card.balance
                    if pending == 0:
                        continue  # No alertar si no hay saldo pendiente
                    severity = "critical" if days_remaining <= 3 else "warning" if days_remaining <= 7 else "info"
                    alerts.append(PaymentAlert(
                        account_id=card.id,
                        account_name=card.name,
                        bank_name=card.bank_name,
                        alert_type="payment_due",
                        due_date=str(payment_date),
                        days_remaining=days_remaining,
                        amount_pending=pending,
                        severity=severity,
                    ))
                    total_pending += pending
            except (ValueError, AttributeError):
                pass

        # (Recurring statement cut date logic removed per user request)

    # Sort: critical first, then by days_remaining
    severity_order = {"critical": 0, "warning": 1, "info": 2}
    alerts.sort(key=lambda a: (severity_order.get(a.severity, 3), a.days_remaining))

    return AlertsResponse(alerts=alerts, total_pending=total_pending)
