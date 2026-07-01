from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db
from app.models.config import Config
from app.models.transaction import Transaction
from app.models.budget import Budget
from app.models.account import Account
from app.models.category import Category
from app.models.reminder import Reminder
from app.models.credit_card_statement import CreditCardStatement
from app.models.transaction_split import TransactionSplit
from app.models.iou import IOU, IOUType, IOUStatus
from app.models.debt_share import DebtShare
from app.models.goal import Goal, GoalStatus
from app.models.subscription import Subscription
from datetime import datetime, timezone, timedelta
from decimal import Decimal
import google.genai as genai
from google.genai import errors, types
from app.services.ai_models import REASONING_MODEL
import json
from pydantic import BaseModel
from typing import List, Any, cast
from app.services.ai_prompts import get_current_time_context, CORE_RULES, get_persona_prompt

from app.api.auth import get_current_device

router = APIRouter(
    prefix="/ai", 
    tags=["AI Insights"], 
    dependencies=[Depends(get_current_device)],
    redirect_slashes=False
)


class InsightsResponse(BaseModel):
    insights: List[str]
    alerts: List[str]
    patterns: List[str]


class FinancialWarning(BaseModel):
    level: str  # "warning" | "info" | "success"
    message: str


class FinancialWarningsResponse(BaseModel):
    warnings: List[FinancialWarning]


# --- Helpers: Build anonymous financial summaries (NO PII) ---

def _build_transaction_summary(db: Session, now: datetime) -> dict:
    """Summarize current month transactions by category (anonymous: only categories, amounts, relative dates)."""
    current_month_str = now.strftime('%Y-%m')

    transactions = db.query(Transaction).filter(
        Transaction.date.like(f'{current_month_str}%'),
        Transaction.is_deleted == False
    ).all()

    total_income = sum((t.amount for t in transactions if t.transaction_type == 'income'), 0)
    total_expenses = sum((t.amount for t in transactions if t.transaction_type == 'expense'), 0)

    # Group expenses by category name (anonymous)
    category_cache = {}
    expense_by_category = {}
    for t in transactions:
        if t.transaction_type != 'expense':
            continue
        if t.category_id not in category_cache:
            cat = db.query(Category).filter(Category.id == t.category_id).first() if t.category_id else None
            category_cache[t.category_id] = cat.name if cat else "Sin Categoría"
        cat_name = category_cache[t.category_id]
        expense_by_category[cat_name] = expense_by_category.get(cat_name, 0) + t.amount

    # Detect atypical spending: transactions > 2x the average expense
    expense_amounts = [t.amount for t in transactions if t.transaction_type == 'expense']
    avg_expense = sum(expense_amounts, 0) // max(len(expense_amounts), 1)
    atypical = []
    for t in transactions:
        if t.transaction_type == 'expense' and t.amount > avg_expense * 2 and avg_expense > 0:
            days_ago = (now.replace(tzinfo=None) - t.date.replace(tzinfo=None)).days if t.date else 0
            cat_name = category_cache.get(t.category_id, "Sin Categoría")
            atypical.append(f"${t.amount / 100:.2f} en {cat_name} (hace {days_ago} días)")

    return {
        "total_income": total_income,
        "total_expenses": total_expenses,
        "balance": total_income - total_expenses,
        "expense_by_category": {k: v for k, v in expense_by_category.items()},
        "atypical_transactions": atypical[:5],
        "transaction_count": len(transactions),
    }


def _build_budget_summary(db: Session, now: datetime) -> list:
    """Summarize budgets with over-budget detection."""
    budgets = db.query(Budget).filter(Budget.month == now.month, Budget.year == now.year).all()
    result = []
    for b in budgets:
        amount = b.amount
        spent = b.spent
        cat_name = b.category.name if b.category else "Sin Categoría"
        result.append({
            "category": cat_name,
            "limit": amount,
            "spent": spent,
            "remaining": amount - spent,
            "exceeded": spent > amount,
        })
    return result


