from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from app.api.auth import get_current_device
from app.models.config import Config
from app.services.audit_service import AuditService
from pydantic import BaseModel
from typing import List

router = APIRouter(
    prefix="/api/ai-audit", 
    tags=["AI Audit"],
    dependencies=[Depends(get_current_device)],
    redirect_slashes=False
)

class DuplicateGroup(BaseModel):
    ids: List[str]
    amount: int
    date: str
    descriptions: List[str]

class AuditResponse(BaseModel):
    potential_duplicates: List[DuplicateGroup]
    count: int

@router.get("/duplicates", response_model=AuditResponse)
def get_potential_duplicates(days: int = 7, db: Session = Depends(get_db)):
    """
    Escanea transacciones recientes en busca de duplicados semánticos.
    """
    config = db.query(Config).filter(Config.key == "gemini_api_key").first()
    if not config or not config.value:
        raise HTTPException(status_code=400, detail="Gemini API Key not configured")
    
    audit = AuditService(db, config.value)
    duplicates = audit.scan_for_duplicates(days=days)
    
    return {
        "potential_duplicates": duplicates,
        "count": len(duplicates)
    }
