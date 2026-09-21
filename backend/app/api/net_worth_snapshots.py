from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional, Any, cast
from datetime import datetime, timezone
import json
import os
import google.genai as genai
from database import get_db
from app.services.ai_models import REASONING_MODEL, with_gemini_retry
from app.api.auth import get_current_device
from app.models.net_worth_snapshot import NetWorthSnapshot
from app.models.account import Account
from app.models.iou import IOU, IOUType, IOUStatus
from app.models.config import Config
from app.services.snapshot_reconciler import SnapshotReconciler
from pydantic import BaseModel, ConfigDict

SNAPSHOT_NOT_FOUND = "Snapshot not found"
NOT_FOUND_RESPONSE = {404: {"description": "Snapshot not found"}}
SNAPSHOT_ERROR_RESPONSES = {500: {"description": "Snapshot operation failed."}}

router = APIRouter(
    prefix="/snapshots", 
    tags=["snapshots"], 
    dependencies=[Depends(get_current_device)],
    redirect_slashes=False
)


# Pydantic schemas
class NetWorthSnapshotCreate(BaseModel):
    month: int
    year: int
    metadata_json: Optional[str] = None
    lock: Optional[bool] = False


class NetWorthSnapshotResponse(BaseModel):
    id: str
    month: int
    year: int
    total_assets: int
    total_liabilities: int
    net_worth: int
    snapshot_date: datetime
    metadata_json: Optional[str] = None
    is_stale: bool = False
    is_locked: bool = False

    model_config = ConfigDict(from_attributes=True)


@router.post("/create", response_model=NetWorthSnapshotResponse, responses=SNAPSHOT_ERROR_RESPONSES)
def create_snapshot(
    data: NetWorthSnapshotCreate,
    db: Session = Depends(get_db)
):
    """
    Create or update a Net Worth snapshot.
    """
    from app.services.snapshot_service import SnapshotService
    try:
        return SnapshotService.create_or_update_snapshot(db, data.month, data.year, lock=bool(data.lock))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating snapshot: {str(e)}")


