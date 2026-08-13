"""
Métricas de flujo de caja hacia adelante: safe-to-spend, forecast diario,
proyección/simulación a 12 meses y proyección de cash flow a 30/60/90 días.
Se monta bajo /metrics vía api/metrics.py.
"""
from typing import Any, cast
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, timedelta
from decimal import Decimal
import calendar
import logging
from database import get_db
from app.models.account import Account
from app.models.config import Config
from app.models.reminder import Reminder
from app.models.credit_card_statement import CreditCardStatement
from app.models.subscription import Subscription
from app.services.anomaly_detector import calculate_anomaly_leak_total
from app.services.forecaster import get_financial_projection
from app.services.cash_flow import cash_flow_service

router = APIRouter()

logger = logging.getLogger(__name__)


class SafeToSpendResponse(BaseModel):
    safe_to_spend: Decimal
    monthly_income: Decimal
    current_balance: Decimal
    projected_fixed_expenses: Decimal
    actual_expenses: Decimal
    pending_cc_payments: Decimal
    pending_debt_shares: Decimal
    safe_to_spend_buffer: Decimal
    anomaly_leaks: Decimal
    projected_taxes: Decimal
    breakdown: dict


@router.get("/safe-to-spend", response_model=SafeToSpendResponse)
def get_safe_to_spend(db: Session = Depends(get_db)):
    """
    Get safe-to-spend metric using the unified CashFlowService.
    Ensures consistency across all dashboard components.
    """
    try:
        # We use a 30-day horizon for the main dashboard metric
        projection = cash_flow_service.get_projected_balance(db, 30)

        # Get additional metrics for the response model
        anomaly_leaks = Decimal(str(calculate_anomaly_leak_total(db)))
        buffer_config = db.query(Config).filter(Config.key == 'safe_to_spend_buffer').first()
        # Buffer config is stored as dollars in the UI, convert to cents for math
        buffer_val = float(cast(Any, buffer_config.value)) if buffer_config and buffer_config.value else 0
        safe_to_spend_buffer = Decimal(str(int(buffer_val * 100)))

        # Get fiscal burden (IVA/Retenciones)
        try:
            from app.services.ai_assistant_tools import get_fiscal_summary
            fiscal = get_fiscal_summary(db)
            projected_taxes = Decimal(str(fiscal["iva_projected"] + fiscal["retencion_projected"]))
        except Exception as e:
            logger.warning("Error calculating projected taxes, defaulting to 0: %s", e)
            projected_taxes = Decimal("0")

        # We subtract anomaly_leaks AND projected taxes AND the safety buffer from the projected balance for maximum prudence
        safe_to_spend = Decimal(str(projection.projected_balance)) - anomaly_leaks - projected_taxes - safe_to_spend_buffer

        return SafeToSpendResponse(
            safe_to_spend=safe_to_spend,
            monthly_income=Decimal(str(projection.projected_income)),
            current_balance=Decimal(str(projection.current_balance)),
            projected_fixed_expenses=Decimal(str(projection.projected_expenses)),
            actual_expenses=Decimal(str(0)), # This would need a separate query if needed, but safe_to_spend is the focus
            pending_cc_payments=Decimal(str(projection.breakdown.get("credit_cards", 0))),
            pending_debt_shares=Decimal(str(projection.breakdown.get("debt_shares", 0))),
            safe_to_spend_buffer=safe_to_spend_buffer,
            anomaly_leaks=anomaly_leaks,
            projected_taxes=projected_taxes,
            breakdown=projection.breakdown
        )
    except Exception as e:
        logger.exception("Error calculating safe-to-spend: %s", e)
        raise HTTPException(status_code=500, detail=f"Error calculating safe-to-spend: {str(e)}")


class CashFlowForecastResponse(BaseModel):
    forecast: list[dict]
    current_balance: int
    has_negative_balance: bool