def _build_credit_card_summary(db: Session, now: datetime) -> dict:
    """Summarize credit card debt exposure (anonymous: only amounts and relative dates)."""
    statements = db.query(CreditCardStatement).filter(
        CreditCardStatement.is_deleted == False,
        CreditCardStatement.status != 'paid',
        # Include all pending/partial statements up to current date + buffer
        # (This is more comprehensive than just the current month)
        CreditCardStatement.payment_due_date <= now + timedelta(days=30)
    ).all()

    total_due = 0
    total_paid = 0
    upcoming_due_within_7_days = 0

    # Get credit card accounts with limits
    cc_accounts = db.query(Account).filter(
        Account.is_deleted == False,
        Account.account_type == 'credit_card'
    ).all()

    total_credit_limit = 0
    cc_details = []

    for acc in cc_accounts:
        credit_limit = acc.credit_limit if acc.credit_limit else 0
        total_credit_limit += credit_limit
        
        # Calculate statement balance for this account
        acc_statements = [s for s in statements if s.account_id == acc.id]
        acc_statement_balance = sum((s.statement_balance for s in acc_statements), 0)
        acc_user_share = sum((s.user_share for s in acc_statements), 0)
        acc_paid = sum((s.amount_paid for s in acc_statements), 0)
        acc_pending = acc_user_share - acc_paid
        
        utilization_pct = (acc_statement_balance / credit_limit * 100) if credit_limit > 0 else 0
        
        cc_details.append({
            "account_name": acc.name,  # Account name is not PII
            "credit_limit": credit_limit,
            "statement_balance": acc_statement_balance,
            "user_share": acc_user_share,
            "paid": acc_paid,
            "pending": acc_pending,
            "utilization_pct": utilization_pct,
        })

    for s in statements:
        user_share = s.user_share if s.user_share else 0
        paid = s.amount_paid if s.amount_paid else 0
        total_due += user_share
        total_paid += paid
        if s.payment_due_date and (s.payment_due_date.replace(tzinfo=None) - now.replace(tzinfo=None)).days <= 7:
            upcoming_due_within_7_days += 1

    total_statement_balance = sum((s.statement_balance for s in statements), 0)
    overall_utilization = (total_statement_balance / total_credit_limit * 100) if total_credit_limit > 0 else 0

    return {
        "total_statement_due": total_due,
        "total_paid": total_paid,
        "pending_amount": total_due - total_paid,
        "statements_due_within_7_days": upcoming_due_within_7_days,
        "open_statements": len(statements),
        "total_credit_limit": total_credit_limit,
        "total_statement_balance": total_statement_balance,
        "overall_utilization_pct": overall_utilization,
        "cc_details": cc_details,
    }


def _build_liquidity_summary(db: Session) -> dict:
    """Summarize liquid assets vs near-term obligations."""
    accounts = db.query(Account).filter(
        Account.is_active == 1,
        Account.is_deleted == False
    ).all()
    liquid = sum((a.balance for a in accounts if a.account_type in ['checking', 'savings', 'cash']), 0)
    credit_debt = sum((a.balance for a in accounts if a.account_type == 'credit_card'), 0)
    
    # Add IOUs that others owe (increases liquidity)
    they_owe = db.query(IOU).filter(
        IOU.iou_type == IOUType.THEY_OWE,
        IOU.status == IOUStatus.PENDING
    ).all()
    ious_receivable = sum((i.amount for i in they_owe), 0)
    liquid += ious_receivable
    
    # Subtract pending Debt Shares (decreases liquidity)
    pending_debts = db.query(DebtShare).filter(DebtShare.status == 'pending').all()
    pending_debt_total = sum((ds.amount for ds in pending_debts), 0)
    
    return {
        "liquid_balance": liquid,
        "credit_card_debt": credit_debt,
        "net_liquid": liquid - credit_debt,
        "ious_receivable": ious_receivable,
        "pending_debt_shares": pending_debt_total,
    }


