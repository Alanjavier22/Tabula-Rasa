from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from pydantic import BaseModel
from datetime import datetime, timedelta
import json
import calendar
from database import get_db
from app.models.account import Account
from app.models.transaction import Transaction
from app.models.budget import Budget
from app.models.category import Category
from app.models.reminder import Reminder
from app.models.credit_card_statement import CreditCardStatement
from app.models.transaction_split import TransactionSplit
from app.models.iou import IOU, IOUType, IOUStatus
from app.models.debt_share import DebtShare
from app.services.anomaly_detector import detect_anomalies, calculate_anomaly_leak_total
from app.services.forecaster import get_financial_projection
from app.services.asset_depreciation import asset_depreciation_service
from app.services.balance_sheet import balance_sheet_service
from app.services.cash_flow import cash_flow_service

router = APIRouter(prefix="/metrics", tags=["Metrics"], redirect_slashes=False)


class SafeToSpendResponse(BaseModel):
    safe_to_spend: int
    monthly_income: int
    current_balance: int
    projected_fixed_expenses: int
    actual_expenses: int
    pending_cc_payments: int
    anomaly_leaks: int
    breakdown: dict


@router.get("/safe-to-spend", response_model=SafeToSpendResponse)
def get_safe_to_spend(db: Session = Depends(get_db)):
    now = datetime.now()
    current_month = now.month
    current_year = now.year

    accounts = db.query(Account).filter(
        Account.is_active == 1,
        Account.account_type.in_(["checking", "savings", "cash"])
    ).all()
    current_balance = sum((acc.balance for acc in accounts), 0)

    # Add IOUs that others owe to the user (increases liquidity)
    they_owe_ious = db.query(IOU).filter(
        IOU.iou_type == IOUType.THEY_OWE,
        IOU.status == IOUStatus.PENDING
    ).all()
    ious_receivable = sum((i.amount for i in they_owe_ious), 0)
    current_balance += ious_receivable

    income_transactions = db.query(Transaction).filter(
        Transaction.transaction_type == "income",
        Transaction.date >= datetime(current_year, current_month, 1)
    ).all()
    monthly_income_total = 0
    for txn in income_transactions:
        if txn.splits:
            monthly_income_total += sum((s.amount for s in txn.splits), 0)
        else:
            monthly_income_total += txn.amount

    expense_transactions = db.query(Transaction).filter(
        Transaction.transaction_type == "expense",
        Transaction.date >= datetime(current_year, current_month, 1)
    ).all()
    actual_expenses_total = 0
    for txn in expense_transactions:
        if txn.splits:
            actual_expenses_total += sum((s.amount for s in txn.splits), 0)
        else:
            actual_expenses_total += txn.amount

    budgets = db.query(Budget).filter(
        Budget.month == current_month, Budget.year == current_year
    ).all()
    projected_fixed_expenses = sum((b.amount for b in budgets), 0)

    pending_statements = db.query(CreditCardStatement).filter(
        CreditCardStatement.status.in_(["pending", "partial"]),
        CreditCardStatement.payment_due_date >= now,
        CreditCardStatement.payment_due_date <= now + timedelta(days=30)
    ).all()
    pending_cc_payments = sum(
        (max(0, s.user_share - s.amount_paid) for s in pending_statements),
        0
    )

    # Subtract pending Debt Shares from credit cards (decreases liquidity)
    pending_debt_shares = db.query(DebtShare).filter(
        DebtShare.status == "pending"
    ).all()
    pending_debt_total = sum((ds.amount for ds in pending_debt_shares), 0)

    # Detect leaks from anomaly detector to penalize safe_to_spend
    anomaly_leaks = calculate_anomaly_leak_total(db)

    safe_to_spend = current_balance - projected_fixed_expenses - pending_cc_payments - pending_debt_total - anomaly_leaks

    return SafeToSpendResponse(
        safe_to_spend=safe_to_spend,
        monthly_income=monthly_income_total,
        current_balance=current_balance,
        projected_fixed_expenses=projected_fixed_expenses,
        actual_expenses=actual_expenses_total,
        pending_cc_payments=pending_cc_payments,
        anomaly_leaks=anomaly_leaks,
        breakdown={"month": current_month, "year": current_year}
    )


class NetWorthResponse(BaseModel):
    net_worth: int
    assets: int
    liabilities: int
    history: list


