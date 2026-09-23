from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from app.api.auth import get_current_device
from app.api.ai_shared import get_gemini_key
from app.services.audit_service import AuditService
from pydantic import BaseModel
from typing import Annotated, List

router = APIRouter(
    prefix="/api/ai-audit", 
    tags=["AI Audit"],
    dependencies=[Depends(get_current_device)],
    redirect_slashes=False
)
AI_AUDIT_ERROR_RESPONSES = {400: {"description": "Audit request is invalid."}}

class DuplicateGroup(BaseModel):
    ids: List[str]
    amount: int
    date: str
    descriptions: List[str]

class AuditResponse(BaseModel):
    potential_duplicates: List[DuplicateGroup]
    count: int

@router.get("/duplicates", response_model=AuditResponse, responses=AI_AUDIT_ERROR_RESPONSES)
def get_potential_duplicates(db: Annotated[Session, Depends(get_db)], days: int = 7):
    """
    Escanea transacciones recientes en busca de duplicados semánticos.
    """
    audit = AuditService(db, get_gemini_key(db))
    duplicates = audit.scan_for_duplicates(days=days)
    
    return {
        "potential_duplicates": duplicates,
        "count": len(duplicates)
    }