def _build_debt_share_summary(db: Session, now: datetime) -> dict:
    """Summarize pending debt shares and upcoming credit card cutoff dates."""
    pending_debts = db.query(DebtShare).filter(DebtShare.status == 'pending').all()
    total_pending = sum((ds.amount for ds in pending_debts), 0)
    
    # Group debt shares by person
    debts_by_person = {}
    for ds in pending_debts:
        person = ds.person_name
        if person not in debts_by_person:
            debts_by_person[person] = {
                "total_amount": 0,
                "count": 0,
                "descriptions": []
            }
        debts_by_person[person]["total_amount"] += ds.amount
        debts_by_person[person]["count"] += 1
        if ds.description:
            debts_by_person[person]["descriptions"].append(ds.description)
    
    # Get upcoming credit card cutoff dates within 7 days
    statements = db.query(CreditCardStatement).filter(
        CreditCardStatement.is_deleted == False,
        CreditCardStatement.cut_off_date >= now,
        CreditCardStatement.cut_off_date <= now + timedelta(days=7)
    ).all()
    
    upcoming_cutoffs = []
    for s in statements:
        days_until = (s.cut_off_date.replace(tzinfo=None) - now.replace(tzinfo=None)).days if s.cut_off_date else 0
        upcoming_cutoffs.append({
            "days_until_cutoff": days_until,
            "statement_id": s.id,
        })
    
    return {
        "total_pending_debt_shares": total_pending,
        "pending_debt_count": len(pending_debts),
        "debts_by_person": debts_by_person,
        "upcoming_cutoffs_within_7_days": len(upcoming_cutoffs),
    }


def _build_subscription_summary(db: Session, now: datetime) -> dict:
    """Summarize active subscriptions with upcoming billing dates."""
    subscriptions = db.query(Subscription).filter(
        Subscription.is_deleted == False,
        Subscription.is_active == True,
        Subscription.next_billing_date.isnot(None)
    ).all()
    
    monthly_total = 0
    upcoming_subs = []
    
    for s in subscriptions:
        if s.frequency == 'monthly':
            monthly_total += s.amount or 0
        elif s.frequency == 'yearly':
            monthly_total += (s.amount or 0) / 12
        
        if s.next_billing_date and s.next_billing_date <= now + timedelta(days=30):
            upcoming_subs.append(s)
    
    # Group by frequency
    by_frequency = {}
    for s in subscriptions:
        freq = s.frequency.value if hasattr(s.frequency, 'value') else str(s.frequency)
        by_frequency[freq] = by_frequency.get(freq, 0) + 1
    
    return {
        "total_active_subscriptions": len(subscriptions),
        "upcoming_in_30_days": len(upcoming_subs),
        "monthly_total_estimated": int(monthly_total),
        "by_frequency": by_frequency,
    }


def _build_goals_summary(db: Session) -> dict:
    """Summarize active financial goals."""
    goals = db.query(Goal).filter(
        Goal.is_deleted == False,
        Goal.status == GoalStatus.ACTIVE
    ).all()
    
    goals_summary = []
    total_target = 0
    total_current = 0
    
    for g in goals:
        target_amount = g.target_amount if g.target_amount else 0
        current_amount = g.current_amount if g.current_amount else 0
        remaining = target_amount - current_amount
        progress_pct = (current_amount / target_amount * 100) if target_amount > 0 else 0
        
        total_target += target_amount
        total_current += current_amount
        
        goals_summary.append({
            "name": g.name,
            "target_amount": target_amount,
            "current_amount": current_amount,
            "remaining": remaining,
            "progress_pct": progress_pct,
            "deadline": str(g.target_date) if g.target_date else None,
        })
    
    overall_progress = (total_current / total_target * 100) if total_target > 0 else 0
    
    return {
        "active_count": len(goals),
        "total_target": total_target,
        "total_current": total_current,
        "total_remaining": total_target - total_current,
        "overall_progress_pct": overall_progress,
        "goals": goals_summary,
    }


def _build_reminder_summary(db: Session, now: datetime) -> dict:
    """Summarize upcoming reminders/payments within 30 days."""
    from app.models.reminder import Reminder, ReminderStatus
    end_date = now + timedelta(days=30)
    reminders = db.query(Reminder).filter(
        Reminder.due_date <= end_date,
        Reminder.status == ReminderStatus.PENDING,
        Reminder.is_deleted == False
    ).all()
    
    total_amount = sum(r.amount for r in reminders)
    
    return {
        "upcoming_count": len(reminders),
        "total_amount": total_amount,
        "items": [
            {"name": r.name, "amount": r.amount, "due": r.due_date.isoformat()}
            for r in reminders
        ]
    }