@router.get("/net-worth", response_model=NetWorthResponse)
def get_net_worth(db: Session = Depends(get_db)):
    assets_accounts = db.query(Account).filter(
        Account.is_active == 1,
        Account.account_type.in_(["checking", "savings", "investment"])
    ).all()
    assets = sum((acc.balance for acc in assets_accounts), 0)

    they_owe_ious = db.query(IOU).filter(
        IOU.iou_type == IOUType.THEY_OWE, IOU.status == IOUStatus.PENDING
    ).all()
    assets += sum((i.amount for i in they_owe_ious), 0)

    liabilities_accounts = db.query(Account).filter(
        Account.is_active == 1, Account.account_type == "credit_card"
    ).all()
    liabilities = sum(
        (abs(acc.balance) for acc in liabilities_accounts if acc.balance < 0),
        0
    )

    i_owe_ious = db.query(IOU).filter(
        IOU.iou_type == IOUType.I_OWE, IOU.status == IOUStatus.PENDING
    ).all()
    liabilities += sum((i.amount for i in i_owe_ious), 0)

    net_worth = assets - liabilities

    monthly_data = db.query(
        func.strftime("%Y-%m", Transaction.date).label("month"),
        func.sum(case((Transaction.transaction_type == "income", Transaction.amount), else_=0)).label("income"),
        func.sum(case((Transaction.transaction_type == "expense", Transaction.amount), else_=0)).label("expense")
    ).group_by(func.strftime("%Y-%m", Transaction.date)).order_by("month").all()

    history = []
    for row in monthly_data:
        month_income = int(row.income or 0)
        month_expense = int(row.expense or 0)

        month_txns = db.query(Transaction).filter(
            func.strftime("%Y-%m", Transaction.date) == row.month
        ).all()

        for txn in month_txns:
            if txn.splits:
                split_total = sum((s.amount for s in txn.splits), 0)
                if txn.transaction_type == "income":
                    month_income = month_income - txn.amount + split_total
                else:
                    month_expense = month_expense - txn.amount + split_total

        history.append({
            "month": row.month,
            "income": month_income,
            "expense": month_expense,
        })

    return NetWorthResponse(
        net_worth=net_worth,
        assets=assets,
        liabilities=liabilities,
        history=history
    )


class VehicleTelemetryResponse(BaseModel):
    total_distance: float
    cost_per_km: int
    total_vehicle_cost: int
    month: int
    year: int


@router.get("/vehicle-telemetry", response_model=VehicleTelemetryResponse)
def get_vehicle_telemetry(db: Session = Depends(get_db)):
    now = datetime.now()
    current_month = now.month
    current_year = now.year

    vehicle_categories = db.query(Category).filter(
        Category.name.in_(["Combustible", "Mantenimiento Vehiculo"])
    ).all()
    vehicle_category_ids = [c.id for c in vehicle_categories]

    vehicle_txns = db.query(Transaction).filter(
        Transaction.transaction_type == "expense",
        Transaction.category_id.in_(vehicle_category_ids),
        Transaction.date >= datetime(current_year, current_month, 1),
        Transaction.metadata_json.isnot(None)
    ).all()

    total_vehicle_cost = 0
    for txn in vehicle_txns:
        if txn.splits:
            total_vehicle_cost += sum(
                (s.amount for s in txn.splits if s.category_id in vehicle_category_ids),
                0
            )
        else:
            total_vehicle_cost += txn.amount

    odometer_readings = []
    for txn in vehicle_txns:
        try:
            metadata = json.loads(txn.metadata_json)
            if "odometer" in metadata:
                odometer_readings.append(metadata["odometer"])
        except (json.JSONDecodeError, TypeError):
            continue

    total_distance = max(odometer_readings) - min(odometer_readings) if len(odometer_readings) >= 2 else 0
    if total_distance > 0:
        cost_per_km = total_vehicle_cost // total_distance
    else:
        cost_per_km = 0

    return VehicleTelemetryResponse(
        total_distance=round(total_distance, 2),
        cost_per_km=cost_per_km,
        total_vehicle_cost=total_vehicle_cost,
        month=current_month,
        year=current_year
    )


class CashFlowForecastResponse(BaseModel):
    forecast: list[dict]
    current_balance: int
    has_negative_balance: bool


