from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Optional

from app.models.transaction import Transaction
from app.models.account import Account

def calculate_historical_averages(db: Session, months_back: int = 3):
    """Calculates average income, fixed, and variable expenses over the last N months."""
    now = datetime.now(timezone.utc)
    
    # Rango de tiempo: Primer dia de (meses atras) hasta el ultimo dia del mes pasado
    # Evitamos el mes actual para no sesgar promedios con un mes incompleto
    try:
        first_day_current = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    except ValueError:
        first_day_current = now.replace(day=1)
        
    end_date = first_day_current - timedelta(seconds=1)
    
    start_month = (end_date.month - months_back) % 12
    start_year = end_date.year + ((end_date.month - months_back) // 12)
    if start_month == 0:
        start_month = 12
        start_year -= 1
        
    start_date = datetime(start_year, start_month, 1, tzinfo=timezone.utc)
    
    txns = db.query(Transaction).filter(
        Transaction.date >= start_date,
        Transaction.date <= end_date
    ).all()
    
    total_income = 0
    total_fixed = 0
    total_variable = 0
    
    for t in txns:
        if t.transaction_type == "income":
            total_income += t.amount
        elif t.transaction_type == "expense":
            if t.expense_type == "fixed":
                total_fixed += t.amount
            else:
                total_variable += t.amount
    
    return {
        "avg_income": total_income // months_back if months_back > 0 else 0,
        "avg_fixed_expense": total_fixed // months_back if months_back > 0 else 0,
        "avg_variable_expense": total_variable // months_back if months_back > 0 else 0
    }

def get_current_liquidity(db: Session) -> int:
    """Returns the sum of all checking and savings accounts."""
    accounts = db.query(Account).filter(
        Account.is_active == 1,
        Account.account_type.in_(["checking", "savings"])
    ).all()
    return sum((acc.balance for acc in accounts), 0)


def get_financial_projection(
    db: Session, 
    months: int = 12,
    extra_savings_per_month: int = 0,
    one_time_expense: int = 0,
    one_time_expense_month_offset: int = 0
) -> Dict:
    """
    Proyecta el flujo de caja a 'months' meses basado en historicos reales.
    Permite simular ingresos/ahorros extra y gastos fuertes de un solo golpe.
    """
    # 1. Base Variables
    liquidity = get_current_liquidity(db)
    averages = calculate_historical_averages(db, months_back=3)
    
    avg_income = averages["avg_income"]
    avg_fixed = averages["avg_fixed_expense"]
    avg_var = averages["avg_variable_expense"]
    
    # 2. Runway Calculation
    total_monthly_burn = avg_fixed + avg_var
    runway_months = 0.0
    if total_monthly_burn > 0:
        # FASE 7: Use integer division for money (cents) to avoid float precision issues
        runway_months = liquidity // total_monthly_burn if total_monthly_burn > 0 else 0
        
    # 3. Projection Loop
    timeline = []
    current_balance = liquidity
    now = datetime.now(timezone.utc)
    
    for i in range(1, months + 1):
        # Calculate target month/year
        proj_month = (now.month + i - 1) % 12 + 1
        proj_year = now.year + ((now.month + i - 1) // 12)
        label = f"{proj_year}-{proj_month:02d}"
        
        # Monthly flow
        monthly_in = avg_income
        monthly_out = avg_fixed + avg_var + extra_savings_per_month # savings implies cash outflow from checking if invested/saved away from liquidity, OR if extra_savings means extra income to save, let's treat it as reduced expense or extra income. 
        # Actually, "extra_savings_per_month" in a simulation usually means reducing expenses or boosting income to generate savings. Let's assume it boosts net flow.
        net_flow = avg_income - (avg_fixed + avg_var) + extra_savings_per_month
        
        if i == one_time_expense_month_offset:
            net_flow -= one_time_expense
            
        current_balance += net_flow
        
        timeline.append({
            "month_label": label,
            "projected_balance": current_balance,
            "net_flow": net_flow,
            "income": avg_income,
            "expense": avg_fixed + avg_var - extra_savings_per_month
        })
        
    return {
        "current_liquidity": liquidity,
        "average_monthly_income": avg_income,
        "average_monthly_expense": total_monthly_burn,
        "runway_months": runway_months,
        "timeline": timeline
    }