def _build_historical_trends(db: Session, now: datetime) -> dict:
    """Compare current month spending with previous 3 months average."""
    current_month_str = now.strftime('%Y-%m')
    
    # Current month expenses
    current_expenses = db.query(Transaction).filter(
        Transaction.date.like(f'{current_month_str}%'),
        Transaction.transaction_type == 'expense',
        Transaction.is_deleted == False
    ).all()
    current_total = sum((t.amount for t in current_expenses), 0)
    
    # Previous 3 months average
    previous_months = []
    for i in range(1, 4):
        month_date = now - timedelta(days=30 * i)
        month_str = month_date.strftime('%Y-%m')
        month_expenses = db.query(Transaction).filter(
            Transaction.date.like(f'{month_str}%'),
            Transaction.transaction_type == 'expense',
            Transaction.is_deleted == False
        ).all()
        month_total = sum((t.amount for t in month_expenses), 0)
        previous_months.append(month_total)
    
    avg_previous = sum(previous_months) / len(previous_months) if previous_months else 0
    
    # Calculate trend
    if avg_previous > 0:
        trend_percent = ((current_total - avg_previous) / avg_previous) * 100
    else:
        trend_percent = 0
    
    return {
        "current_month_total": current_total,
        "previous_3_months_avg": int(avg_previous),
        "trend_percent": round(float(cast(Any, trend_percent)), 1),
        "is_increasing": trend_percent > 10,
        "is_decreasing": trend_percent < -10,
    }


def _get_previous_months_dates(now: datetime, count: int = 3) -> list:
    """Returns a list of tuples (year_month_str, year, month) for the previous count months."""
    months = []
    current_year = now.year
    current_month = now.month
    
    for _ in range(count):
        if current_month == 1:
            current_month = 12
            current_year -= 1
        else:
            current_month -= 1
        months.append((f"{current_year:04d}-{current_month:02d}", current_year, current_month))
    return months


def _build_enhanced_historical_trends(db: Session, now: datetime) -> dict:
    """Calculate historical income/expense averages over the last 3 calendar months."""
    prev_months = _get_previous_months_dates(now, 3)
    
    expenses_by_month = []
    income_by_month = []
    
    for month_str, _, _ in prev_months:
        txns = db.query(Transaction).filter(
            Transaction.date.like(f'{month_str}%'),
            Transaction.is_deleted == False
        ).all()
        
        month_expenses = sum((t.amount for t in txns if t.transaction_type == 'expense'), 0)
        month_income = sum((t.amount for t in txns if t.transaction_type == 'income'), 0)
        
        expenses_by_month.append(month_expenses)
        income_by_month.append(month_income)
        
    avg_expense = sum(expenses_by_month) / len(expenses_by_month) if expenses_by_month else 0
    avg_income = sum(income_by_month) / len(income_by_month) if income_by_month else 0
    
    return {
        "avg_monthly_expense": int(avg_expense),
        "avg_monthly_income": int(avg_income),
    }


def _build_rolling_30d_summary(db: Session, now: datetime) -> dict:
    """Summarize transactions from the last 30 days (rolling window)."""
    start_date = now - timedelta(days=30)
    
    transactions = db.query(Transaction).filter(
        Transaction.date >= start_date,
        Transaction.is_deleted == False
    ).all()
    
    total_income = sum((t.amount for t in transactions if t.transaction_type == 'income'), 0)
    total_expenses = sum((t.amount for t in transactions if t.transaction_type == 'expense'), 0)
    
    category_cache = {}
    expense_by_category = {}
    for t in transactions:
        if t.transaction_type != 'expense':
            continue
        if t.category_id not in category_cache:
            cat = db.query(Category).filter(Category.id == t.category_id).first() if t.category_id else None
            category_cache[t.category_id] = cat.name if cat else "Sin Categoría"
        cat_name = category_cache[t.category_id]
        expense_by_category[cat_name] = expense_by_category.get(cat_name, 0) + t.amount
        
    return {
        "rolling_30d_income": total_income,
        "rolling_30d_expenses": total_expenses,
        "rolling_30d_balance": total_income - total_expenses,
        "rolling_30d_expense_by_category": expense_by_category,
    }