@router.get("/cash-flow-forecast", response_model=CashFlowForecastResponse)
def get_cash_flow_forecast(db: Session = Depends(get_db)):
    now = datetime.now()
    today = now.date()

    accounts = db.query(Account).filter(
        Account.is_active == 1,
        Account.account_type.in_(["checking", "savings"])
    ).all()
    current_balance = sum((acc.balance for acc in accounts), 0)

    reminders = db.query(Reminder).filter(
        Reminder.status == "pending",
        Reminder.due_date >= now,
        Reminder.due_date <= now + timedelta(days=30)
    ).all()

    statements = db.query(CreditCardStatement).filter(
        CreditCardStatement.status.in_(["pending", "partial"]),
        CreditCardStatement.payment_due_date >= now,
        CreditCardStatement.payment_due_date <= now + timedelta(days=30)
    ).all()

    forecast = []
    projected_balance = current_balance

    for day_offset in range(1, 31):
        forecast_date = today + timedelta(days=day_offset)
        forecast_date_str = forecast_date.strftime("%Y-%m-%d")

        daily_income = sum(
            (r.amount for r in reminders
             if r.due_date.date() == forecast_date and r.amount and r.amount > 0),
            0
        )

        daily_expense = sum(
            (r.amount for r in reminders
             if r.due_date.date() == forecast_date and r.amount and r.amount < 0),
            0
        )

        daily_cc_payment = sum(
            (s.user_share - s.amount_paid for s in statements
             if s.payment_due_date and s.payment_due_date.date() == forecast_date),
            0
        )

        projected_balance += daily_income - daily_expense - daily_cc_payment

        forecast.append({
            "date": forecast_date_str,
            "projected_balance": projected_balance
        })

    has_negative_balance = any(f["projected_balance"] < 0 for f in forecast)

    return CashFlowForecastResponse(
        forecast=forecast,
        current_balance=current_balance,
        has_negative_balance=has_negative_balance
    )


class DashboardSummaryResponse(BaseModel):
    total_income: int
    total_expenses: int
    expense_breakdown: list[dict]
    daily_spending: list[dict]
    monthly_comparison: list[dict]
    sankey_data: dict
    vehicle_cost: int
    alerts: list[dict]


