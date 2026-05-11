from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from app.api.auth import get_current_device
from app.models.config import Config
from app.services.sentinel_service import SentinelService
from pydantic import BaseModel
from typing import List

router = APIRouter(
    prefix="/api/ai-sentinel", 
    tags=["ai-sentinel"], 
    dependencies=[Depends(get_current_device)],
    redirect_slashes=False
)

class SentinelWarning(BaseModel):
    level: str
    message: str

class SentinelHealthResponse(BaseModel):
    health_score: int
    status_summary: str
    top_concerns: List[str]
    recommended_action: str
    warnings: List[SentinelWarning]
    timestamp: str

@router.get("/health", response_model=SentinelHealthResponse)
def get_sentinel_health(db: Session = Depends(get_db)):
    """
    Endpoint principal para la burbuja del Agente Sentinel.
    Consolida toda la inteligencia del sistema en un reporte de salud.
    """
    config = db.query(Config).filter(Config.key == "gemini_api_key").first()
    if not config or not config.value:
        raise HTTPException(status_code=400, detail="Gemini API Key not configured")
        
    config_persona = db.query(Config).filter(Config.key == 'ai_persona').first()
    persona = config_persona.value if config_persona else "professional"
    
    sentinel = SentinelService(db, config.value)
    return sentinel.generate_health_report(persona=persona)
