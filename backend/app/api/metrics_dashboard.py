"""
Vistas agregadas para el dashboard principal: resumen mensual (ingresos,
gastos, breakdown, sankey) y telemetría de vehículo. Se monta bajo /metrics
vía api/metrics.py.
"""
from typing import Any, Optional, cast
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, case
from pydantic import BaseModel
from datetime import datetime
from decimal import Decimal
import json
import logging
from database import get_db
from app.models.transaction import Transaction
from app.models.category import Category
from app.models.config import Config
from app.models.transaction_split import TransactionSplit
from app.services.anomaly_detector import detect_anomalies

router = APIRouter()
METRICS_DASHBOARD_ERROR_RESPONSES = {500: {"description": "Dashboard metrics calculation failed."}}

logger = logging.getLogger(__name__)


class VehicleTelemetryResponse(BaseModel):
    total_distance: float
    cost_per_km: int
    total_vehicle_cost: int
    month: int
    year: int
    historical_cost_per_km: int
    next_maintenance_estimate: Optional[float] = None
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
            except (json.JSONDecodeError, TypeError, KeyError) as e:
                logger.debug("Failed to decode odometer reading from transaction metadata: %s", e)
                continue

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
            except (json.JSONDecodeError, TypeError) as e:
                logger.debug("Failed to parse last maintenance odometer metadata: %s", e)

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


class DashboardSummaryResponse(BaseModel):
    total_income: Decimal
    total_expenses: Decimal
    expense_breakdown: list[dict]
    daily_spending: list[dict]
    monthly_comparison: list[dict]
    sankey_data: dict
    vehicle_cost: Decimal
    alerts: list[dict]


def _get_dashboard_period(db: Session) -> tuple[int, int, str, datetime]:
    now = datetime.now()
    current_month = now.month
    current_year = now.year
    latest_txn = db.query(Transaction).filter(
        Transaction.is_deleted == False
    ).order_by(Transaction.date.desc()).first()

    if latest_txn:
        current_month = latest_txn.date.month
        current_year = latest_txn.date.year

    current_month_str = f"{current_year}-{current_month:02d}"
    end_date = (
        datetime(current_year, current_month + 1, 1)
        if current_month < 12
        else datetime(current_year + 1, 1, 1)
    )
    return current_year, current_month, current_month_str, end_date


def _get_ignored_category_ids(db: Session) -> list[str]:
    ignored_categories = db.query(Category.id).filter(
        (Category.name.ilike("%Transferencia%")) |
        (Category.name.ilike("%Ajuste%")) |
        (Category.name.ilike("%Meta%"))
    ).all()
    return [category[0] for category in ignored_categories]


def _get_income_blacklist(db: Session) -> list[str]:
    fallback = [
        "DENNIS", "DANIEL", "META", "TRANSFERENCIA", "PAGO EN OFIC",
        "MUCHAS GRACIAS", "TRANSF. DEUDA", "SU PAGO", "ABONO",
    ]
    config_entry = db.query(Config).filter(
        Config.key == "income_blacklist",
        Config.is_deleted == False,
    ).first()
    if not config_entry or not config_entry.value:
        return fallback

    try:
        return json.loads(config_entry.value)
    except Exception:
        return [item.strip() for item in config_entry.value.split(",") if item.strip()]


def _build_current_month_total_query(
    db: Session,
    transaction_type: str,
    current_year: int,
    current_month: int,
    end_date: datetime,
    ignored_ids: list[str],
    blacklist: list[str],
):
    query = db.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
        Transaction.is_deleted == False,
        Transaction.is_internal == False,
        Transaction.transaction_type == transaction_type,
        Transaction.date >= datetime(current_year, current_month, 1),
        Transaction.date < end_date,
    )
    if ignored_ids:
        query = query.filter(Transaction.category_id.not_in(ignored_ids))

    for pattern in blacklist:
        clean_pattern = pattern.strip("%")
        query = query.filter(~func.coalesce(Transaction.description, '').ilike(f"%{clean_pattern}%"))
    return query