@router.get("/dashboard-summary", response_model=DashboardSummaryResponse)
def get_dashboard_summary(db: Session = Depends(get_db)):
    try:
        now = datetime.now()
        current_month = now.month
        current_year = now.year
        current_month_str = f"{current_year}-{current_month:02d}"

        income_result = db.query(
            func.coalesce(func.sum(case((Transaction.transaction_type == "income", Transaction.amount), else_=0)), 0)
        ).scalar()
        total_income = int(income_result)

        expense_result = db.query(
            func.coalesce(func.sum(case((Transaction.transaction_type == "expense", Transaction.amount), else_=0)), 0)
        ).scalar()
        total_expenses = int(expense_result)

        expense_breakdown_query = db.query(
            func.substr(Transaction.description, 1, 20).label("name"),
            func.coalesce(func.sum(Transaction.amount), 0).label("value")
        ).filter(
            Transaction.transaction_type == "expense"
        ).group_by(
            func.substr(Transaction.description, 1, 20)
        ).order_by(func.sum(Transaction.amount).desc()).limit(8).all()

        expense_breakdown = [
            {"name": row.name + ("..." if len(row.name) >= 20 else ""), "value": int(row.value)}
            for row in expense_breakdown_query
        ]

        daily_spending_query = db.query(
            func.date(Transaction.date).label("date"),
            func.coalesce(func.sum(Transaction.amount), 0).label("gasto")
        ).filter(
            Transaction.transaction_type == "expense"
        ).group_by(func.date(Transaction.date)).order_by("date").all()

        daily_spending = [
            {"date": datetime.strptime(str(row.date), "%Y-%m-%d").strftime("%m-%d"), "gasto": int(row.gasto)}
            for row in daily_spending_query
        ]

        monthly_comparison_query = db.query(
            func.strftime("%Y-%m", Transaction.date).label("mes"),
            func.coalesce(func.sum(case((Transaction.transaction_type == "income", Transaction.amount), else_=0)), 0).label("Ingresos"),
            func.coalesce(func.sum(case((Transaction.transaction_type == "expense", Transaction.amount), else_=0)), 0).label("Gastos")
        ).group_by(func.strftime("%Y-%m", Transaction.date)).order_by("mes").all()

        monthly_comparison = [
            {"mes": row.mes, "Ingresos": int(row.Ingresos), "Gastos": int(row.Gastos)}
            for row in monthly_comparison_query
        ]

        # Sankey data for current month
        current_month_txns = db.query(Transaction).filter(
            func.strftime("%Y-%m", Transaction.date) == current_month_str
        ).all()

        total_income_month = 0
        expense_categories: dict[str, int] = {}

        for txn in current_month_txns:
            if txn.transaction_type == "income":
                if txn.splits:
                    total_income_month += sum((s.amount for s in txn.splits if s.amount), 0)
                else:
                    total_income_month += txn.amount if txn.amount else 0
            elif txn.transaction_type == "expense":
                cat_name = txn.category.name if txn.category else "Sin Categoría"
                if txn.splits:
                    for split in txn.splits:
                        split_cat = split.category.name if split.category else cat_name
                        expense_categories[split_cat] = expense_categories.get(split_cat, 0) + (split.amount or 0)
                else:
                    expense_categories[cat_name] = expense_categories.get(cat_name, 0) + (txn.amount or 0)

        total_expenses_month = sum(expense_categories.values(), 0)
        remaining = max(0, total_income_month - total_expenses_month)

        nodes = [{"name": "Ingresos"}]
        links = []
        node_index = 1

        if total_income_month > 0:
            for cat, amount in expense_categories.items():
                if amount > 0:
                    nodes.append({"name": cat})
                    links.append({"source": 0, "target": node_index, "value": amount})
                    node_index += 1
            if remaining > 0:
                nodes.append({"name": "Ahorro / Sobrante"})
                links.append({"source": 0, "target": node_index, "value": remaining})

        sankey_data = {"nodes": nodes, "links": links}

        # Vehicle cost
        vehicle_categories = db.query(Category).filter(
            Category.name.in_(["Combustible", "Mantenimiento Vehiculo"])
        ).all()
        vehicle_category_ids = [c.id for c in vehicle_categories]

        vehicle_cost_result = db.query(
            func.coalesce(func.sum(Transaction.amount), 0)
        ).filter(
            Transaction.transaction_type == "expense",
            Transaction.category_id.in_(vehicle_category_ids)
        ).scalar()
        vehicle_cost = int(vehicle_cost_result)
        
        alerts = detect_anomalies(db)

        return DashboardSummaryResponse(
            total_income=total_income,
            total_expenses=total_expenses,
            expense_breakdown=expense_breakdown,
            daily_spending=daily_spending,
            monthly_comparison=monthly_comparison,
            sankey_data=sankey_data,
            vehicle_cost=vehicle_cost,
            alerts=alerts
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error generating dashboard summary: {str(e)}")


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


# ============================================================================
# NEW ENDPOINTS: Asset Depreciation, Balance Sheet, Cash Flow
# ============================================================================

class AssetValueResponse(BaseModel):
    asset_id: str
    asset_name: str
    purchase_price_cents: int
    current_value_cents: int
    depreciation_accumulated_cents: int
    months_elapsed: int
    is_fully_depreciated: bool


@router.get("/assets/{asset_id}/value", response_model=AssetValueResponse)
def get_asset_value(asset_id: str, db: Session = Depends(get_db)):
    """Get current value of a specific asset with depreciation calculation"""
    try:
        result = asset_depreciation_service.calculate_current_value(db, asset_id)
        return AssetValueResponse(**result.to_dict())
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating asset value: {str(e)}")


class AssetsTotalResponse(BaseModel):
    total_value_cents: int
    assets: list[dict]


@router.get("/assets/total", response_model=AssetsTotalResponse)
def get_total_assets_value(db: Session = Depends(get_db)):
    """Get total current value of all assets"""
    try:
        total_value = asset_depreciation_service.get_total_assets_value(db)
        assets_with_values = asset_depreciation_service.get_all_assets_with_values(db)
        return AssetsTotalResponse(
            total_value_cents=total_value,
            assets=assets_with_values
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating total assets: {str(e)}")


class BalanceSheetResponse(BaseModel):
    month: int
    year: int
    date: str
    assets: dict
    liabilities: dict
    equity_cents: int
    is_stale: bool


@router.get("/balance-sheet", response_model=BalanceSheetResponse)
def get_current_balance_sheet(db: Session = Depends(get_db)):
    """Get balance sheet for current month"""
    try:
        result = balance_sheet_service.get_current_balance_sheet(db)
        if not result:
            raise HTTPException(status_code=404, detail="No balance sheet found for current month")
        return BalanceSheetResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting balance sheet: {str(e)}")


@router.get("/balance-sheet/{month}/{year}", response_model=BalanceSheetResponse)
def get_balance_sheet_by_month(month: int, year: int, db: Session = Depends(get_db)):
    """Get balance sheet for specific month/year"""
    try:
        result = balance_sheet_service.get_balance_sheet(db, month, year)
        if not result:
            raise HTTPException(status_code=404, detail=f"No balance sheet found for {month}/{year}")
        return BalanceSheetResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting balance sheet: {str(e)}")


@router.get("/balance-sheet/history")
def get_balance_sheet_history(limit: int = 12, db: Session = Depends(get_db)):
    """Get balance sheet history (last N months)"""
    try:
        results = balance_sheet_service.get_balance_sheet_history(db, limit)
        return {"history": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting balance sheet history: {str(e)}")


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
