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
from app.utils.date_parser import parse_date_robustly

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


from app.services.debt_consolidator import DebtConsolidatorService

@router.get("/payment-reminders", response_model=AlertsResponse)
def get_payment_reminders(days_ahead: int = 15, db: Session = Depends(get_db)):
    """
    Get upcoming payment due dates using the unified DebtConsolidatorService.
    """
    consolidator = DebtConsolidatorService(db)
    debt_statuses = consolidator.get_all_debts()
    
    today = datetime.now().date()
    alerts: List[PaymentAlert] = []
    total_pending_val = 0

    for status in debt_statuses:
        amount_pending = status["total_debt"]
        if amount_pending < 100: # Ignore if less than $1
            continue

        # Determine due date and severity
        due_date_str = status["latest_statement"]["due_date"] if status["latest_statement"] else None
        
        if due_date_str:
            due_date_dt = parse_date_robustly(due_date_str)
            due_date_d = due_date_dt.date() if due_date_dt else None
            if due_date_d:
                days_remaining = (due_date_d - today).days
            else:
                days_remaining = 30
        else:
            # If no statement, we don't have a specific due date yet, 
            # but we show it as a general reminder if there's debt.
            days_remaining = 30 # Default for non-dated debt
            due_date_d = None

        severity = "info"
        if days_remaining <= 3: severity = "critical"
        elif days_remaining <= 7: severity = "warning"

        alerts.append(PaymentAlert(
            account_id=status["account_id"],
            account_name=status["account_name"],
            bank_name=None, # Optional
            alert_type="payment_due",
            due_date=str(due_date_d) if due_date_d else "Sin fecha",
            days_remaining=days_remaining,
            amount_pending=amount_pending,
            statement_id=status["latest_statement"]["id"] if status["latest_statement"] else None,
            severity=severity
        ))
        total_pending_val += amount_pending

    # Sort alerts: Critical first, then by days remaining
    severity_order = {"critical": 0, "warning": 1, "info": 2}
    alerts.sort(key=lambda a: (severity_order.get(a.severity, 3), a.days_remaining))

    return AlertsResponse(alerts=alerts, total_pending=total_pending_val)
