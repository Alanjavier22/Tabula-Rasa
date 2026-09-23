from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from app.api.auth import get_current_device
from app.models.config import Config
from app.services.sentinel_service import SentinelService
from pydantic import BaseModel, Field
from typing import Annotated, List, Literal, Optional, cast

router = APIRouter(
    prefix="/api/ai-sentinel", 
    tags=["ai-sentinel"], 
    dependencies=[Depends(get_current_device)],
    redirect_slashes=False
)
AI_SENTINEL_ERROR_RESPONSES = {400: {"description": "Sentinel health request is invalid."}}

class SentinelWarning(BaseModel):
    level: str
    message: str


class SentinelBurnAlarm(BaseModel):
    category: str
    spent: float
    expected: float
    remaining: float
    pacing_status: str


class SentinelHealthResponse(BaseModel):
    health_score: int
    status_summary: str
    top_concerns: List[str]
    recommended_action: str
    warnings: List[SentinelWarning]
    alarmas_ritmo_gasto: List[SentinelBurnAlarm] = Field(default_factory=list)
    timestamp: str
    analysis_source: Literal["gemini", "heuristic"]
    ai_error: Optional[str] = None

@router.get("/health", response_model=SentinelHealthResponse, responses=AI_SENTINEL_ERROR_RESPONSES)
async def get_sentinel_health(db: Annotated[Session, Depends(get_db)]):
    """
    Endpoint principal para la burbuja del Agente Sentinel.
    Consolida toda la inteligencia del sistema en un reporte de salud.
    """
    config_persona = db.query(Config).filter(Config.key == 'ai_persona').first()
    persona = config_persona.value if config_persona else "professional"
    
    from app.services.gemini_gateway import get_configured_gemini_key

    sentinel = SentinelService(db, get_configured_gemini_key(db))
    return await sentinel.generate_health_report(persona=cast(str, persona))
