"""
Simulación de escenarios "What-If" asistida por IA (Oracle Engine) y
generación de sugerencias de escenarios basadas en patrones de gasto
reales. Se monta bajo /api/ai vía api/ai.py.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import List, Optional
import json
import logging
from datetime import datetime, timedelta
import google.genai as genai
from google.genai import types
from app.services.ai_models import REASONING_MODEL
from sqlalchemy.orm import Session
from database import get_db
from app.models.category import Category
from app.models.transaction import Transaction
from app.services.ai_prompts import get_current_time_context, CORE_RULES
from app.api.ai_shared import get_gemini_key, call_gemini_json, TransactionInput

logger = logging.getLogger(__name__)

router = APIRouter()


class WhatIfProjection(BaseModel):
    month: int
    baseline_net_worth: int  # BLINDAJE DE CENTAVOS: int (cents) no float
    projected_net_worth: int  # BLINDAJE DE CENTAVOS: int (cents) no float


class WhatIfScenarioRequest(BaseModel):
    user_prompt: str
    avg_monthly_spend: int  # BLINDAJE DE CENTAVOS: int (cents) no float
    current_net_worth: int  # BLINDAJE DE CENTAVOS: int (cents) no float
    transactions: List[TransactionInput]
    # Additional financial context for better simulations
    monthly_income: int  # BLINDAJE DE CENTAVOS: int (cents) no float
    fixed_expenses: int  # BLINDAJE DE CENTAVOS: int (cents) no float (rent, utilities, etc.)
    total_debt: int  # BLINDAJE DE CENTAVOS: int (cents) no float
    monthly_debt_payment: int  # BLINDAJE DE CENTAVOS: int (cents) no float
    monthly_cash_flow: int  # BLINDAJE DE CENTAVOS: int (cents) no float (income - expenses)
    goals: Optional[List[dict]] = []


class WhatIfScenarioResponse(BaseModel):
    scenario_title: str
    summary: str
    one_time_impact: int = 0 # in cents
    monthly_impact_change: int = 0 # in cents
    impact_type: str = "expense" # "expense", "saving", "investment", "income"
    risk_score: int = 1
    optimization_tip: Optional[str] = None
    projection: List[WhatIfProjection]
    key_assumptions: List[str] = []


class SuggestedScenario(BaseModel):
    title: str
    description: str
    user_prompt: str


class SuggestedScenariosResponse(BaseModel):
    scenarios: List[SuggestedScenario]


class ImpactAnalysis(BaseModel):
    scenario_title: str
    summary: str
    one_time_impact: int
    monthly_impact_change: int
    impact_type: str
    risk_score: int
    estimated_roi_annual: float = 0.0
    optimization_tip: str
    key_assumptions: List[str]
    projection: List[WhatIfProjection]


@router.post("/simulate-what-if", response_model=WhatIfScenarioResponse)
async def simulate_what_if(
    request: WhatIfScenarioRequest,
    db: Session = Depends(get_db)
):
    """
    AI-powered What-If scenario simulation v5.0: The Oracle Engine (Dynamic Projections).
    """
    api_key = get_gemini_key(db)

    time_context = get_current_time_context()
    system_prompt = f"""{time_context}
{CORE_RULES}

You are the 'Financial Oracle Engine'. Your task is to perform a DYNAMIC financial simulation for 12 months.

CURRENT STATE:
- Net Worth: ${request.current_net_worth / 100:,.2f}
- Base Monthly Cash Flow: ${request.monthly_cash_flow / 100:,.2f} (Income - Expenses)
- Avg Monthly Spend: ${request.avg_monthly_spend / 100:,.2f}

FINANCIAL GOALS:
{request.goals if request.goals else "No predefined goals."}

USER SCENARIO:
{request.user_prompt}

YOUR MISSION:
1. 'projection': GENERATE the 12-month net worth projection YOURSELF.
2. 'summary': Professional analysis in SPANISH. Mention impact on GOALS.
3. 'key_assumptions': List 2-3 assumptions you made.