def _get_dashboard_totals(
    db: Session,
    current_year: int,
    current_month: int,
    end_date: datetime,
    ignored_ids: list[str],
    blacklist: list[str],
) -> tuple[Decimal, Decimal]:
    income_query = _build_current_month_total_query(
        db, "income", current_year, current_month, end_date, ignored_ids, blacklist
    )
    expense_query = _build_current_month_total_query(
        db, "expense", current_year, current_month, end_date, ignored_ids, blacklist
    )
    return Decimal(str(income_query.scalar())), Decimal(str(expense_query.scalar()))


def _get_expense_breakdown(db: Session, current_year: int, current_month: int, end_date: datetime) -> list[dict]:
    rows = db.query(
        func.coalesce(Category.name, 'Sin Categoría').label("name"),
        func.coalesce(func.sum(Transaction.amount), 0).label("value")
    ).outerjoin(Category, Transaction.category_id == Category.id).filter(
        Transaction.transaction_type == "expense",
        Transaction.is_deleted == False,
        Transaction.date >= datetime(current_year, current_month, 1),
        Transaction.date < end_date,
    ).group_by(
        func.coalesce(Category.name, 'Sin Categoría')
    ).order_by(func.sum(Transaction.amount).desc()).limit(10).all()
    return [
        {"name": row.name, "value": Decimal(str(row.value))}
        for row in rows
    ]


def _get_daily_spending(db: Session, current_year: int, current_month: int, end_date: datetime) -> list[dict]:
    rows = db.query(
        func.date(Transaction.date).label("date"),
        func.coalesce(func.sum(Transaction.amount), 0).label("gasto")
    ).filter(
        Transaction.transaction_type == "expense",
        Transaction.is_deleted == False,
        Transaction.date >= datetime(current_year, current_month, 1),
        Transaction.date < end_date,
    ).group_by(func.date(Transaction.date)).order_by("date").all()
    return [
        {
            "date": datetime.strptime(str(row.date), "%Y-%m-%d").strftime("%m-%d"),
            "gasto": Decimal(str(row.gasto)),
        }
        for row in rows
    ]


def _get_monthly_comparison(db: Session) -> list[dict]:
    simple_txns = db.query(
        func.strftime("%Y-%m", Transaction.date).label("mes"),
        func.sum(case((Transaction.transaction_type == "income", Transaction.amount), else_=0)).label("Ingresos"),
        func.sum(case((Transaction.transaction_type == "expense", Transaction.amount), else_=0)).label("Gastos")
    ).filter(
        Transaction.is_deleted == False,
        ~Transaction.id.in_(db.query(TransactionSplit.transaction_id)),
    ).group_by("mes").all()
    split_txns = db.query(
        func.strftime("%Y-%m", Transaction.date).label("mes"),
        func.sum(case((Transaction.transaction_type == "income", TransactionSplit.amount), else_=0)).label("Ingresos"),
        func.sum(case((Transaction.transaction_type == "expense", TransactionSplit.amount), else_=0)).label("Gastos")
    ).join(TransactionSplit, Transaction.id == TransactionSplit.transaction_id).filter(
        Transaction.is_deleted == False
    ).group_by("mes").all()

    monthly_map = {}
    for row in simple_txns:
        monthly_map[row.mes] = {"Ingresos": int(row.Ingresos), "Gastos": int(row.Gastos)}
    for row in split_txns:
        if row.mes not in monthly_map:
            monthly_map[row.mes] = {"Ingresos": 0, "Gastos": 0}
        monthly_map[row.mes]["Ingresos"] += int(row.Ingresos)
        monthly_map[row.mes]["Gastos"] += int(row.Gastos)

    return [
        {"mes": mes, "Ingresos": data["Ingresos"], "Gastos": data["Gastos"]}
        for mes, data in sorted(monthly_map.items())
    ]


def _get_sankey_transactions(db: Session, current_month_str: str) -> list[Transaction]:
    return db.query(Transaction).options(
        joinedload(Transaction.category),
        joinedload(Transaction.splits).joinedload(TransactionSplit.category),
    ).filter(
        func.strftime("%Y-%m", Transaction.date) == current_month_str,
        Transaction.is_deleted == False,
    ).all()


def _get_sankey_income(txn: Transaction) -> int:
    if txn.splits:
        return sum((split.amount for split in txn.splits if split.amount), 0)
    return txn.amount if txn.amount else 0


