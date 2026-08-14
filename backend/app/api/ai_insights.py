from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from app.models.config import Config
from datetime import datetime, timezone
import google.genai as genai
from google.genai import errors, types
from app.services.ai_models import REASONING_MODEL, with_gemini_retry
import json
from pydantic import BaseModel
from typing import List, Any, cast
from app.services.ai_prompts import get_current_time_context, CORE_RULES, get_persona_prompt
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
    recurring_small = _build_recurring_small_expenses(db, now)
    
    import calendar
    day_of_month = now.day
    days_in_month = calendar.monthrange(now.year, now.month)[1]
    percentage_elapsed = (day_of_month / days_in_month) * 100
    
    current_daily_burn = txn_summary['total_expenses'] / day_of_month if day_of_month > 0 else 0
    historical_daily_burn = historical['avg_monthly_expense'] / 30
    burn_rate_ratio = current_daily_burn / historical_daily_burn if historical_daily_burn > 0 else 1.0

    # Use the centralized calculation from metrics.py for consistency
    from app.api.metrics_cashflow import get_safe_to_spend as calc_sts
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

GASTOS HORMIGA (recurrentes, últimos 30 días):
{chr(10).join([f"- {g['name']}: {g['occurrences']} veces, ${g['total_amount']/100:.2f} acumulado" for g in recurring_small]) if recurring_small else "- Ninguno detectado"}

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
- "alerts": 0-3 alertas de liquidez o riesgo (Safe-to-Spend bajo, deudas sin cobrar, cortes próximos). Si no hay riesgo, [] vacío.
- "patterns": 0-2 patrones de gasto atípicos detectados. Si no hay, [] vacío.
- REGLA CRÍTICA DE FORMATO: NUNCA uses la palabra "centavos" ni des números en bruto. Todos los valores monetarios deben estar formateados en dólares (ej. "$67.69").

{persona_instruction}

RESUMEN FINANCIERO:
{financial_snapshot}"""

    try:
        response = with_gemini_retry(lambda: client.models.generate_content(
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
        ))

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