@router.get("/", response_model=List[NetWorthSnapshotResponse])
def get_snapshots(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(NetWorthSnapshot).filter(
        NetWorthSnapshot.is_deleted == False
    ).order_by(
        NetWorthSnapshot.year.desc(), NetWorthSnapshot.month.desc()
    ).offset(skip).limit(limit).all()


@router.get("/{snapshot_id}", response_model=NetWorthSnapshotResponse, responses=NOT_FOUND_RESPONSE)
def get_snapshot(snapshot_id: str, db: Session = Depends(get_db)):
    snapshot = db.query(NetWorthSnapshot).filter(
        NetWorthSnapshot.id == snapshot_id,
        NetWorthSnapshot.is_deleted == False
    ).first()
    if not snapshot:
        raise HTTPException(status_code=404, detail=SNAPSHOT_NOT_FOUND)
    return snapshot


@router.get("/month/{month}/year/{year}", response_model=Optional[NetWorthSnapshotResponse])
def get_snapshot_by_month_year(month: int, year: int, db: Session = Depends(get_db)):
    return db.query(NetWorthSnapshot).filter(
        NetWorthSnapshot.month == month,
        NetWorthSnapshot.year == year,
        NetWorthSnapshot.is_deleted == False
    ).first()


@router.delete("/{snapshot_id}", responses=NOT_FOUND_RESPONSE)
def delete_snapshot(snapshot_id: str, db: Session = Depends(get_db)):
    snapshot = db.query(NetWorthSnapshot).filter(NetWorthSnapshot.id == snapshot_id).first()
    if not snapshot:
        raise HTTPException(status_code=404, detail=SNAPSHOT_NOT_FOUND)
    db.delete(snapshot)
    db.commit()
    return {"message": "Snapshot deleted successfully"}


@router.post("/{snapshot_id}/analyze", responses=NOT_FOUND_RESPONSE)
def analyze_month(snapshot_id: str, db: Session = Depends(get_db)):
    """Analyze a month's snapshot compared to the previous month using Gemini AI."""
    snapshot = db.query(NetWorthSnapshot).filter(NetWorthSnapshot.id == snapshot_id).first()
    if not snapshot:
        raise HTTPException(status_code=404, detail=SNAPSHOT_NOT_FOUND)

    prev_month = snapshot.month - 1 if snapshot.month > 1 else 12
    prev_year = snapshot.year if snapshot.month > 1 else snapshot.year - 1

    previous_snapshot = db.query(NetWorthSnapshot).filter(
        NetWorthSnapshot.month == prev_month, NetWorthSnapshot.year == prev_year
    ).first()

    if not previous_snapshot:
        raise HTTPException(status_code=400, detail="No se encontró el snapshot del mes anterior para comparar.")

    config_api_key = db.query(Config).filter(Config.key == "gemini_api_key").first()
    api_key = config_api_key.value if config_api_key and config_api_key.value else os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=400, detail="Gemini API Key not configured")

    try:
        client = genai.Client(api_key=cast(str, api_key))

        # Values are int centavos; convert to display dollars for prompt
        s_assets = snapshot.total_assets / 100
        s_liab = snapshot.total_liabilities / 100
        s_nw = snapshot.net_worth / 100
        p_assets = previous_snapshot.total_assets / 100
        p_liab = previous_snapshot.total_liabilities / 100
        p_nw = previous_snapshot.net_worth / 100

        changes = {
            "assets_change": s_assets - p_assets,
            "liabilities_change": s_liab - p_liab,
            "net_worth_change": s_nw - p_nw,
            "net_worth_percent_change": ((s_nw - p_nw) / p_nw * 100) if p_nw != 0 else 0
        }

        comparison_data = {
            "current_month": f"{snapshot.month}/{snapshot.year}",
            "previous_month": f"{prev_month}/{prev_year}",
            "current": {
                "total_assets": s_assets, "total_liabilities": s_liab, "net_worth": s_nw,
                "metadata": json.loads(cast(str, snapshot.metadata_json)) if snapshot.metadata_json else {}
            },
            "previous": {
                "total_assets": p_assets, "total_liabilities": p_liab, "net_worth": p_nw,
                "metadata": json.loads(cast(str, previous_snapshot.metadata_json)) if previous_snapshot.metadata_json else {}
            },
            "changes": changes
        }

        prompt = f"""Actúa como mi CFO personal. Analiza mi resumen financiero del mes {snapshot.month}/{snapshot.year} comparado con el mes anterior {prev_month}/{prev_year}.

Datos actuales:
- Activos totales: ${s_assets:.2f}
- Pasivos totales: ${s_liab:.2f}
- Patrimonio neto: ${s_nw:.2f}

Datos mes anterior:
- Activos totales: ${p_assets:.2f}
- Pasivos totales: ${p_liab:.2f}
- Patrimonio neto: ${p_nw:.2f}

Cambios:
- Cambio en activos: ${changes['assets_change']:.2f}
- Cambio en pasivos: ${changes['liabilities_change']:.2f}
- Cambio en patrimonio neto: ${changes['net_worth_change']:.2f} ({changes['net_worth_percent_change']:.2f}%)

Sé directo y conciso. Dame exactamente:
1. 2 puntos positivos basados estrictamente en estos números
2. 2 áreas de alarma/riesgo basadas estrictamente en estos números

Responde en español, máximo 100 palabras."""

        response = with_gemini_retry(lambda: client.models.generate_content(
            model=REASONING_MODEL,
            contents=prompt
        ))
        return {"analysis": response.text, "comparison_data": comparison_data}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analyzing month: {str(e)}")


@router.post("/reconcile", responses=SNAPSHOT_ERROR_RESPONSES)
def reconcile_stale_snapshots(db: Session = Depends(get_db)):
    """
    FASE 2: Reconcile all stale snapshots using verified transaction history.
    Recalculates balances cents-to-cents with Decimal precision and SHA-256 validation.
    """
    try:
        result = SnapshotReconciler.reconcile_stale_snapshots(db)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reconciling snapshots: {str(e)}")


@router.post("/{snapshot_id}/reconcile", responses=NOT_FOUND_RESPONSE)
def reconcile_snapshot(snapshot_id: str, db: Session = Depends(get_db)):
    """
    FASE 2: Reconcile a specific snapshot by ID.
    """
    try:
        result = SnapshotReconciler.reconcile_snapshot_by_id(db, snapshot_id)
        if not result:
            raise HTTPException(status_code=404, detail=SNAPSHOT_NOT_FOUND)
        return {"message": "Snapshot reconciled successfully", "totals": result}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reconciling snapshot: {str(e)}")
        

@router.post("/{snapshot_id}/lock", responses=NOT_FOUND_RESPONSE)
def lock_snapshot(snapshot_id: str, db: Session = Depends(get_db)):
    """Manually lock a snapshot to prevent any further changes."""
    snapshot = db.query(NetWorthSnapshot).filter(NetWorthSnapshot.id == snapshot_id).first()
    if not snapshot:
        raise HTTPException(status_code=404, detail=SNAPSHOT_NOT_FOUND)
    
    snapshot.is_locked = cast(Any, True)
    db.commit()
    return {"message": "Snapshot locked successfully", "id": snapshot_id}