STRICT RULES:
- All money amounts in CENTS.
- The projection MUST have exactly 12 months.
"""

    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=REASONING_MODEL,
            contents=system_prompt,
            config=types.GenerateContentConfig(
                temperature=0.2,
                response_mime_type="application/json",
                response_schema=ImpactAnalysis
            )
        )

        if not response.text:
             raise ValueError("Empty response from Oracle Engine")

        impact_data = json.loads(response.text)
        return WhatIfScenarioResponse(
            scenario_title=impact_data.get("scenario_title", "Simulación Dinámica"),
            summary=impact_data.get("summary", "Sin resumen"),
            one_time_impact=impact_data.get("one_time_impact", 0),
            monthly_impact_change=impact_data.get("monthly_impact_change", 0),
            impact_type=impact_data.get("impact_type", "expense"),
            risk_score=impact_data.get("risk_score", 1),
            optimization_tip=impact_data.get("optimization_tip"),
            projection=impact_data.get("projection", []),
            key_assumptions=impact_data.get("key_assumptions", [])
        )
    except Exception as e:
        logger.error(f"Error in Oracle Engine: {e}")
        return WhatIfScenarioResponse(
            scenario_title="Error de Simulación",
            summary=f"El Motor Oracle no pudo proyectar el escenario: {str(e)}",
            projection=[WhatIfProjection(month=m, baseline_net_worth=request.current_net_worth, projected_net_worth=request.current_net_worth) for m in range(1, 13)]
        )


@router.get("/whatif/suggest-scenarios", response_model=List[SuggestedScenario])
async def suggest_whatif_scenarios(db: Session = Depends(get_db)):
    """
    Genera 3 sugerencias dinámicas de simulación basadas en los patrones de gasto reales.
    """
    api_key = get_gemini_key(db)
    from sqlalchemy import func

    # Obtener top gastos del último mes
    month_ago = datetime.now() - timedelta(days=30)
    top_expenses = db.query(
        Category.name,
        func.sum(Transaction.amount).label("total")
    ).join(Transaction).filter(
        Transaction.date >= month_ago,
        Transaction.transaction_type == "expense",
        Transaction.is_deleted == False
    ).group_by(Category.name).order_by(func.sum(Transaction.amount).desc()).limit(5).all()

    expenses_context = "\n".join([f"- {name}: ${total/100:,.2f}" for name, total in top_expenses])

    system_prompt = f"""
    Eres un estratega financiero experto. Basado en estos gastos reales del último mes, sugiere 3 escenarios 'What-If' (¿Qué pasaría si...?) realistas y significativos para el usuario.

    GASTOS TOP DEL USUARIO:
    {expenses_context}

    REGLAS DE REDACCIÓN Y FORMATO (CRÍTICO):
    1. El título (`title`) debe ser muy breve (máximo 4 palabras), descriptivo y directo (ej: "AHORRO EN COMIDA", "ELIMINAR SUSCRIPCIONES").
    2. La descripción (`description`) debe ser una sola frase corta, directa y sumamente entendible (máximo 15-18 palabras). Di exactamente qué se hace y el beneficio directo sin rodeos teóricos o palabras rebuscadas (ej: "Reducir a la mitad tus compras de ropa para ahorrar $89 al mes e invertir el sobrante").
    3. El campo `user_prompt` debe ser la acción de simulación exacta que se enviará al simulador (ej: "Reducir mi gasto en Compras un 50%").
    4. Toda la salida debe ser en ESPAÑOL.
    """

    try:
        response_data = await call_gemini_json(system_prompt, api_key, response_schema=SuggestedScenariosResponse, model=REASONING_MODEL)
        scenarios = response_data.get("scenarios", [])
        return [SuggestedScenario(**s) if isinstance(s, dict) else s for s in scenarios][:3]
    except Exception as e:
        logger.error(f"Error sugiriendo escenarios: {e}")
        return [
            SuggestedScenario(title="Ahorro en Comida", description="¿Qué pasa si cocino más en casa?", user_prompt="Reducir mi gasto en Restaurantes y Comida un 30%"),
            SuggestedScenario(title="Inversión Mensual", description="Simular inversión recurrente", user_prompt="Invertir $100 adicionales cada mes en un fondo con 8% de retorno"),
            SuggestedScenario(title="Eliminar Suscripciones", description="Limpiar gastos hormiga", user_prompt="Eliminar todas mis suscripciones de streaming y ahorrar ese dinero")
        ]
