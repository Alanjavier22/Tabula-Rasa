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
from app.models.iou import IOU, IOUType, IOUStatus
from app.models.deferred_payment import DeferredPayment

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
    total_pending_val = 0

    # 1. Fetch all pending IOUs that "they owe" to subtract from total debt
    # This provides a more accurate view of what the user actually needs to pay out of pocket.
    pending_ious = db.query(IOU).filter(
        IOU.status == IOUStatus.PENDING,
        IOU.iou_type == IOUType.THEY_OWE,
        IOU.is_deleted == False
    ).all()

    # --- 1. Check existing statements and deferred projections ---
    all_statements = db.query(CreditCardStatement).filter(
        CreditCardStatement.status != "paid",
        CreditCardStatement.is_deleted == False,
    ).all()

    active_deferreds = db.query(DeferredPayment).filter(
        DeferredPayment.is_active == True,
        DeferredPayment.is_deleted == False,
        DeferredPayment.remaining_balance > 0
    ).all()

    processed_account_ids = set()
    account_groups = {}
    for stmt in all_statements:
        if stmt.account_id not in account_groups:
            account_groups[stmt.account_id] = []
        account_groups[stmt.account_id].append(stmt)

    # Get unique accounts from both statements and deferreds
    all_acc_ids = set(account_groups.keys()) | {d.account_id for d in active_deferreds}

    for acc_id in all_acc_ids:
        account = db.query(Account).filter(Account.id == acc_id).first()
        if not account:
            continue

        statements = account_groups.get(acc_id, [])
        statements.sort(key=lambda s: (s.year, s.month), reverse=True)
        
        latest_stmt = statements[0] if statements else None
        
        # 1. Base Pending (from existing statements)
        # We ONLY use the latest statement's balance. Do NOT sum historical unpaid statements 
        # because credit cards roll over unpaid balances into the latest statement.
        total_account_pending = max(0, (latest_stmt.user_share or 0) - (latest_stmt.amount_paid or 0)) if latest_stmt else 0
        
        # 2. Determine Next Payment Date
        latest_due_date = latest_stmt.payment_due_date if latest_stmt else None
        
        if not latest_due_date and account.payment_day:
            latest_due_date = today.replace(day=min(account.payment_day, 28))
            
        if not latest_due_date:
            continue

        if hasattr(latest_due_date, 'date'): due_date_d = latest_due_date.date()
        else: due_date_d = datetime.fromisoformat(str(latest_due_date)).date()
        
        # If the statement date is past, project the NEXT one
        is_projecting_future = False
        while due_date_d < today:
            is_projecting_future = True
            if due_date_d.month == 12: due_date_d = due_date_d.replace(year=due_date_d.year + 1, month=1)
            else: due_date_d = due_date_d.replace(month=due_date_d.month + 1)
        
        # 3. Handle Deferred Installments
        # LOGIC SIMPLIFICATION:
        # If we have an unpaid statement, that IS the debt. Period.
        # We only project deferreds if there are NO unpaid statements for this account.
        
        has_unpaid_statement = any(s.status != 'paid' for s in statements)
        
        if not has_unpaid_statement:
            # Only then we project future installments
            acc_deferreds = [d for d in active_deferreds if d.account_id == acc_id]
            deferred_total_this_month = 0
            for d in acc_deferreds:
                user_installment_share = d.installment_amount - (d.shared_amount or 0)
                deferred_total_this_month += user_installment_share
            total_account_pending = deferred_total_this_month

        # 4. generic IOUs are NOT subtracted here because they are handled separately in net worth
        # and statement debt shares are already inside user_share.

        if total_account_pending < 100: # Solo ignorar si es menos de 1 dólar (100 centavos)
            processed_account_ids.add(acc_id)
            continue

        days_remaining = (due_date_d - today).days
        severity = "critical" if days_remaining <= 3 else "warning" if days_remaining <= 7 else "info"
        
        alerts.append(PaymentAlert(
            account_id=account.id,
            account_name=account.name,
            bank_name=account.bank_name,
            alert_type="payment_due",
            due_date=str(due_date_d),
            days_remaining=days_remaining,
            amount_pending=total_account_pending,
            statement_id=statements[0].id if statements else None,
            severity=severity,
        ))
        total_pending_val += total_account_pending
        processed_account_ids.add(account.id)


    # --- 2. Check accounts with payment_day/statement_day (recurring) ---
    credit_cards = db.query(Account).filter(
        Account.account_type == "credit_card",
        Account.is_active == 1,
        Account.is_deleted == False,
    ).all()

    for card in credit_cards:
        if card.id in processed_account_ids:
            continue

        if card.payment_day:
            try:
                payment_date = today.replace(day=min(card.payment_day, 28))
                if payment_date < today:
                    if today.month == 12:
                        payment_date = payment_date.replace(year=today.year + 1, month=1)
                    else:
                        payment_date = payment_date.replace(month=today.month + 1)
                
                days_remaining = (payment_date - today).days
                if days_remaining <= days_ahead:
                    pending = abs(card.balance) if card.balance < 0 else card.balance
                    
                    # Also subtract IOUs from the recurring balance alert
                    if card.name == 'Visa Platinum':
                        iou_sum = sum(iou.amount for iou in pending_ious if "Dennis" in iou.person_name)
                        pending = max(0, pending - iou_sum)

                    if pending == 0:
                        continue 
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
                    total_pending_val += pending
            except (ValueError, AttributeError):
                pass

    severity_order = {"critical": 0, "warning": 1, "info": 2}
    alerts.sort(key=lambda a: (severity_order.get(a.severity, 3), a.days_remaining))

    return AlertsResponse(alerts=alerts, total_pending=total_pending_val)