@router.get("/insights")
def get_insights(db: Session = Depends(get_db)):
    # 1. Get Gemini API key from config
    config = db.query(Config).filter(Config.key == 'gemini_api_key').first()
    if not config or not config.value:
        raise HTTPException(
            status_code=400,
            detail="IA en mantenimiento. Configura tu Gemini API Key en la página de Configuración."
        )

    api_key = config.value

    # 2. Configure Gemini with new SDK
    client = genai.Client(api_key=cast(str, api_key))

    # 3. Collect ANONYMOUS financial data (no PII: no names, no account numbers)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    txn_summary = _build_transaction_summary(db, now)
    budget_summary = _build_budget_summary(db, now)
    cc_summary = _build_credit_card_summary(db, now)
    liquidity = _build_liquidity_summary(db)
    debt_summary = _build_debt_share_summary(db, now)
    goals_summary = _build_goals_summary(db)
    
    # Unified Payload calculations
    historical = _build_enhanced_historical_trends(db, now)
    rolling = _build_rolling_30d_summary(db, now)
    
    import calendar
    day_of_month = now.day
    days_in_month = calendar.monthrange(now.year, now.month)[1]
    percentage_elapsed = (day_of_month / days_in_month) * 100
    
    current_daily_burn = txn_summary['total_expenses'] / day_of_month if day_of_month > 0 else 0
    historical_daily_burn = historical['avg_monthly_expense'] / 30
    burn_rate_ratio = current_daily_burn / historical_daily_burn if historical_daily_burn > 0 else 1.0

    # Use the centralized calculation from metrics.py for consistency
    from app.api.metrics import get_safe_to_spend as calc_sts
    sts_data = calc_sts(db)
    safe_to_spend = sts_data.safe_to_spend

    current_month_str = now.strftime('%Y-%m')

    # 4. Build the financial snapshot
    financial_snapshot = f"""
CONTEXTO TEMPORAL Y PROPORCIONAL:
- Día actual del mes: {day_of_month} de {days_in_month} ({percentage_elapsed:.1f}% transcurrido)
- ¿Es inicio de mes?: {"Sí (los ingresos fijos del mes podrían no estar registrados aún, es normal tener saldo temporal negativo)" if day_of_month <= 7 else "No"}
- Ritmo de gasto diario actual: ${current_daily_burn / 100:.2f}/día
- Ritmo de gasto diario histórico: ${historical_daily_burn / 100:.2f}/día
- Comparativa de ritmo de gasto (Burn Rate Ratio): {burn_rate_ratio:.2f}x (1.0x es normal; >1.3x indica velocidad acelerada de gasto este mes)

HISTÓRICO (PROMEDIOS DE LOS ÚLTIMOS 3 MESES):
- Ingreso mensual promedio: ${historical['avg_monthly_income'] / 100:.2f}
- Gasto mensual promedio: ${historical['avg_monthly_expense'] / 100:.2f}

ACTIVIDAD MÓVIL (ÚLTIMOS 30 DÍAS - Usar este Flujo de Caja como la métrica principal para evaluar ingresos y gastos):
- Ingresos de los últimos 30 días: ${rolling['rolling_30d_income'] / 100:.2f}
- Gastos de los últimos 30 días: ${rolling['rolling_30d_expenses'] / 100:.2f}
- Balance de los últimos 30 días: ${rolling['rolling_30d_balance'] / 100:.2f}
- Desglose de gastos por categoría (últimos 30 días):
{json.dumps({k: f"${v/100:.2f}" for k, v in rolling['rolling_30d_expense_by_category'].items()}, indent=2, ensure_ascii=False)}

PRESUPUESTOS DEL MES EN CURSO ({current_month_str}):
"""
    for b in budget_summary:
        status_label = "⚠️ EXCEDIDO" if b['exceeded'] else "OK"
        financial_snapshot += f"- {b['category']}: ${b['spent'] / 100:.2f} / ${b['limit'] / 100:.2f} ({status_label})\n"

    financial_snapshot += f"""
TARJETAS DE CRÉDITO:
- Deuda pendiente total: ${cc_summary['pending_amount'] / 100:.2f}
- Cortes abiertos: {cc_summary['open_statements']}
- Cortes por vencer en 7 días: {cc_summary['statements_due_within_7_days']}

DEUDAS DE TERCEROS (Debt Shares):
- Total pendiente: ${debt_summary['total_pending_debt_shares'] / 100:.2f}
- Cantidad de deudas: {debt_summary['pending_debt_count']}
- Cortes de tarjeta en 7 días: {debt_summary['upcoming_cutoffs_within_7_days']}
- Deudas por persona:
{chr(10).join([f"  - {person}: ${data['total_amount']/100:.2f} ({data['count']} deudas)" for person, data in debt_summary['debts_by_person'].items()]) if debt_summary['debts_by_person'] else '  - Ninguna'}

METAS FINANCIERAS:
- Metas activas: {goals_summary['active_count']}
- Objetivo total: ${goals_summary['total_target'] / 100:.2f}
- Ahorrado actual: ${goals_summary['total_current'] / 100:.2f}
- Restante: ${goals_summary['total_remaining'] / 100:.2f}
- Progreso general: {goals_summary['overall_progress_pct']:.1f}%
- Detalle de metas:
{chr(10).join([f"  - {g['name']}: ${g['current_amount']/100:.2f} / ${g['target_amount']/100:.2f} ({g['progress_pct']:.1f}%)" for g in goals_summary['goals']]) if goals_summary['goals'] else '  - Ninguna meta activa'}

LIQUIDEZ:
- Saldo líquido (checking+savings+cash): ${liquidity['liquid_balance'] / 100:.2f}
- IOUs por cobrar: ${liquidity['ious_receivable'] / 100:.2f}
- Deuda en tarjetas: ${liquidity['credit_card_debt'] / 100:.2f}
- Liquidez neta: ${liquidity['net_liquid'] / 100:.2f}

SAFE-TO-SPEND (Liquidez disponible):
- Safe-to-Spend: ${safe_to_spend / 100:.2f}
"""

    if txn_summary['atypical_transactions']:
        financial_snapshot += "\nTRANSACCIONES ATÍPICAS (montos > 2x el promedio):\n"
        for at in txn_summary['atypical_transactions']:
            financial_snapshot += f"- {at}\n"

    exceeded_budgets = [b for b in budget_summary if b['exceeded']]
    if exceeded_budgets:
        financial_snapshot += "\nPRESUPUESTOS EXCEDIDOS:\n"
        for b in exceeded_budgets:
            overage = b['spent'] - b['limit']
            financial_snapshot += f"- {b['category']}: excedido por ${overage / 100:.2f}\n"

    # 5. User prompt construction
    time_context = get_current_time_context()
    config_persona = db.query(Config).filter(Config.key == 'ai_persona').first()
    persona_value = config_persona.value if config_persona and config_persona.value else "professional"
    persona_instruction = get_persona_prompt(cast(str, persona_value))

    user_prompt = f"""{time_context}
{CORE_RULES}

Analiza el siguiente resumen financiero anónimo y genera insights estratégicos.

REGLAS DE SALIDA:
- "insights": Exactamente 3 consejos accionables (máx 2 oraciones c/u). Prioriza acciones de impacto inmediato.
  - PROHIBIDO dar consejos genéricos como "ahorra más" o "reduce gastos". Cada insight DEBE referenciar un dato real del snapshot (ej: "Tu gasto en Restaurantes subió 40% vs el promedio").
  - Cada insight debe ser específico al contexto numérico del usuario.
- "alerts": 0-3 alertas de liquidez o riesgo (Safe-to-Spend bajo, deudas sin cobrar, cortes próximos). Si no hay riesgo, [] vacío.
  - Cada alerta DEBE incluir el monto específico que genera el riesgo (ej: "Safe-to-Spend negativo: -$125.50").
- "patterns": 0-2 patrones de gasto atípicos detectados. Si no hay, [] vacío.
- REGLA CRÍTICA DE FORMATO: NUNCA uses la palabra "centavos" ni des números en bruto. Todos los valores monetarios deben estar formateados en dólares (ej. "$67.69").

{persona_instruction}

RESUMEN FINANCIERO:
{financial_snapshot}"""

    try:
        response = client.models.generate_content(
            model=REASONING_MODEL,
            contents=cast(Any, [types.Part.from_text(text=user_prompt)]),
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema={
                    "type": "object",
                    "properties": {
                        "insights": {"type": "array", "items": {"type": "string"}},
                        "alerts": {"type": "array", "items": {"type": "string"}},
                        "patterns": {"type": "array", "items": {"type": "string"}}
                    },
                    "required": ["insights", "alerts", "patterns"]
                }
            ),
        )

        result = json.loads((response.text or "{}").strip())

        insights = result.get("insights", [])
        alerts = result.get("alerts", [])
        patterns = result.get("patterns", [])

        # Ensure types
        if not isinstance(insights, list):
            insights = [str(insights)]
        if not isinstance(alerts, list):
            alerts = []
        if not isinstance(patterns, list):
            patterns = []

        return {"insights": insights, "alerts": alerts, "patterns": patterns}

    except errors.APIError as e:
        error_msg = str(e)
        if "quota" in error_msg.lower() or "limit" in error_msg.lower():
            raise HTTPException(
                status_code=503,
                detail="Cuota de IA excedida. El servicio se restablecerá automáticamente. Intenta en unos minutos."
            )
        elif "not found" in error_msg.lower() or "model" in error_msg.lower():
            raise HTTPException(
                status_code=503,
                detail="El modelo de IA no está disponible en este momento. Intenta más tarde."
            )
        else:
            raise HTTPException(
                status_code=503,
                detail=f"Servicio de IA temporalmente no disponible: {error_msg}"
            )
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail="La IA no devolvió un formato válido. Intenta nuevamente."
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error inesperado al generar insights: {str(e)}"
        )


