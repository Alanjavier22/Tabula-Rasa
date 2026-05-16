from typing import List, Optional, Dict, Any, cast
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import json
import calendar
from database import get_db
from app.api.auth import get_current_device
from app.models.account import Account
from app.models.transaction import Transaction
from app.models.budget import Budget
from app.models.category import Category
from app.models.config import Config
from app.models.reminder import Reminder
from app.models.credit_card_statement import CreditCardStatement
from app.models.subscription import Subscription
from app.models.transaction_split import TransactionSplit
from app.models.iou import IOU, IOUType, IOUStatus
from app.models.debt_share import DebtShare
from app.services.anomaly_detector import detect_anomalies, calculate_anomaly_leak_total
from app.services.forecaster import get_financial_projection
from app.services.asset_depreciation import asset_depreciation_service
from app.services.balance_sheet import balance_sheet_service
from app.services.cash_flow import cash_flow_service

router = APIRouter(
    prefix="/metrics", 
    tags=["Metrics"], 
    redirect_slashes=False,
    dependencies=[Depends(get_current_device)]
)


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
            from app.api.ai_assistant import get_fiscal_summary
            fiscal = get_fiscal_summary(db)
            projected_taxes = Decimal(str(fiscal["iva_projected"] + fiscal["retencion_projected"]))
        except:
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
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error calculating safe-to-spend: {str(e)}")


class NetWorthResponse(BaseModel):
    net_worth: int
    assets: int
    liabilities: int
    history: list


@router.get("/net-worth", response_model=NetWorthResponse)
def get_net_worth(db: Session = Depends(get_db)):
    assets_accounts = db.query(Account).filter(
        Account.is_active == 1,
        Account.is_deleted == False,
        Account.account_type.in_(["checking", "savings", "investment"])
    ).all()
    assets = Decimal(str(sum((acc.balance for acc in assets_accounts), 0)))

    they_owe_ious = db.query(IOU).filter(
        IOU.iou_type == IOUType.THEY_OWE, IOU.status == IOUStatus.PENDING,
        IOU.is_deleted == False
    ).all()
    assets += Decimal(str(sum((i.amount for i in they_owe_ious), 0)))

    # DebtShares (Money owed to user by others for CC payments)
    pending_debt_shares = db.query(DebtShare).filter(DebtShare.status == "pending").all()
    assets += Decimal(str(sum((ds.amount for ds in pending_debt_shares), 0)))

    # Physical Assets with Depreciation
    from app.models.asset import Asset
    from app.services.asset_depreciation import asset_depreciation_service
    physical_assets = db.query(Asset).filter(Asset.is_deleted == False).all()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    for asset in physical_assets:
        current_val_result = asset_depreciation_service.calculate_current_value(db, cast(str, asset.id), now)
        assets += Decimal(str(current_val_result.current_value_cents))

    liabilities_accounts = db.query(Account).filter(
        Account.is_active == 1, Account.is_deleted == False, Account.account_type == "credit_card"
    ).all()
    liabilities = Decimal(str(sum(
        (abs(cast(int, acc.balance)) for acc in liabilities_accounts if acc.balance < 0),
        0
    )))

    i_owe_ious = db.query(IOU).filter(
        IOU.iou_type == IOUType.I_OWE, IOU.status == IOUStatus.PENDING,
        IOU.is_deleted == False
    ).all()
    liabilities += Decimal(str(sum((i.amount for i in i_owe_ious), 0)))


    net_worth = assets - liabilities

    monthly_data = db.query(
        func.strftime("%Y-%m", Transaction.date).label("month"),
        func.sum(case((Transaction.transaction_type == "income", Transaction.amount), else_=0)).label("income"),
        func.sum(case((Transaction.transaction_type == "expense", Transaction.amount), else_=0)).label("expense")
    ).filter(
        Transaction.is_deleted == False
    ).group_by(func.strftime("%Y-%m", Transaction.date)).order_by("month").all()

    history = []
    for row in monthly_data:
        month_income = Decimal(str(row.income or 0))
        month_expense = Decimal(str(row.expense or 0))

        month_txns = db.query(Transaction).filter(
            func.strftime("%Y-%m", Transaction.date) == row.month,
            Transaction.is_deleted == False
        ).all()

        for txn in month_txns:
            if txn.splits:
                split_total = Decimal(str(sum((s.amount for s in txn.splits), 0)))
                if txn.transaction_type == "income":
                    month_income = month_income - Decimal(str(txn.amount)) + split_total
                else:
                    month_expense = month_expense - Decimal(str(txn.amount)) + split_total

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
    historical_cost_per_km: int
    next_maintenance_estimate: Optional[float]
    maintenance_interval: int = 5000  # Default interval

