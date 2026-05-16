from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, cast

from app.models.transaction import Transaction
from app.models.category import Category

def detect_anomalies(db: Session) -> List[Dict]:
    """
    Motor de Detección de Fugas y Anomalías.
    Compara comportamientos históricos sin usar Machine Learning pesado,
    basado puramente en heurística matemática estricta con Decimal.
    """
    alerts = []
    now = datetime.now(timezone.utc)
    
    # Rango mes actual
    curr_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    curr_end = now
    
    # Rango mes anterior (mismos días)
    # Por ejemplo, si hoy es 15 de marzo, comparamos con del 1 al 15 de febrero.
    prev_month_date = curr_start - timedelta(days=1)
    prev_start = datetime(prev_month_date.year, prev_month_date.month, 1, tzinfo=timezone.utc)
    
    try:
        prev_end = prev_start.replace(day=now.day)
    except ValueError:
        # Si hoy es 31 y el mes pasado tuvo 30/28 días
        from calendar import monthrange
        last_day = monthrange(prev_start.year, prev_start.month)[1]
        prev_end = prev_start.replace(day=last_day)
        
    # ---------------------------------------------------------
    # 1. RASTREO DE SUSCRIPCIONES (Aumentos de precio ocultos)
    # ---------------------------------------------------------
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
    
    # Mapear mes anterior por descripcion exacta
    prev_map = {}
    for t in prev_full_txns:
        desc = str(t.description).strip().lower()
        # Guardamos el monto maximo si hay varios (ej. 2 pagos de uber, tomamos el mayor o la suma, mejor el maximo para suscripciones)
        amt = cast(int, t.amount)
        if desc not in prev_map or amt > prev_map[desc]:
            prev_map[desc] = amt

    for t in curr_txns:
        desc = str(t.description).strip().lower()
        if desc in prev_map:
            prev_amount = prev_map[desc]
            curr_amount = cast(int, t.amount)
            
            # Si el monto subió más de un 5% en un pago recurrente/idéntico
            if prev_amount > 0 and curr_amount > prev_amount * 105 // 100:
                increase_pct = ((curr_amount - prev_amount) * 100) // prev_amount
                alerts.append({
                    "type": "warning",
                    "severity": "high",
                    "message": f"Posible aumento en suscripción/servicio: '{t.description}' subió de ${prev_amount/100:.2f} a ${curr_amount/100:.2f} (+{increase_pct:.0f}%)."
                })

    # ---------------------------------------------------------
    # 2. BURN RATE (Velocidad de Gasto por Categoría)
    # ---------------------------------------------------------
    # Gasto por categoria mes anterior hasta este día
    prev_cat_spending: Dict[str, int] = {}
    prev_txns_period = db.query(Transaction).filter(
        Transaction.transaction_type == "expense",
        Transaction.is_deleted == False,
        Transaction.date >= prev_start,
        Transaction.date <= prev_end
    ).all()
    
    for t in prev_txns_period:
        if t.category_id:
            cid = str(t.category_id)
            prev_cat_spending[cid] = prev_cat_spending.get(cid, 0) + cast(int, t.amount)

    curr_cat_spending: Dict[str, int] = {}
    for t in curr_txns:
        if t.category_id:
            cid = str(t.category_id)
            curr_cat_spending[cid] = curr_cat_spending.get(cid, 0) + cast(int, t.amount)

    categories = {str(c.id): str(c.name) for c in db.query(Category).all()}
    
    for cat_id, curr_spent in curr_cat_spending.items():
        prev_spent = prev_cat_spending.get(cat_id, 0)
        
        # Ignorar categorias con poco dinero para no alertar basura (5000 centavos = $50)
        if curr_spent > 5000:
            if prev_spent == 0:
                alerts.append({
                    "type": "info",
                    "severity": "medium",
                    "message": f"Gasto inusual: Has gastado ${curr_spent/100:.2f} en '{categories.get(cat_id, 'Desconocido')}', categoría en la que no gastaste nada el mes pasado a estas fechas."
                })
            elif curr_spent > prev_spent * 130 // 100:  # 30% mas rapido
                inc_pct = ((curr_spent - prev_spent) * 100) // prev_spent
                alerts.append({
                    "type": "warning",
                    "severity": "high",
                    "message": f"Velocidad de gasto alta: En '{categories.get(cat_id, 'Desconocido')}' has gastado ${curr_spent/100:.2f}, un {inc_pct:.0f}% más rápido que el mes pasado."
                })

    return alerts

def calculate_anomaly_leak_total(db: Session) -> int:
    """Calculates the total monetary value of excessive spending (the leak) to subtract from safe_to_spend."""
    alerts = detect_anomalies(db)
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
