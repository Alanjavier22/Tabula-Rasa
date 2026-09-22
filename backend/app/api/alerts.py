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


def _build_payment_alert(status: dict, today) -> Optional[PaymentAlert]:
    amount_pending = status["total_debt"]
    if amount_pending < 100:
        return None

    latest_statement = status["latest_statement"]
    due_date_str = latest_statement["due_date"] if latest_statement else None
    due_date_d = None
    if due_date_str:
        due_date_dt = parse_date_robustly(due_date_str)
        due_date_d = due_date_dt.date() if due_date_dt else None
    days_remaining = (due_date_d - today).days if due_date_d else 30
    severity = "info"
    if days_remaining <= 3:
        severity = "critical"
    elif days_remaining <= 7:
        severity = "warning"
    return PaymentAlert(
        account_id=status["account_id"],
        account_name=status["account_name"],
        bank_name=None,
        alert_type="payment_due",
        due_date=str(due_date_d) if due_date_d else "Sin fecha",
        days_remaining=days_remaining,
        amount_pending=amount_pending,
        statement_id=latest_statement["id"] if latest_statement else None,
        severity=severity,
    )


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
        alert = _build_payment_alert(status, today)
        if not alert:
            continue
        alerts.append(alert)
        total_pending_val += alert.amount_pending

    # Sort alerts: Critical first, then by days remaining
    severity_order = {"critical": 0, "warning": 1, "info": 2}
    alerts.sort(key=lambda a: (severity_order.get(a.severity, 3), a.days_remaining))

    return AlertsResponse(alerts=alerts, total_pending=total_pending_val)
