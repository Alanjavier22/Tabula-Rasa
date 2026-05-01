from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone
import json
import os
import google.genai as genai
from database import get_db
from app.models.net_worth_snapshot import NetWorthSnapshot
from app.models.account import Account
from app.models.iou import IOU, IOUType, IOUStatus
from app.services.snapshot_reconciler import SnapshotReconciler
from pydantic import BaseModel

router = APIRouter(prefix="/snapshots", tags=["snapshots"], redirect_slashes=False)


# Pydantic schemas
class NetWorthSnapshotCreate(BaseModel):
    month: int
    year: int
    metadata_json: Optional[str] = None


class NetWorthSnapshotResponse(BaseModel):
    id: str
    month: int
    year: int
    total_assets: int
    total_liabilities: int
    net_worth: int
    snapshot_date: str
    metadata_json: Optional[str] = None

    class Config:
        from_attributes = True


@router.post("/create", response_model=NetWorthSnapshotResponse)
def create_snapshot(
    data: NetWorthSnapshotCreate,
    db: Session = Depends(get_db)
):
    """
    Create a Net Worth snapshot by capturing current account balances and IOUs.
    This is called when closing a financial month.
    """
    try:
        # Assets: checking + savings + investment
        assets_accounts = db.query(Account).filter(
            Account.is_active == 1,
            Account.account_type.in_(["checking", "savings", "investment"])
        ).all()
        total_assets = sum((acc.balance for acc in assets_accounts), 0)

        # Add pending "they_owe" IOUs to assets (Accounts Receivable)
        they_owe_ious = db.query(IOU).filter(
            IOU.iou_type == IOUType.THEY_OWE,
            IOU.status == IOUStatus.PENDING
        ).all()
        total_assets += sum((i.amount for i in they_owe_ious), 0)

        # Liabilities: credit card debt (negative balances)
        liabilities_accounts = db.query(Account).filter(
            Account.is_active == 1,
            Account.account_type == "credit_card"
        ).all()
        total_liabilities = sum(
            (abs(acc.balance) for acc in liabilities_accounts if acc.balance < 0),
            0
        )

        # Add pending "i_owe" IOUs to liabilities (Debts)
        i_owe_ious = db.query(IOU).filter(
            IOU.iou_type == IOUType.I_OWE,
            IOU.status == IOUStatus.PENDING
        ).all()
        total_liabilities += sum((i.amount for i in i_owe_ious), 0)

        net_worth = total_assets - total_liabilities

        # Build metadata with account details
        accounts_metadata = [
            {
                "id": acc.id,
                "name": acc.name,
                "account_type": acc.account_type,
                "balance": acc.balance,
                "is_active": acc.is_active
            }
            for acc in assets_accounts + liabilities_accounts
        ]

        metadata = {
            "accounts": accounts_metadata,
            "they_owe_ious": len(they_owe_ious),
            "i_owe_ious": len(i_owe_ious),
            "total_they_owe": sum((i.amount for i in they_owe_ious), 0),
            "total_i_owe": sum((i.amount for i in i_owe_ious), 0)
        }

        # Check if snapshot for this month/year already exists
        existing = db.query(NetWorthSnapshot).filter(
            NetWorthSnapshot.month == data.month,
            NetWorthSnapshot.year == data.year
        ).first()

        if existing:
            existing.total_assets = total_assets
            existing.total_liabilities = total_liabilities
            existing.net_worth = net_worth
            existing.snapshot_date = datetime.now(timezone.utc)
            existing.metadata_json = json.dumps(metadata)
            db.commit()
            db.refresh(existing)
            return existing
        else:
            snapshot = NetWorthSnapshot(
                month=data.month,
                year=data.year,
                total_assets=total_assets,
                total_liabilities=total_liabilities,
                net_worth=net_worth,
                snapshot_date=datetime.now(timezone.utc),
                metadata_json=json.dumps(metadata)
            )
            db.add(snapshot)
            db.commit()
            db.refresh(snapshot)
            return snapshot

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating snapshot: {str(e)}")


@router.get("/", response_model=List[NetWorthSnapshotResponse])
def get_snapshots(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(NetWorthSnapshot).order_by(
        NetWorthSnapshot.year.desc(), NetWorthSnapshot.month.desc()
    ).offset(skip).limit(limit).all()


@router.get("/{snapshot_id}", response_model=NetWorthSnapshotResponse)
def get_snapshot(snapshot_id: str, db: Session = Depends(get_db)):
    snapshot = db.query(NetWorthSnapshot).filter(NetWorthSnapshot.id == snapshot_id).first()
    if not snapshot:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return snapshot


@router.get("/month/{month}/year/{year}", response_model=Optional[NetWorthSnapshotResponse])
def get_snapshot_by_month_year(month: int, year: int, db: Session = Depends(get_db)):
    return db.query(NetWorthSnapshot).filter(
        NetWorthSnapshot.month == month, NetWorthSnapshot.year == year
    ).first()


@router.delete("/{snapshot_id}")
def delete_snapshot(snapshot_id: str, db: Session = Depends(get_db)):
    snapshot = db.query(NetWorthSnapshot).filter(NetWorthSnapshot.id == snapshot_id).first()
    if not snapshot:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    db.delete(snapshot)
    db.commit()
    return {"message": "Snapshot deleted successfully"}


@router.post("/{snapshot_id}/analyze")
def analyze_month(snapshot_id: str, db: Session = Depends(get_db)):
    """Analyze a month's snapshot compared to the previous month using Gemini AI."""
    snapshot = db.query(NetWorthSnapshot).filter(NetWorthSnapshot.id == snapshot_id).first()
    if not snapshot:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    prev_month = snapshot.month - 1 if snapshot.month > 1 else 12
    prev_year = snapshot.year if snapshot.month > 1 else snapshot.year - 1

    previous_snapshot = db.query(NetWorthSnapshot).filter(
        NetWorthSnapshot.month == prev_month, NetWorthSnapshot.year == prev_year
    ).first()

    if not previous_snapshot:
        raise HTTPException(status_code=400, detail="No previous month snapshot found for comparison")

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=400, detail="Gemini API Key not configured")

    try:
        genai.configure(api_key=api_key)
        client = genai.Client(api_key=api_key)

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
                "metadata": json.loads(snapshot.metadata_json) if snapshot.metadata_json else {}
            },
            "previous": {
                "total_assets": p_assets, "total_liabilities": p_liab, "net_worth": p_nw,
                "metadata": json.loads(previous_snapshot.metadata_json) if previous_snapshot.metadata_json else {}
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

        response = client.models.generate_content(
            model="gemini-2.0-flash-exp",
            contents=prompt
        )
        return {"analysis": response.text, "comparison_data": comparison_data}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analyzing month: {str(e)}")


@router.post("/reconcile")
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


@router.post("/{snapshot_id}/reconcile")
def reconcile_snapshot(snapshot_id: str, db: Session = Depends(get_db)):
    """
    FASE 2: Reconcile a specific snapshot by ID.
    """
    try:
        result = SnapshotReconciler.reconcile_snapshot_by_id(db, snapshot_id)
        if not result:
            raise HTTPException(status_code=404, detail="Snapshot not found")
        return {"message": "Snapshot reconciled successfully", "totals": result}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reconciling snapshot: {str(e)}")
