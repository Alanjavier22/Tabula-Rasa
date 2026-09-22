"""
Métricas de flujo de caja hacia adelante: safe-to-spend, forecast diario,
proyección/simulación a 12 meses y proyección de cash flow a 30/60/90 días.
Se monta bajo /metrics vía api/metrics.py.
"""
from typing import Any, cast
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import date, datetime, timedelta
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
CASHFLOW_ERROR_RESPONSES = {
    500: {"description": "Cash flow calculation failed."},
}

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


@router.get("/safe-to-spend", response_model=SafeToSpendResponse, responses=CASHFLOW_ERROR_RESPONSES)
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


def _normalize_forecast_days(days: int) -> int:
    return 30 if days < 1 else min(days, 365)


def _advance_billing_date(current: date, frequency: str) -> date:
    if frequency == "weekly":
        return current + timedelta(days=7)
    if frequency in {"monthly", "quarterly"}:
        months = 1 if frequency == "monthly" else 3
        month_index = current.month - 1 + months
        year = current.year + month_index // 12
        month = month_index % 12 + 1
        day = min(current.day, calendar.monthrange(year, month)[1])
        return current.replace(year=year, month=month, day=day)
    if frequency == "yearly":
        try:
            return current.replace(year=current.year + 1)
        except ValueError:
            return current.replace(year=current.year + 1, day=current.day - 1)
    return current + timedelta(days=30)


def _build_daily_subscriptions(subscriptions: list[Subscription], today, days: int) -> dict:
    daily_subscriptions = {}
    start_projection = today + timedelta(days=1)
    end_projection = today + timedelta(days=days)
    for subscription in subscriptions:
        if not subscription.next_billing_date or not subscription.amount:
            continue
        billing_date = subscription.next_billing_date.date()
        frequency = subscription.frequency
        frequency = frequency.value if hasattr(frequency, "value") else frequency
        frequency = str(frequency).lower()
        limit = 0
        while billing_date <= end_projection and limit < 100:
            limit += 1
            if billing_date >= start_projection:
                daily_subscriptions[billing_date] = (
                    daily_subscriptions.get(billing_date, Decimal("0"))
                    + Decimal(str(subscription.amount))
                )
            billing_date = _advance_billing_date(billing_date, frequency)
    return daily_subscriptions


def _get_daily_forecast_amounts(reminders, statements, forecast_date, daily_subscriptions):
    daily_income = Decimal(str(sum(
        (reminder.amount for reminder in reminders
         if reminder.due_date.date() == forecast_date and reminder.amount and reminder.amount > 0),
        0,
    )))
    daily_expense = Decimal(str(sum(
        (abs(cast(int, reminder.amount)) for reminder in reminders
         if reminder.due_date.date() == forecast_date and reminder.amount and reminder.amount < 0),
        0,
    )))
    daily_subscription = daily_subscriptions.get(forecast_date, Decimal("0"))
    daily_cc_payment = Decimal(str(sum(
        (statement.user_share - statement.amount_paid for statement in statements
         if statement.payment_due_date and statement.payment_due_date.date() == forecast_date),
        0,
    )))
    return daily_income, daily_expense, daily_subscription, daily_cc_payment


def _build_forecast(
    today,
    days: int,
    current_balance: Decimal,
    reminders,
    statements,
    daily_subscriptions: dict,
) -> list[dict]:
    forecast = [{
        "date": today.strftime("%Y-%m-%d"),
        "projected_balance": current_balance,
    }]
    projected_balance = current_balance
    for day_offset in range(1, days + 1):
        forecast_date = today + timedelta(days=day_offset)
        daily_income, daily_expense, daily_subscription, daily_cc_payment = _get_daily_forecast_amounts(
            reminders, statements, forecast_date, daily_subscriptions
        )
        projected_balance += daily_income - daily_expense - daily_subscription - daily_cc_payment
        forecast.append({
            "date": forecast_date.strftime("%Y-%m-%d"),
            "projected_balance": projected_balance,
        })
    return forecast


@router.get("/cash-flow-forecast", response_model=CashFlowForecastResponse)
def get_cash_flow_forecast(days: int = 30, db: Session = Depends(get_db)):
    days = _normalize_forecast_days(days)

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

    daily_subscriptions = _build_daily_subscriptions(subscriptions, today, days)
    forecast = _build_forecast(
        today, days, current_balance, reminders, statements, daily_subscriptions
    )

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


@router.get("/projection", response_model=ProjectionResponse, responses=CASHFLOW_ERROR_RESPONSES)
def get_projection(db: Session = Depends(get_db)):
    try:
        return get_financial_projection(db=db, months=12)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating projection: {str(e)}")


class SimulationRequest(BaseModel):
    extra_savings_per_month: int = 0
    one_time_expense: int = 0
    one_time_expense_month_offset: int = 1


@router.post("/simulate", response_model=ProjectionResponse, responses=CASHFLOW_ERROR_RESPONSES)
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


@router.get("/cash-flow-projection", response_model=CashFlowProjectionResponse, responses=CASHFLOW_ERROR_RESPONSES)
def get_cash_flow_projection(db: Session = Depends(get_db)):
    """Get cash flow projection for 30, 60, and 90 days"""
    try:
        forecast = cash_flow_service.get_cash_flow_forecast(db)
        return CashFlowProjectionResponse(**forecast)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting cash flow projection: {str(e)}")


@router.get("/cash-flow-projection/{days}", responses=CASHFLOW_ERROR_RESPONSES)
def get_cash_flow_projection_days(days: int, db: Session = Depends(get_db)):
    """Get cash flow projection for specific number of days"""
    try:
        projection = cash_flow_service.get_projected_balance(db, days)
        return projection.to_dict()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting cash flow projection: {str(e)}")