@router.get("/financial-warnings", response_model=FinancialWarningsResponse)
def get_financial_warnings(db: Session = Depends(get_db)):
    """
    DEPRECATED: Use /api-sentinel/health instead.
    This endpoint is kept for backward compatibility but will be removed.
    """
    # 1. Get Gemini API key from config
    config = db.query(Config).filter(Config.key == 'gemini_api_key').first()
    if not config or not config.value:
        raise HTTPException(
            status_code=400,
            detail="IA en mantenimiento. Configura tu Gemini API Key en la página de Configuración."
        )

    api_key = config.value

    # 2. Configure Gemini with new SDK
    client = genai.Client(api_key=cast(str, api_key))

    # 3. Collect compact financial data (optimized for token efficiency)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    liquidity = _build_liquidity_summary(db)
    debt_summary = _build_debt_share_summary(db, now)
    cc_summary = _build_credit_card_summary(db, now)
    subscription_summary = _build_subscription_summary(db, now)
    trends = _build_historical_trends(db, now)
    goals_summary = _build_goals_summary(db)
    budget_summary = _build_budget_summary(db, now)
    
    # Use the centralized calculation from metrics.py for consistency
    from app.api.metrics import get_safe_to_spend as calc_sts
    sts_data = calc_sts(db)
    safe_to_spend = sts_data.safe_to_spend

    # 4. Build compact JSON (short keys, decimal values instead of cents)
    compact_data = {
        "sts": float(safe_to_spend / 100),  # Safe-to-Spend in dollars
        "liq": float(liquidity['net_liquid'] / 100),  # Net liquidity
        "ious": float(liquidity['ious_receivable'] / 100),  # IOUs receivable
        "debt": float(debt_summary['total_pending_debt_shares'] / 100),  # Pending debt shares
        "debt_cnt": debt_summary['pending_debt_count'],
        "debt_by_person": {k: float(v/100) for k, v in {p: d['total_amount'] for p, d in debt_summary['debts_by_person'].items()}.items()},  # Debt by person
        "cc_due": float(cc_summary['pending_amount'] / 100),  # CC pending payments
        "cc_limit": float(cc_summary['total_credit_limit'] / 100),  # Total credit limit
        "cc_util": cc_summary['overall_utilization_pct'],  # Overall utilization %
        "cc_soon": debt_summary['upcoming_cutoffs_within_7_days'],  # Upcoming cutoffs
        "sub_total": float(subscription_summary['monthly_total_estimated'] / 100),  # Monthly subscriptions total
        "sub_upcoming": subscription_summary['upcoming_in_30_days'],  # Subscriptions due in 30 days
        "trend_pct": trends['trend_percent'],  # Spending trend percentage
        "trend_up": trends['is_increasing'],  # Is spending increasing
        "trend_down": trends['is_decreasing'],  # Is spending decreasing
        "goals_cnt": goals_summary['active_count'],  # Active goals count
        "goals_total": float(goals_summary['total_target'] / 100),  # Total goals target
        "goals_curr": float(goals_summary['total_current'] / 100),  # Total goals current
        "goals_prog": goals_summary['overall_progress_pct'],  # Overall goals progress
    }

    # 5. Compact prompt for token efficiency
    # Build detailed debt context for more informative warnings
    debt_context = ""
    if debt_summary['debts_by_person']:
        debt_details = [f"{person}: ${data['total_amount']/100:.2f}" for person, data in debt_summary['debts_by_person'].items()]
        debt_context = f"Detalles de deudas: {', '.join(debt_details)}. "

    user_prompt = f"""Analiza estos datos financieros. Genera un array JSON con objetos:
{{"level": "warning"|"info"|"success", "message": "string descriptiva (máx 100 chars)"}}
Reglas:
- "warning": si Safe-to-Spend (sts) < 0 (NEGATIVO), o deudas pendientes (debt) > 1000, o gastos aumentando >20%, o utilization de tarjetas > 80%
- "info": si Safe-to-Spend entre 0-500, o deudas pendientes > 0, o IOUs pendientes, o suscripciones próximas, o utilization > 50%
- "success": si Safe-to-Spend > 500, sin deudas pendientes, utilization < 50%, y sin riesgos
- Para deudas pendientes: menciona cuántas personas y el monto total aproximado
- Para Safe-to-Spend negativo: menciona el valor exacto
- NO generes alertas sobre "Safe-to-Spend negativo" si el valor es positivo.
- Máx 3 warnings. Prioriza riesgos de liquidez y tendencias negativas.

Contexto adicional: {debt_context}
Datos: {json.dumps(compact_data)}"""

    try:
        response = client.models.generate_content(
            model=REASONING_MODEL,
            contents=cast(Any, [types.Part.from_text(text=user_prompt)]),
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema={
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "level": {"type": "string", "enum": ["warning", "info", "success"]},
                            "message": {"type": "string"}
                        },
                        "required": ["level", "message"]
                    }
                }
            ),
        )

        result = json.loads((response.text or "{}").strip())
        
        # Ensure it's a list
        if not isinstance(result, list):
            result = [result] if isinstance(result, dict) else []

        warnings = [
            FinancialWarning(level=w.get("level", "info"), message=w.get("message", ""))
            for w in result
        ]

        return {"warnings": warnings}

    except errors.APIError as e:
        error_msg = str(e)
        if "quota" in error_msg.lower() or "limit" in error_msg.lower():
            raise HTTPException(
                status_code=503,
                detail="Cuota de IA excedida. Intenta en unos minutos."
            )
        elif "not found" in error_msg.lower() or "model" in error_msg.lower():
            raise HTTPException(
                status_code=503,
                detail="El modelo de IA no está disponible. Intenta más tarde."
            )
        else:
            raise HTTPException(
                status_code=503,
                detail=f"Servicio de IA temporalmente no disponible: {error_msg}"
            )
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail="La IA no devolvió un formato válido."
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error inesperado al generar warnings: {str(e)}"
        )
