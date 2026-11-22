from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from app.models.config import Config
from datetime import datetime, timezone
from google.genai import errors, types
from app.services.ai_models import (
    LITE_MODEL,
    REASONING_MODEL,
    is_transient_gemini_error,
    with_gemini_retry,
)
import json
from pydantic import BaseModel
from typing import Annotated, List, Any, Optional, cast
import logging
from app.services.ai_prompts import get_current_time_context, CORE_RULES, get_persona_prompt
from app.api.ai_shared import get_gemini_key
from app.services.gemini_gateway import create_gemini_client
from app.services.insights_builders import (
    _build_transaction_summary,
    _build_budget_summary,
    _build_credit_card_summary,
    _build_liquidity_summary,
    _build_debt_share_summary,
    _build_goals_summary,
    _build_enhanced_historical_trends,
    _build_rolling_30d_summary,
    _build_recurring_small_expenses,
)

logger = logging.getLogger(__name__)

from app.api.auth import get_current_device

router = APIRouter(
    prefix="/ai", 
    tags=["AI Insights"], 
    dependencies=[Depends(get_current_device)],
    redirect_slashes=False
)

AI_INSIGHTS_ERROR_RESPONSES = {
    400: {"description": "Invalid insights request."},
    500: {"description": "Insights processing failed."},
    503: {"description": "Insights service unavailable."},
}


class InsightsResponse(BaseModel):
    insights: List[str]
    alerts: List[str]
    patterns: List[str]


def _collect_insight_data(db: Session, now: datetime) -> dict:
    import calendar
    from app.api.metrics_cashflow import get_safe_to_spend

    txn_summary = _build_transaction_summary(db, now)
    historical = _build_enhanced_historical_trends(db, now)
    day_of_month = now.day
    days_in_month = calendar.monthrange(now.year, now.month)[1]
    current_daily_burn = txn_summary['total_expenses'] / day_of_month if day_of_month > 0 else 0
    historical_daily_burn = historical['avg_monthly_expense'] / 30
    return {
        "txn_summary": txn_summary,
        "budget_summary": _build_budget_summary(db, now),
        "cc_summary": _build_credit_card_summary(db, now),
        "liquidity": _build_liquidity_summary(db),
        "debt_summary": _build_debt_share_summary(db, now),
        "goals_summary": _build_goals_summary(db),
        "historical": historical,
        "rolling": _build_rolling_30d_summary(db, now),
        "recurring_small": _build_recurring_small_expenses(db, now),
        "day_of_month": day_of_month,
        "days_in_month": days_in_month,
        "percentage_elapsed": (day_of_month / days_in_month) * 100,
        "current_daily_burn": current_daily_burn,
        "historical_daily_burn": historical_daily_burn,
        "burn_rate_ratio": current_daily_burn / historical_daily_burn if historical_daily_burn > 0 else 1.0,
        "safe_to_spend": get_safe_to_spend(db).safe_to_spend,
    }


