from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from app.api.auth import get_current_device
from google.genai import types
from pydantic import BaseModel
from typing import Annotated, List
from app.services.ai_models import REASONING_MODEL, with_gemini_retry
import json
import logging
from app.api.ai_shared import get_gemini_key
from app.services.gemini_gateway import create_gemini_client
from app.services.ai_prompts import CORE_RULES, get_persona_prompt
from app.models.config import Config
from app.models.goal import Goal, GoalStatus
from app.api.metrics_cashflow import get_safe_to_spend

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/ai/goals", 
    tags=["AI Goals"],
    dependencies=[Depends(get_current_device)]
)
AI_GOALS_ERROR_RESPONSES = {
    400: {"description": "Goal recommendation request is invalid."},
    500: {"description": "Goal recommendation failed."},
}

class GoalRecommendation(BaseModel):
    goal_id: str
    goal_name: str
    suggested_transfer_cents: int
    reasoning: str

class SmartGoalResponse(BaseModel):
    recommendations: List[GoalRecommendation]
    total_suggested_cents: int
    summary_message: str

@router.get("/smart-recommendations", response_model=SmartGoalResponse, responses=AI_GOALS_ERROR_RESPONSES)
def get_smart_goal_recommendations(db: Annotated[Session, Depends(get_db)]):
    api_key = get_gemini_key(db)
    client = create_gemini_client(api_key)

    # Get Safe-to-Spend
    safe_to_spend_response = get_safe_to_spend(db)
    safe_to_spend_cents = safe_to_spend_response.safe_to_spend if hasattr(safe_to_spend_response, 'safe_to_spend') else 0

    # Only recommend if there is a healthy surplus (e.g. > $50)
    if safe_to_spend_cents < 5000:
        return SmartGoalResponse(
            recommendations=[],
            total_suggested_cents=0,
            summary_message="Tu liquidez actual no permite contribuciones extra seguras a tus metas en este momento. Manten el rumbo."
        )

    # Get active goals
    goals = db.query(Goal).filter(Goal.status == GoalStatus.ACTIVE, Goal.is_deleted == False).all()
    if not goals:
        return SmartGoalResponse(
            recommendations=[],
            total_suggested_cents=0,
            summary_message="No tienes metas financieras activas. Crea una meta para que la IA te ayude a optimizarla."
        )

    goals_data = [
        {
            "id": g.id,
            "name": g.name,
            "target_amount": g.target_amount,
            "current_amount": g.current_amount,
            "deadline": str(g.target_date) if g.target_date else "None"
        } for g in goals
    ]

    config_persona = db.query(Config).filter(Config.key == "ai_persona").first()
    persona_value = config_persona.value if config_persona and config_persona.value else "professional"
    persona_instruction = get_persona_prompt(str(persona_value))
    system_instruction = (
        CORE_RULES + "\n\n"
        "Eres un Optimizador de Metas Financieras. El usuario tiene un monto 'Safe-to-Spend' (dinero 100% libre de riesgo). "
        "Tu tarea es decidir si sugerir mover parte (o todo) de ese dinero a sus metas financieras activas para acelerarlas. "
        "IMPORTANTE: "
        "1. Devuelve TODOS los montos en CENTAVOS (multiplica por 100 y quita decimales). "
        "2. Para cada meta, calcula el monto restante: target_amount - current_amount. "
        "3. Nunca recomiendes más del monto restante para completar una meta. "
        "4. No excedas el monto 'Safe-to-Spend' total. Es mejor sugerir un % conservador (ej. 50% del sobrante). "
        "5. Sé conciso y orientado a datos en tus recomendaciones. "
        "6. Aplica este estilo sin cambiar ninguna regla financiera: " + persona_instruction
    )

    user_prompt = f"""
    Safe-to-Spend actual: ${safe_to_spend_cents / 100:.2f}
    
    Metas Activas:
    {json.dumps(goals_data, indent=2)}
    
    Distribuye una porción responsable del Safe-to-Spend hacia estas metas para acelerarlas.
    """

    try:
        response = with_gemini_retry(lambda: client.models.generate_content(
            model=REASONING_MODEL,
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                response_schema={
                    "type": "object",
                    "properties": {
                        "recommendations": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "goal_id": {"type": "string"},
                                    "goal_name": {"type": "string"},
                                    "suggested_transfer_cents": {"type": "integer"},
                                    "reasoning": {"type": "string"}
                                },
                                "required": ["goal_id", "goal_name", "suggested_transfer_cents", "reasoning"]
                            }
                        },
                        "total_suggested_cents": {"type": "integer"},
                        "summary_message": {"type": "string"}
                    },
                    "required": ["recommendations", "total_suggested_cents", "summary_message"]
                }
            )
        ))
        
        response_text = (response.text or "").strip()
        if not response_text:
            response_text = "{}"
        result = json.loads(response_text)
        return SmartGoalResponse(**result)

    except Exception as error:
        logger.exception("Gemini goal recommendation failed")
        raise HTTPException(
            status_code=500,
            detail="No se pudieron generar recomendaciones para tus metas.",
        ) from error
