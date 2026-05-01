from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db
from app.models.config import Config
from app.models.transaction import Transaction
from app.models.budget import Budget
from app.models.account import Account
from app.models.credit_card_statement import CreditCardStatement
from app.models.category import Category
from app.models.debt_share import DebtShare
from app.models.iou import IOU, IOUType, IOUStatus
from datetime import datetime, timezone, timedelta
import google.genai as genai
from google.genai import errors
import json
from pydantic import BaseModel
from typing import List

router = APIRouter(prefix="/ai", tags=["ai"], redirect_slashes=False)


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
            days_ago = (now - t.date).days if t.date else 0
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
        CreditCardStatement.month == now.month,
        CreditCardStatement.year == now.year
    ).all()

    total_due = 0
    total_paid = 0
    upcoming_due_within_7_days = 0

    for s in statements:
        user_share = s.user_share if s.user_share else 0
        paid = s.amount_paid if s.amount_paid else 0
        total_due += user_share
        total_paid += paid
        if s.payment_due_date and (s.payment_due_date - now).days <= 7:
            upcoming_due_within_7_days += 1

    return {
        "total_statement_due": total_due,
        "total_paid": total_paid,
        "pending_amount": total_due - total_paid,
        "statements_due_within_7_days": upcoming_due_within_7_days,
        "open_statements": len(statements),
    }


def _build_liquidity_summary(db: Session) -> dict:
    """Summarize liquid assets vs near-term obligations."""
    accounts = db.query(Account).filter(Account.is_deleted == False).all()
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
    
    # Get upcoming credit card cutoff dates within 7 days
    statements = db.query(CreditCardStatement).filter(
        CreditCardStatement.is_deleted == False,
        CreditCardStatement.cut_off_date >= now,
        CreditCardStatement.cut_off_date <= now + timedelta(days=7)
    ).all()
    
    upcoming_cutoffs = []
    for s in statements:
        days_until = (s.cut_off_date - now).days
        upcoming_cutoffs.append({
            "days_until_cutoff": days_until,
            "statement_id": s.id,
        })
    
    return {
        "total_pending_debt_shares": total_pending,
        "pending_debt_count": len(pending_debts),
        "upcoming_cutoffs_within_7_days": len(upcoming_cutoffs),
        "upcoming_cutoffs": upcoming_cutoffs[:3],  # Only first 3 for token efficiency
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
    genai.configure(api_key=api_key)
    client = genai.Client(api_key=api_key)

    # 3. Collect ANONYMOUS financial data (no PII: no names, no account numbers)
    now = datetime.now(timezone.utc)
    txn_summary = _build_transaction_summary(db, now)
    budget_summary = _build_budget_summary(db, now)
    cc_summary = _build_credit_card_summary(db, now)
    liquidity = _build_liquidity_summary(db)
    debt_summary = _build_debt_share_summary(db, now)
    
    # Calculate Safe-to-Spend (using the same logic as metrics.py)
    projected_fixed_expenses = sum((b.amount for b in budget_summary), 0)
    pending_cc_payments = cc_summary['pending_amount']
    pending_debt_total = debt_summary['total_pending_debt_shares']
    safe_to_spend = liquidity['net_liquid'] - projected_fixed_expenses - pending_cc_payments - pending_debt_total

    current_month_str = now.strftime('%Y-%m')
    day_of_month = now.day

    # 4. Build the financial snapshot (anonymous, only categories + amounts + relative dates)
    financial_snapshot = f"""
Periodo: {current_month_str} (día {day_of_month} del mes)

FLUJO DE CAJA:
- Ingresos totales: ${txn_summary['total_income'] / 100:.2f}
- Gastos totales: ${txn_summary['total_expenses'] / 100:.2f}
- Balance del mes: ${txn_summary['balance'] / 100:.2f}
- Total de transacciones: {txn_summary['transaction_count']}

DISTRIBUCIÓN DE GASTOS POR CATEGORÍA:
{json.dumps(txn_summary['expense_by_category'], indent=2, ensure_ascii=False)}

PRESUPUESTOS:
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

    # 5. User prompt: solo datos + reglas de output (sin aritmética, el modelo brilla en semántica)
    user_prompt = f"""Analiza el siguiente resumen financiero anónimo. Responde en español.

Reglas:
- "insights": Exactamente 3 consejos accionables (máx 2 oraciones c/u). Prioriza acciones concretas.
- "alerts": 0-3 alertas de liquidez o riesgo SOLO si existen (Safe-to-Spend bajo, deudas pendientes sin cobrar, cortes de tarjeta próximos). Identifica RIESGO DE LIQUIDIDAD si Safe-to-Spend < 0 o si hay deudas pendientes y cortes próximos. Si no hay riesgo, devuelve array vacío.
- "patterns": 0-2 patrones de gasto atípicos detectados (gastos inusuales, categorías desproporcionadas). Si no hay, devuelve array vacío.
- NO realices operaciones aritméticas; confía en los totales ya calculados.

Datos financieros:
{financial_snapshot}"""

    try:
        response = client.models.generate_content(
            model="gemini-2.0-flash-exp",
            contents=user_prompt,
            config=genai.GenerateContentConfig(
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

        result = json.loads(response.text.strip())

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
    # 1. Get Gemini API key from config
    config = db.query(Config).filter(Config.key == 'gemini_api_key').first()
    if not config or not config.value:
        raise HTTPException(
            status_code=400,
            detail="IA en mantenimiento. Configura tu Gemini API Key en la página de Configuración."
        )

    api_key = config.value

    # 2. Configure Gemini with new SDK
    genai.configure(api_key=api_key)
    client = genai.Client(api_key=api_key)

    # 3. Collect compact financial data (optimized for token efficiency)
    now = datetime.now(timezone.utc)
    liquidity = _build_liquidity_summary(db)
    debt_summary = _build_debt_share_summary(db, now)
    cc_summary = _build_credit_card_summary(db, now)
    
    # Calculate Safe-to-Spend
    safe_to_spend = liquidity['net_liquid'] - cc_summary['pending_amount'] - debt_summary['total_pending_debt_shares']

    # 4. Build compact JSON (short keys, decimal values instead of cents)
    compact_data = {
        "sts": safe_to_spend / 100,  # Safe-to-Spend in dollars
        "liq": liquidity['net_liquid'] / 100,  # Net liquidity
        "ious": liquidity['ious_receivable'] / 100,  # IOUs receivable
        "debt": debt_summary['total_pending_debt_shares'] / 100,  # Pending debt shares
        "debt_cnt": debt_summary['pending_debt_count'],
        "cc_due": cc_summary['pending_amount'] / 100,  # CC pending payments
        "cc_soon": debt_summary['upcoming_cutoffs_within_7_days'],  # Upcoming cutoffs
    }

    # 5. Compact prompt for token efficiency
    user_prompt = f"""Analiza estos datos financieros compactos. Genera un array JSON con objetos:
{{"level": "warning"|"info"|"success", "message": "string breve (máx 50 chars)"}}
Reglas:
- "warning": si Safe-to-Spend < 100, o deudas pendientes > 0 con cortes próximos
- "info": si Safe-to-Spend entre 100-500, o IOUs pendientes
- "success": si Safe-to-Spend > 500 y sin riesgos
- Máx 3 warnings. Prioriza riesgos de liquidez.

Datos: {json.dumps(compact_data)}"""

    try:
        response = client.models.generate_content(
            model="gemini-2.0-flash-exp",
            contents=user_prompt,
            config=genai.GenerateContentConfig(
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

        result = json.loads(response.text.strip())
        
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