@router.get("/cash-flow-forecast", response_model=CashFlowForecastResponse)
def get_cash_flow_forecast(days: int = 30, db: Session = Depends(get_db)):
    if days < 1:
        days = 30
    if days > 365:
        days = 365

    now = datetime.now()
    today = now.date()

    accounts = db.query(Account).filter(
        Account.is_active == 1,
        Account.is_deleted == False,
        Account.account_type.in_(["checking", "savings"])
    ).all()
    current_balance = Decimal(str(sum((acc.balance for acc in accounts), 0)))

    # Use today's beginning to include today's reminders
    start_time = datetime.combine(today, datetime.min.time())
    end_time = datetime.combine(today + timedelta(days=days), datetime.max.time())

    reminders = db.query(Reminder).filter(
        Reminder.status == "pending",
        Reminder.due_date >= start_time,
        Reminder.due_date <= end_time
    ).all()

    statements = db.query(CreditCardStatement).filter(
        CreditCardStatement.status.in_(["pending", "partial"]),
        CreditCardStatement.payment_due_date >= start_time,
        CreditCardStatement.payment_due_date <= end_time
    ).all()

    # Fetch active subscriptions
    subscriptions = db.query(Subscription).filter(
        Subscription.is_active == True,
        Subscription.is_deleted == False
    ).all()

    # Map active subscription occurrences to dates in the forecast window
    daily_subscriptions = {}
    start_proj = today + timedelta(days=1)
    end_proj = today + timedelta(days=days)

    for sub in subscriptions:
        if not sub.next_billing_date or not sub.amount:
            continue

        curr_billing = sub.next_billing_date.date()
        freq = sub.frequency
        if hasattr(freq, "value"):
            freq = freq.value
        freq = str(freq).lower()

        # Iterate forward to find occurrences in the projection window
        limit = 0
        while curr_billing <= end_proj and limit < 100:
            limit += 1
            if curr_billing >= start_proj:
                daily_subscriptions[curr_billing] = daily_subscriptions.get(curr_billing, Decimal("0")) + Decimal(str(sub.amount))

            # Increment based on frequency
            if freq == "weekly":
                curr_billing += timedelta(days=7)
            elif freq == "monthly":
                m = curr_billing.month - 1 + 1
                y = curr_billing.year + m // 12
                m = m % 12 + 1
                d = min(curr_billing.day, calendar.monthrange(y, m)[1])
                curr_billing = curr_billing.replace(year=y, month=m, day=d)
            elif freq == "quarterly":
                m = curr_billing.month - 1 + 3
                y = curr_billing.year + m // 12
                m = m % 12 + 1
                d = min(curr_billing.day, calendar.monthrange(y, m)[1])
                curr_billing = curr_billing.replace(year=y, month=m, day=d)
            elif freq == "yearly":
                try:
                    curr_billing = curr_billing.replace(year=curr_billing.year + 1)
                except ValueError:
                    curr_billing = curr_billing.replace(year=curr_billing.year + 1, day=curr_billing.day - 1)
            else:
                curr_billing += timedelta(days=30)

    forecast = []
    projected_balance = current_balance

    # Include today as day 0 baseline
    forecast.append({
        "date": today.strftime("%Y-%m-%d"),
        "projected_balance": projected_balance
    })

    for day_offset in range(1, days + 1):
        forecast_date = today + timedelta(days=day_offset)
        forecast_date_str = forecast_date.strftime("%Y-%m-%d")

        daily_income = Decimal(str(sum(
            (r.amount for r in reminders
             if r.due_date.date() == forecast_date and r.amount and r.amount > 0),
            0
        )))

        # Take absolute value of negative reminders to avoid double negation
        daily_expense = Decimal(str(sum(
            (abs(cast(int, r.amount)) for r in reminders
             if r.due_date.date() == forecast_date and r.amount and r.amount < 0),
            0
        )))

        daily_sub = daily_subscriptions.get(forecast_date, Decimal("0"))

        daily_cc_payment = Decimal(str(sum(
            (s.user_share - s.amount_paid for s in statements
             if s.payment_due_date and s.payment_due_date.date() == forecast_date),
            0
        )))

        projected_balance += daily_income - daily_expense - daily_sub - daily_cc_payment

        forecast.append({
            "date": forecast_date_str,
            "projected_balance": projected_balance
        })

    has_negative_balance = any(float(cast(Any, f["projected_balance"])) < 0 for f in forecast)

    return CashFlowForecastResponse(
        forecast=forecast,
        current_balance=current_balance,
        has_negative_balance=has_negative_balance
    )


class ProjectionResponse(BaseModel):
    current_liquidity: int
    average_monthly_income: int
    average_monthly_expense: int
    runway_months: float
    timeline: list[dict]


@router.get("/projection", response_model=ProjectionResponse)
def get_projection(db: Session = Depends(get_db)):
    try:
        return get_financial_projection(db=db, months=12)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating projection: {str(e)}")


class SimulationRequest(BaseModel):
    extra_savings_per_month: int = 0
    one_time_expense: int = 0
    one_time_expense_month_offset: int = 1


@router.post("/simulate", response_model=ProjectionResponse)
def simulate_projection(req: SimulationRequest, db: Session = Depends(get_db)):
    try:
        return get_financial_projection(
            db=db,
            months=12,
            extra_savings_per_month=req.extra_savings_per_month,
            one_time_expense=req.one_time_expense,
            one_time_expense_month_offset=req.one_time_expense_month_offset
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error in simulation: {str(e)}")


class CashFlowProjectionResponse(BaseModel):
    day30: dict
    day60: dict
    day90: dict


@router.get("/cash-flow-projection", response_model=CashFlowProjectionResponse)
def get_cash_flow_projection(db: Session = Depends(get_db)):
    """Get cash flow projection for 30, 60, and 90 days"""
    try:
        forecast = cash_flow_service.get_cash_flow_forecast(db)
        return CashFlowProjectionResponse(**forecast)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting cash flow projection: {str(e)}")


@router.get("/cash-flow-projection/{days}")
def get_cash_flow_projection_days(days: int, db: Session = Depends(get_db)):
    """Get cash flow projection for specific number of days"""
    try:
        projection = cash_flow_service.get_projected_balance(db, days)
        return projection.to_dict()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting cash flow projection: {str(e)}")
