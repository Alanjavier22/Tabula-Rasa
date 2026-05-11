from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from app.api.auth import get_current_device
import google.genai as genai
from google.genai import types
from pydantic import BaseModel
from typing import List, Optional
import os
import json
from app.models.config import Config
from app.models.goal import Goal, GoalStatus
from app.api.metrics import get_safe_to_spend

router = APIRouter(
    prefix="/ai/goals", 
    tags=["AI Goals"],
    dependencies=[Depends(get_current_device)]
)

class GoalRecommendation(BaseModel):
    goal_id: str
    goal_name: str
    suggested_transfer_cents: int
    reasoning: str

class SmartGoalResponse(BaseModel):
    recommendations: List[GoalRecommendation]
    total_suggested_cents: int
    summary_message: str

@router.get("/smart-recommendations", response_model=SmartGoalResponse)
def get_smart_goal_recommendations(db: Session = Depends(get_db)):
    config_api = db.query(Config).filter(Config.key == 'gemini_api_key').first()
    if not config_api or not config_api.value:
        raise HTTPException(status_code=400, detail="Gemini API Key not configured")

    client = genai.Client(api_key=config_api.value)

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

    system_instruction = (
        "Eres un Optimizador de Metas Financieras. El usuario tiene un monto 'Safe-to-Spend' (dinero 100% libre de riesgo). "
        "Tu tarea es decidir si sugerir mover parte (o todo) de ese dinero a sus metas financieras activas para acelerarlas. "
        "IMPORTANTE: "
        "1. Devuelve TODOS los montos en CENTAVOS (multiplica por 100 y quita decimales). "
        "2. Para cada meta, calcula el monto restante: target_amount - current_amount. "
        "3. Nunca recomiendes más del monto restante para completar una meta. "
        "4. No excedas el monto 'Safe-to-Spend' total. Es mejor sugerir un % conservador (ej. 50% del sobrante). "
        "5. Sé profesional, conciso y orientado a datos en tus recomendaciones."
    )

    user_prompt = f"""
    Safe-to-Spend actual: ${safe_to_spend_cents / 100:.2f}
    
    Metas Activas:
    {json.dumps(goals_data, indent=2)}
    
    Distribuye una porción responsable del Safe-to-Spend hacia estas metas para acelerarlas.
    """

    try:
        response = client.models.generate_content(
            model="gemini-3.1-flash-lite",
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
        )
        
        result = json.loads(response.text.strip())
        return SmartGoalResponse(**result)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error optimizando metas: {str(e)}")