def _build_financial_snapshot(data: dict, now: datetime) -> str:
    txn_summary = data["txn_summary"]
    budget_summary = data["budget_summary"]
    cc_summary = data["cc_summary"]
    liquidity = data["liquidity"]
    debt_summary = data["debt_summary"]
    goals_summary = data["goals_summary"]
    historical = data["historical"]
    rolling = data["rolling"]
    recurring_small = data["recurring_small"]
    day_of_month = data["day_of_month"]
    days_in_month = data["days_in_month"]
    current_daily_burn = data["current_daily_burn"]
    historical_daily_burn = data["historical_daily_burn"]
    burn_rate_ratio = data["burn_rate_ratio"]
    safe_to_spend = data["safe_to_spend"]
    current_month_str = now.strftime('%Y-%m')

    financial_snapshot = f"""
CONTEXTO TEMPORAL Y PROPORCIONAL:
- Día actual del mes: {day_of_month} de {days_in_month} ({data['percentage_elapsed']:.1f}% transcurrido)
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

GASTOS HORMIGA (recurrentes, últimos 30 días):
{chr(10).join([f"- {g['name']}: {g['occurrences']} veces, ${g['total_amount']/100:.2f} acumulado" for g in recurring_small]) if recurring_small else "- Ninguno detectado"}

PRESUPUESTOS DEL MES EN CURSO ({current_month_str}):
"""
    for budget in budget_summary:
        status_label = "⚠️ EXCEDIDO" if budget['exceeded'] else "OK"
        financial_snapshot += f"- {budget['category']}: ${budget['spent'] / 100:.2f} / ${budget['limit'] / 100:.2f} ({status_label})\n"

    financial_snapshot += f"""
TARJETAS DE CRÉDITO:
- Deuda pendiente total: ${cc_summary['pending_amount'] / 100:.2f}
- Cortes abiertos: {cc_summary['open_statements']}
- Cortes por vencer en 7 días: {cc_summary['statements_due_within_7_days']}

DEUDAS DE TERCEROS (Debt Shares):
- Total pendiente: ${debt_summary['total_pending_debt_shares'] / 100:.2f}
- Cantidad de deudas: {debt_summary['pending_debt_count']}
- Cortes de tarjeta en 7 días: {debt_summary['upcoming_cutoffs_within_7_days']}
- Deudas por tercero (anonimizado):
{chr(10).join([f"  - Tercero {idx}: ${details['total_amount']/100:.2f} ({details['count']} deudas)" for idx, (_person, details) in enumerate(debt_summary['debts_by_person'].items(), start=1)]) if debt_summary['debts_by_person'] else '  - Ninguna'}

METAS FINANCIERAS:
- Metas activas: {goals_summary['active_count']}
- Objetivo total: ${goals_summary['total_target'] / 100:.2f}
- Ahorrado actual: ${goals_summary['total_current'] / 100:.2f}
- Restante: ${goals_summary['total_remaining'] / 100:.2f}
- Progreso general: {goals_summary['overall_progress_pct']:.1f}%
- Detalle de metas:
{chr(10).join([f"  - {goal['name']}: ${goal['current_amount']/100:.2f} / ${goal['target_amount']/100:.2f} ({goal['progress_pct']:.1f}%)" for goal in goals_summary['goals']]) if goals_summary['goals'] else '  - Ninguna meta activa'}

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
        for transaction in txn_summary['atypical_transactions']:
            financial_snapshot += f"- {transaction}\n"

    exceeded_budgets = [budget for budget in budget_summary if budget['exceeded']]
    if exceeded_budgets:
        financial_snapshot += "\nPRESUPUESTOS EXCEDIDOS:\n"
        for budget in exceeded_budgets:
            overage = budget['spent'] - budget['limit']
            financial_snapshot += f"- {budget['category']}: excedido por ${overage / 100:.2f}\n"
    return financial_snapshot


def _build_insights_prompt(db: Session, financial_snapshot: str) -> str:
    config_persona = db.query(Config).filter(Config.key == 'ai_persona').first()
    persona_value = config_persona.value if config_persona and config_persona.value else "professional"
    persona_instruction = get_persona_prompt(cast(str, persona_value))
    return f"""{get_current_time_context()}
{CORE_RULES}

Analiza el siguiente resumen financiero anónimo y genera insights estratégicos.

REGLAS DE SALIDA:
- "insights": Exactamente 3 consejos accionables (máx 2 oraciones c/u). Prioriza acciones de impacto inmediato.
- "alerts": 0-3 alertas de liquidez o riesgo (Safe-to-Spend bajo, deudas sin cobrar, cortes próximos). Si no hay riesgo, [] vacío.
- "patterns": 0-2 patrones de gasto atípicos detectados. Si no hay, [] vacío.
- REGLA CRÍTICA DE FORMATO: NUNCA uses la palabra "centavos" ni des números en bruto. Todos los valores monetarios deben estar formateados en dólares (ej. "$67.69").

{persona_instruction}