@router.get("/vehicle-telemetry", response_model=VehicleTelemetryResponse)
def get_vehicle_telemetry(db: Session = Depends(get_db)):
    now = datetime.now()
    
    config_entry = db.query(Config).filter(Config.key == "vehicle_categories").first()
    vehicle_category_ids = []
    if config_entry and config_entry.value:
        try:
            vehicle_category_ids = json.loads(cast(str, config_entry.value))
        except json.JSONDecodeError:
            pass

    if not vehicle_category_ids:
        vehicle_categories = db.query(Category).filter(
            Category.name.in_(["Combustible", "Mantenimiento Vehiculo"])
        ).all()
        vehicle_category_ids = [c.id for c in vehicle_categories]

    # Current month stats
    current_month_txns = db.query(Transaction).filter(
        Transaction.transaction_type == "expense",
        Transaction.category_id.in_(vehicle_category_ids),
        Transaction.date >= datetime(now.year, now.month, 1),
        Transaction.is_deleted == False,
    ).all()

    total_vehicle_cost = sum((Decimal(str(t.amount)) for t in current_month_txns), Decimal("0"))
    
    # Historical stats for Odometer and cost per KM
    all_vehicle_txns = db.query(Transaction).filter(
        Transaction.transaction_type == "expense",
        Transaction.category_id.in_(vehicle_category_ids),
        Transaction.is_deleted == False,
    ).order_by(Transaction.date.asc()).all()

    odometer_readings = []
    total_historical_cost = Decimal("0")
    
    for txn in all_vehicle_txns:
        total_historical_cost += Decimal(str(txn.amount))
        if txn.metadata_json:
            try:
                meta = json.loads(cast(str, txn.metadata_json))
                if "odometer" in meta:
                    odometer_readings.append({"date": txn.date, "val": meta["odometer"]})
            except: continue

    # Current month distance
    month_odometer = [o["val"] for o in odometer_readings if o["date"].month == now.month and o["date"].year == now.year]
    total_distance = max(month_odometer) - min(month_odometer) if len(month_odometer) >= 2 else 0
    cost_per_km = total_vehicle_cost / total_distance if total_distance > 0 else 0

    # Historical cost per KM
    hist_distance = max([o["val"] for o in odometer_readings]) - min([o["val"] for o in odometer_readings]) if len(odometer_readings) >= 2 else 0
    historical_cost_per_km = total_historical_cost / hist_distance if hist_distance > 0 else 0

    # Next maintenance estimate
    next_maint = None
    if odometer_readings:
        current_odo = max([o["val"] for o in odometer_readings])
        # Find last maintenance
        maint_categories = db.query(Category).filter(Category.name.ilike("%mantenimiento%")).all()
        maint_ids = [c.id for c in maint_categories]
        last_maint_txn = db.query(Transaction).filter(
            Transaction.category_id.in_(maint_ids),
            Transaction.is_deleted == False
        ).order_by(Transaction.date.desc()).first()
        
        last_maint_odo = 0
        if last_maint_txn and last_maint_txn.metadata_json:
            try:
                m_meta = json.loads(cast(str, last_maint_txn.metadata_json))
                last_maint_odo = m_meta.get("odometer", 0)
            except: pass
        
        next_maint = (last_maint_odo + 5000) - current_odo

    return VehicleTelemetryResponse(
        total_distance=float(total_distance),
        cost_per_km=int(cost_per_km),
        total_vehicle_cost=int(total_vehicle_cost),
        month=now.month,
        year=now.year,
        historical_cost_per_km=int(historical_cost_per_km),
        next_maintenance_estimate=float(next_maint) if next_maint is not None else None
    )

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
            (abs(r.amount) for r in reminders
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


class DashboardSummaryResponse(BaseModel):
    total_income: Decimal
    total_expenses: Decimal
    expense_breakdown: list[dict]
    daily_spending: list[dict]
    monthly_comparison: list[dict]
    sankey_data: dict
    vehicle_cost: Decimal
    alerts: list[dict]


@router.get("/dashboard-summary", response_model=DashboardSummaryResponse)
def get_dashboard_summary(db: Session = Depends(get_db)):
    try:
        now = datetime.now()
        current_month = now.month
        current_year = now.year
        
        # Find the most recent month with transactions
        latest_txn = db.query(Transaction).filter(
            Transaction.is_deleted == False
        ).order_by(Transaction.date.desc()).first()
        
        if latest_txn:
            latest_date = latest_txn.date
            current_month = latest_date.month
            current_year = latest_date.year
        
        current_month_str = f"{current_year}-{current_month:02d}"

        # Current month totals - CLEAN DATA (Excluding transfers/CC payments)
        ignored_categories = db.query(Category.id).filter(
            (Category.name.ilike("%Transferencia%")) | 
            (Category.name.ilike("%Ajuste%")) |
            (Category.name.ilike("%Meta%"))
        ).all()
        ignored_ids = [c[0] for c in ignored_categories]
        
        blacklist = ["%PAGO EN OFIC%", "%MUCHAS GRACIAS%", "%TRANSF. DEUDA%", "%SU PAGO%", "%ABONO%"]
        
        end_date = datetime(current_year, current_month + 1, 1) if current_month < 12 else datetime(current_year + 1, 1, 1)
        
        income_query = db.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
            Transaction.is_deleted == False,
            Transaction.is_internal == False, # Structural filter
            Transaction.transaction_type == "income",
            Transaction.date >= datetime(current_year, current_month, 1),
            Transaction.date < end_date
        )
        
        expense_query = db.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
            Transaction.is_deleted == False,
            Transaction.is_internal == False, # Structural filter
            Transaction.transaction_type == "expense",
            Transaction.date >= datetime(current_year, current_month, 1),
            Transaction.date < end_date
        )

        if ignored_ids:
            income_query = income_query.filter(Transaction.category_id.not_in(ignored_ids))
            expense_query = expense_query.filter(Transaction.category_id.not_in(ignored_ids))
        
        # Legacy safety: also filter by common keywords for manual/old transactions
        for pattern in blacklist:
            income_query = income_query.filter(Transaction.description.not_ilike(pattern))
            expense_query = expense_query.filter(Transaction.description.not_ilike(pattern))

        total_income = Decimal(str(income_query.scalar()))
        total_expenses = Decimal(str(expense_query.scalar()))

        expense_breakdown_query = db.query(
            func.coalesce(Category.name, 'Sin Categoría').label("name"),
            func.coalesce(func.sum(Transaction.amount), 0).label("value")
        ).outerjoin(Category, Transaction.category_id == Category.id).filter(
            Transaction.transaction_type == "expense",
            Transaction.is_deleted == False,
            Transaction.date >= datetime(current_year, current_month, 1),
            Transaction.date < end_date
        ).group_by(
            func.coalesce(Category.name, 'Sin Categoría')
        ).order_by(func.sum(Transaction.amount).desc()).limit(10).all()

        expense_breakdown = [
            {"name": row.name, "value": Decimal(str(row.value))}
            for row in expense_breakdown_query
        ]

        daily_spending_query = db.query(
            func.date(Transaction.date).label("date"),
            func.coalesce(func.sum(Transaction.amount), 0).label("gasto")
        ).filter(
            Transaction.transaction_type == "expense",
            Transaction.is_deleted == False,
            Transaction.date >= datetime(current_year, current_month, 1),
            Transaction.date < end_date
        ).group_by(func.date(Transaction.date)).order_by("date").all()

        daily_spending = [
            {"date": datetime.strptime(str(row.date), "%Y-%m-%d").strftime("%m-%d"), "gasto": Decimal(str(row.gasto))}
            for row in daily_spending_query
        ]

        # Optimized Historical comparison using SQL aggregation
        # 1. Sum simple transactions (no splits)
        simple_txns = db.query(
            func.strftime("%Y-%m", Transaction.date).label("mes"),
            func.sum(case((Transaction.transaction_type == "income", Transaction.amount), else_=0)).label("Ingresos"),
            func.sum(case((Transaction.transaction_type == "expense", Transaction.amount), else_=0)).label("Gastos")
        ).filter(
            Transaction.is_deleted == False,
            ~Transaction.id.in_(db.query(TransactionSplit.transaction_id))
        ).group_by("mes").all()

        # 2. Sum split transactions
        split_txns = db.query(
            func.strftime("%Y-%m", Transaction.date).label("mes"),
            func.sum(case((Transaction.transaction_type == "income", TransactionSplit.amount), else_=0)).label("Ingresos"),
            func.sum(case((Transaction.transaction_type == "expense", TransactionSplit.amount), else_=0)).label("Gastos")
        ).join(TransactionSplit, Transaction.id == TransactionSplit.transaction_id).filter(
            Transaction.is_deleted == False
        ).group_by("mes").all()

        # Combine results
        monthly_map = {}
        for row in simple_txns:
            monthly_map[row.mes] = {"Ingresos": int(row.Ingresos), "Gastos": int(row.Gastos)}
        
        for row in split_txns:
            if row.mes not in monthly_map:
                monthly_map[row.mes] = {"Ingresos": 0, "Gastos": 0}
            monthly_map[row.mes]["Ingresos"] += int(row.Ingresos)
            monthly_map[row.mes]["Gastos"] += int(row.Gastos)

        monthly_comparison = [
            {"mes": mes, "Ingresos": data["Ingresos"], "Gastos": data["Gastos"]}
            for mes, data in sorted(monthly_map.items())
        ]

        # Sankey data for current month
        current_month_txns = db.query(Transaction).filter(
            func.strftime("%Y-%m", Transaction.date) == current_month_str,
            Transaction.is_deleted == False
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

        nodes = []
        links = []
        node_index = 0

        # Case 1: Has income - show flow from Income → Categories → Savings
        if total_income_month > 0:
            nodes.append({"name": "Ingresos"})
            node_index = 1
            remaining = max(0, total_income_month - total_expenses_month)
            
            for cat, amount in expense_categories.items():
                if amount > 0:
                    nodes.append({"name": cat})
                    links.append({"source": 0, "target": node_index, "value": amount})
                    node_index += 1
            
            if remaining > 0:
                nodes.append({"name": "Ahorro / Sobrante"})
                links.append({"source": 0, "target": node_index, "value": remaining})
        
        # Case 2: No income but has expenses - show flow from Accounts → Categories
        elif total_expenses_month > 0:
            nodes.append({"name": "Cuentas / Fuentes"})
            node_index = 1
            
            for cat, amount in expense_categories.items():
                if amount > 0:
                    nodes.append({"name": cat})
                    links.append({"source": 0, "target": node_index, "value": amount})
                    node_index += 1
        
        # Case 3: No transactions at all - show placeholder
        else:
            nodes.append({"name": "Sin Datos"})
            nodes.append({"name": "Registra Transacciones"})
            links.append({"source": 0, "target": 1, "value": 0})

        sankey_data = {"nodes": nodes, "links": links}

        # Vehicle cost
        config_entry = db.query(Config).filter(Config.key == "vehicle_categories").first()
        vehicle_category_ids = []
        if config_entry and config_entry.value:
            try:
                vehicle_category_ids = json.loads(cast(str, config_entry.value))
            except json.JSONDecodeError:
                pass

        if not vehicle_category_ids:
            vehicle_categories = db.query(Category).filter(
                Category.name.in_(["Combustible", "Mantenimiento Vehiculo"])
            ).all()
            vehicle_category_ids = [c.id for c in vehicle_categories]

        vehicle_cost_result = db.query(
            func.coalesce(func.sum(Transaction.amount), 0)
        ).filter(
            Transaction.transaction_type == "expense",
            Transaction.is_deleted == False,
            Transaction.category_id.in_(vehicle_category_ids),
            Transaction.date >= datetime(current_year, current_month, 1),
            Transaction.date < end_date
        ).scalar()
        vehicle_cost = float(cast(Any, vehicle_cost_result))
        
        alerts = detect_anomalies(db)

        return {
            "total_income": total_income,
            "total_expenses": total_expenses,
            "expense_breakdown": expense_breakdown,
            "daily_spending": daily_spending,
            "monthly_comparison": monthly_comparison,
            "sankey_data": sankey_data,
            "vehicle_cost": vehicle_cost,
            "alerts": alerts
        }
    except Exception as e:
        import traceback
        print(f"Error in dashboard summary: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


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
    equity_cents: Decimal
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
