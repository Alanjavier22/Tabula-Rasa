from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, cast

from app.models.transaction import Transaction
from app.models.category import Category


def _get_month_periods(now: datetime) -> tuple[datetime, datetime, datetime, datetime]:
    current_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    previous_month = current_start - timedelta(days=1)
    previous_start = datetime(previous_month.year, previous_month.month, 1, tzinfo=timezone.utc)
    try:
        previous_end = previous_start.replace(day=now.day)
    except ValueError:
        from calendar import monthrange
        previous_end = previous_start.replace(
            day=monthrange(previous_start.year, previous_start.month)[1]
        )
    return current_start, now, previous_start, previous_end


def _build_previous_description_map(transactions: list[Transaction]) -> Dict[str, int]:
    previous_map = {}
    for transaction in transactions:
        description = str(transaction.description).strip().lower()
        amount = cast(int, transaction.amount)
        if description not in previous_map or amount > previous_map[description]:
            previous_map[description] = amount
    return previous_map


def _subscription_alerts(
    current_transactions: list[Transaction],
    previous_map: Dict[str, int],
) -> List[Dict]:
    alerts = []
    for transaction in current_transactions:
        description = str(transaction.description).strip().lower()
        if description not in previous_map:
            continue
        previous_amount = previous_map[description]
        current_amount = cast(int, transaction.amount)
        if previous_amount <= 0 or current_amount <= previous_amount * 105 // 100:
            continue
        increase_pct = ((current_amount - previous_amount) * 100) // previous_amount
        alerts.append({
            "type": "warning",
            "severity": "high",
            "message": f"Posible aumento en suscripción/servicio: '{transaction.description}' subió de ${previous_amount/100:.2f} a ${current_amount/100:.2f} (+{increase_pct:.0f}%).",
        })
    return alerts


def _category_spending(transactions: list[Transaction]) -> Dict[str, int]:
    spending: Dict[str, int] = {}
    for transaction in transactions:
        if not transaction.category_id:
            continue
        category_id = str(transaction.category_id)
        spending[category_id] = spending.get(category_id, 0) + cast(int, transaction.amount)
    return spending


def _burn_rate_alerts(
    current_spending: Dict[str, int],
    previous_spending: Dict[str, int],
    categories: Dict[str, str],
) -> List[Dict]:
    alerts = []
    for category_id, current_amount in current_spending.items():
        previous_amount = previous_spending.get(category_id, 0)
        if current_amount <= 5000:
            continue
        category_name = categories.get(category_id, 'Desconocido')
        if previous_amount == 0:
            alerts.append({
                "type": "info",
                "severity": "medium",
                "message": f"Gasto inusual: Has gastado ${current_amount/100:.2f} en '{category_name}', categoría en la que no gastaste nada el mes pasado a estas fechas.",
            })
        elif current_amount > previous_amount * 130 // 100:
            increase_pct = ((current_amount - previous_amount) * 100) // previous_amount
            alerts.append({
                "type": "warning",
                "severity": "high",
                "message": f"Velocidad de gasto alta: En '{category_name}' has gastado ${current_amount/100:.2f}, un {increase_pct:.0f}% más rápido que el mes pasado.",
            })
    return alerts


def detect_anomalies(db: Session) -> List[Dict]:
    """
    Motor de Detección de Fugas y Anomalías.
    Compara comportamientos históricos sin usar Machine Learning pesado,
    basado puramente en heurística matemática estricta con Decimal.
    """
    now = datetime.now(timezone.utc)
    curr_start, _, prev_start, prev_end = _get_month_periods(now)
    curr_txns = db.query(Transaction).filter(
        Transaction.transaction_type == "expense",
        Transaction.is_deleted == False,
        Transaction.date >= curr_start
    ).all()
    
    prev_full_txns = db.query(Transaction).filter(
        Transaction.transaction_type == "expense",
        Transaction.is_deleted == False,
        Transaction.date >= prev_start,
        Transaction.date < curr_start
    ).all()
    
    alerts = _subscription_alerts(curr_txns, _build_previous_description_map(prev_full_txns))
    prev_txns_period = db.query(Transaction).filter(
        Transaction.transaction_type == "expense",
        Transaction.is_deleted == False,
        Transaction.date >= prev_start,
        Transaction.date <= prev_end
    ).all()
    
    prev_cat_spending = _category_spending(prev_txns_period)
    curr_cat_spending = _category_spending(curr_txns)
    categories = {str(c.id): str(c.name) for c in db.query(Category).all()}
    return alerts + _burn_rate_alerts(curr_cat_spending, prev_cat_spending, categories)

def calculate_anomaly_leak_total(db: Session) -> int:
    """Calculates the total monetary value of excessive spending (the leak) to subtract from safe_to_spend."""
    # Para simplificar y no duplicar lógica, simplemente extraemos el valor de la alerta si lo necesitamos, 
    # o re-calculamos el exceso total (curr_spent - prev_spent) en categorias con alerta de velocidad.
    now = datetime.now(timezone.utc)
    curr_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    
    prev_month_date = curr_start - timedelta(days=1)
    prev_start = datetime(prev_month_date.year, prev_month_date.month, 1, tzinfo=timezone.utc)
    try:
        prev_end = prev_start.replace(day=now.day)
    except ValueError:
        from calendar import monthrange
        prev_end = prev_start.replace(day=monthrange(prev_start.year, prev_start.month)[1])
        
    curr_txns = db.query(Transaction).filter(Transaction.transaction_type == "expense", Transaction.is_deleted == False, Transaction.date >= curr_start).all()
    prev_txns = db.query(Transaction).filter(Transaction.transaction_type == "expense", Transaction.is_deleted == False, Transaction.date >= prev_start, Transaction.date <= prev_end).all()
    
    curr_cat: Dict[str, int] = {}
    for t in curr_txns:
        if t.category_id:
            cid = str(t.category_id)
            curr_cat[cid] = curr_cat.get(cid, 0) + cast(int, t.amount)
        
    prev_cat: Dict[str, int] = {}
    for t in prev_txns:
        if t.category_id:
            cid = str(t.category_id)
            prev_cat[cid] = prev_cat.get(cid, 0) + cast(int, t.amount)
        
    total_leak = 0
    for cat_id, curr_spent in curr_cat.items():
        prev_spent = prev_cat.get(cat_id, 0)
        if curr_spent > 5000 and prev_spent > 0 and curr_spent > prev_spent * 130 // 100:
            total_leak += (curr_spent - prev_spent) # El exceso se considera "fuga"
            
    return total_leak