def _add_sankey_expense(txn: Transaction, expense_categories: dict[str, int]) -> None:
    cat_name = txn.category.name if txn.category else "Sin Categoría"
    if txn.splits:
        for split in txn.splits:
            split_cat = split.category.name if split.category else cat_name
            expense_categories[split_cat] = expense_categories.get(split_cat, 0) + (split.amount or 0)
    else:
        expense_categories[cat_name] = expense_categories.get(cat_name, 0) + (txn.amount or 0)


def _get_sankey_totals(db: Session, current_month_str: str) -> tuple[int, dict[str, int]]:
    total_income = 0
    expense_categories: dict[str, int] = {}
    for txn in _get_sankey_transactions(db, current_month_str):
        if txn.transaction_type == "income":
            total_income += _get_sankey_income(txn)
        elif txn.transaction_type == "expense":
            _add_sankey_expense(txn, expense_categories)
    return total_income, expense_categories


def _append_sankey_expenses(nodes: list[dict], links: list[dict], expense_categories: dict[str, int]) -> int:
    node_index = 1
    for category, amount in expense_categories.items():
        if amount > 0:
            nodes.append({"name": category})
            links.append({"source": 0, "target": node_index, "value": amount})
            node_index += 1
    return node_index


def _build_sankey_data(total_income: int, expense_categories: dict[str, int]) -> dict:
    total_expenses = sum(expense_categories.values(), 0)
    nodes = []
    links = []
    if total_income > 0:
        nodes.append({"name": "Ingresos"})
        node_index = _append_sankey_expenses(nodes, links, expense_categories)
        remaining = max(0, total_income - total_expenses)
        if remaining > 0:
            nodes.append({"name": "Ahorro / Sobrante"})
            links.append({"source": 0, "target": node_index, "value": remaining})
    elif total_expenses > 0:
        nodes.append({"name": "Cuentas / Fuentes"})
        _append_sankey_expenses(nodes, links, expense_categories)
    else:
        nodes.extend([{"name": "Sin Datos"}, {"name": "Registra Transacciones"}])
        links.append({"source": 0, "target": 1, "value": 0})
    return {"nodes": nodes, "links": links}


def _get_vehicle_category_ids(db: Session) -> list[str]:
    config_entry = db.query(Config).filter(Config.key == "vehicle_categories").first()
    if config_entry and config_entry.value:
        try:
            return json.loads(cast(str, config_entry.value))
        except json.JSONDecodeError:
            pass
    categories = db.query(Category).filter(
        Category.name.in_(["Combustible", "Mantenimiento Vehiculo"])
    ).all()
    return [category.id for category in categories]


def _get_vehicle_cost(db: Session, current_year: int, current_month: int, end_date: datetime) -> float:
    vehicle_category_ids = _get_vehicle_category_ids(db)
    result = db.query(
        func.coalesce(func.sum(Transaction.amount), 0)
    ).filter(
        Transaction.transaction_type == "expense",
        Transaction.is_deleted == False,
        Transaction.category_id.in_(vehicle_category_ids),
        Transaction.date >= datetime(current_year, current_month, 1),
        Transaction.date < end_date,
    ).scalar()
    return float(cast(Any, result))


@router.get("/dashboard-summary", response_model=DashboardSummaryResponse, responses=METRICS_DASHBOARD_ERROR_RESPONSES)
def get_dashboard_summary(db: Session = Depends(get_db)):
    try:
        current_year, current_month, current_month_str, end_date = _get_dashboard_period(db)
        ignored_ids = _get_ignored_category_ids(db)
        blacklist = _get_income_blacklist(db)
        total_income, total_expenses = _get_dashboard_totals(
            db,
            current_year,
            current_month,
            end_date,
            ignored_ids,
            blacklist,
        )
        expense_breakdown = _get_expense_breakdown(db, current_year, current_month, end_date)
        daily_spending = _get_daily_spending(db, current_year, current_month, end_date)

        monthly_comparison = _get_monthly_comparison(db)

        total_income_month, expense_categories = _get_sankey_totals(db, current_month_str)
        sankey_data = _build_sankey_data(total_income_month, expense_categories)

        vehicle_cost = _get_vehicle_cost(db, current_year, current_month, end_date)

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
        logger.exception("Error in dashboard summary: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