RESUMEN FINANCIERO:
{financial_snapshot}"""


def _normalize_insights(result: dict) -> dict:
    insights = result.get("insights", [])
    alerts = result.get("alerts", [])
    patterns = result.get("patterns", [])
    if not isinstance(insights, list):
        insights = [str(insights)]
    if not isinstance(alerts, list):
        alerts = []
    if not isinstance(patterns, list):
        patterns = []
    return {"insights": insights, "alerts": alerts, "patterns": patterns}


_INSIGHTS_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "insights": {"type": "array", "items": {"type": "string"}},
        "alerts": {"type": "array", "items": {"type": "string"}},
        "patterns": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["insights", "alerts", "patterns"],
}


def _build_local_insights_fallback(data: dict) -> dict:
    """Generate deterministic Spanish financial insights when Gemini is temporarily unavailable."""
    liquidity = data.get("liquidity", {})
    rolling = data.get("rolling", {})
    cc_summary = data.get("cc_summary", {})
    budget_summary = data.get("budget_summary", [])
    recurring_small = data.get("recurring_small", [])

    safe_to_spend = float(data.get("safe_to_spend", 0) or 0)
    net_liquid = float(liquidity.get("net_liquid", 0) or 0)
    income_30d = float(rolling.get("rolling_30d_income", 0) or 0)
    expenses_30d = float(rolling.get("rolling_30d_expenses", 0) or 0)
    balance_30d = float(rolling.get("rolling_30d_balance", 0) or 0)
    burn_rate_ratio = float(data.get("burn_rate_ratio", 1.0) or 1.0)

    insights = [
        f"Tu margen disponible actual es de ${safe_to_spend / 100:.2f} con una liquidez neta de ${net_liquid / 100:.2f} (análisis local por alta demanda en IA).",
        f"En los últimos 30 días registras ingresos por ${income_30d / 100:.2f} y gastos por ${expenses_30d / 100:.2f} (flujo neto de ${balance_30d / 100:.2f}).",
        f"Tu ritmo de gasto diario está en {burn_rate_ratio:.2f}x respecto al promedio histórico de los últimos 3 meses.",
    ]

    alerts: List[str] = []
    if safe_to_spend <= 0:
        alerts.append(f"Tu margen seguro para gastar está en ${safe_to_spend / 100:.2f}; prioriza cubrir compromisos fijos antes de nuevos egresos.")
    exceeded = [b.get("category", "Categoría") for b in budget_summary if b.get("exceeded")]
    if exceeded:
        alerts.append(f"Presupuestos excedidos este mes: {', '.join(exceeded[:3])}.")
    due_soon = int(cc_summary.get("statements_due_within_7_days", 0) or 0)
    if due_soon > 0:
        alerts.append(f"Tienes {due_soon} estado(s) de tarjeta por vencer en los próximos 7 días.")

    patterns: List[str] = []
    if recurring_small:
        top_small = recurring_small[0]
        patterns.append(
            f"Gasto hormiga frecuente en {top_small.get('name', 'consumos menores')}: {top_small.get('occurrences', 0)} veces (${float(top_small.get('total_amount', 0)) / 100:.2f})."
        )
    if burn_rate_ratio > 1.3:
        patterns.append("Tu velocidad de gasto actual supera en más de 30% tu promedio mensual habitual.")

    return {"insights": insights[:3], "alerts": alerts[:3], "patterns": patterns[:2]}


def _is_model_fallback_error(error: Exception) -> bool:
    code = getattr(error, "code", None)
    return is_transient_gemini_error(error) or code == 404 or "not found" in str(error).lower()


def _generate_insights_with_model_fallback(client: Any, user_prompt: str) -> Any:
    candidates = list(dict.fromkeys([REASONING_MODEL, LITE_MODEL, "gemini-2.5-flash", "gemini-2.5-flash-lite"]))
    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=_INSIGHTS_RESPONSE_SCHEMA,
    )
    last_error: Optional[errors.APIError] = None
    for index, model_name in enumerate(candidates):
        retries = 2 if index == 0 else 1
        try:
            return with_gemini_retry(
                lambda m=model_name: client.models.generate_content(
                    model=m,
                    contents=cast(Any, [types.Part.from_text(text=user_prompt)]),
                    config=config,
                ),
                max_retries=retries,
            )
        except errors.APIError as err:
            last_error = err
            if not _is_model_fallback_error(err):
                raise
            logger.warning("Insights fallback after %s failed (%s)", model_name, getattr(err, "code", type(err).__name__))
    if last_error is not None:
        raise last_error
    raise RuntimeError("No insight model candidates configured")


def _raise_insights_api_error(error: errors.APIError) -> None:
    error_msg = str(error)
    logger.error(
        "Gemini insights request failed: code=%s type=%s",
        getattr(error, "code", None),
        type(error).__name__,
        exc_info=error,
    )
    if "quota" in error_msg.lower() or "limit" in error_msg.lower():
        detail = "Cuota de IA excedida. El servicio se restablecerá automáticamente. Intenta en unos minutos."
    elif "not found" in error_msg.lower() or "model" in error_msg.lower():
        detail = "El modelo de IA no está disponible en este momento. Intenta más tarde."
    else:
        detail = "Servicio de IA temporalmente no disponible. Intenta nuevamente en unos segundos."
    raise HTTPException(status_code=503, detail=detail)


@router.get("/insights", responses=AI_INSIGHTS_ERROR_RESPONSES)
def get_insights(db: Annotated[Session, Depends(get_db)]):
    api_key = get_gemini_key(db)
    client = create_gemini_client(api_key)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    data = _collect_insight_data(db, now)
    financial_snapshot = _build_financial_snapshot(data, now)
    user_prompt = _build_insights_prompt(db, financial_snapshot)

    try:
        response = _generate_insights_with_model_fallback(client, user_prompt)
        result = json.loads((response.text or "{}").strip())
        return _normalize_insights(result)

    except errors.APIError as e:
        if is_transient_gemini_error(e) or getattr(e, "code", None) in {429, 500, 502, 503, 504}:
            logger.warning("Returning deterministic local insights fallback after Gemini error: %s", getattr(e, "code", e))
            return _build_local_insights_fallback(data)
        _raise_insights_api_error(e)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail="La IA no devolvió un formato válido. Intenta nuevamente."
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="Error inesperado al generar insights. Intenta nuevamente."
        ) from e
