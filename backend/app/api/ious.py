from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional, Any, cast
from database import get_db
from app.api.auth import get_current_device
from app.models.iou import IOU, IOUType, IOUStatus
from app.models.transaction import Transaction
from pydantic import BaseModel

router = APIRouter(
    prefix="/ious", 
    tags=["ious"], 
    dependencies=[Depends(get_current_device)],
    redirect_slashes=False
)


class IOUBase(BaseModel):
    person_name: str
    amount: int
    iou_type: IOUType
    status: IOUStatus = IOUStatus.PENDING
    transaction_id: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[str] = None


class IOUCreate(IOUBase):
    pass


class IOUUpdate(BaseModel):
    person_name: Optional[str] = None
    amount: Optional[int] = None
    status: Optional[IOUStatus] = None
    description: Optional[str] = None
    due_date: Optional[str] = None


from datetime import datetime

class IOUResponse(BaseModel):
    id: str
    person_name: str
    amount: int
    iou_type: IOUType
    status: IOUStatus
    transaction_id: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    version: int  # FASE 7: OCC versioning

    class Config:
        from_attributes = True


@router.post("/", response_model=IOUResponse)
def create_iou(iou: IOUCreate, db: Session = Depends(get_db)):
    if iou.transaction_id:
        transaction = db.query(Transaction).filter(Transaction.id == iou.transaction_id).first()
        if not transaction:
            raise HTTPException(status_code=404, detail="Transaction not found")
    db_iou = IOU(**iou.model_dump())
    db.add(db_iou)
    db.commit()
    db.refresh(db_iou)
    return db_iou


@router.get("/", response_model=List[IOUResponse])
def get_ious(skip: int = 0, limit: int = 100, status: Optional[IOUStatus] = None, iou_type: Optional[IOUType] = None, db: Session = Depends(get_db)):
    query = db.query(IOU).filter(IOU.is_deleted == False)
    if status:
        query = query.filter(IOU.status == status)
    if iou_type:
        query = query.filter(IOU.iou_type == iou_type)
    return query.order_by(IOU.created_at.desc()).offset(skip).limit(limit).all()


@router.get("/pending", response_model=List[IOUResponse])
def get_pending_ious(db: Session = Depends(get_db)):
    return db.query(IOU).filter(IOU.is_deleted == False, IOU.status == IOUStatus.PENDING).order_by(IOU.created_at.desc()).all()


@router.get("/{iou_id}", response_model=IOUResponse)
def get_iou(iou_id: str, db: Session = Depends(get_db)):
    iou = db.query(IOU).filter(IOU.id == iou_id).first()
    if not iou:
        raise HTTPException(status_code=404, detail="IOU not found")
    return iou


@router.put("/{iou_id}", response_model=IOUResponse)
def update_iou(iou_id: str, iou: IOUUpdate, db: Session = Depends(get_db)):
    db_iou = db.query(IOU).filter(IOU.id == iou_id).first()
    if not db_iou:
        raise HTTPException(status_code=404, detail="IOU not found")
    for key, value in iou.model_dump(exclude_unset=True).items():
        setattr(db_iou, key, value)
    db.commit()
    db.refresh(db_iou)
    return db_iou


class IOUSettle(BaseModel):
    account_id: str


@router.post("/{iou_id}/settle")
def settle_iou(iou_id: str, settle_data: IOUSettle, db: Session = Depends(get_db)):
    try:
        db_iou = db.query(IOU).filter(IOU.id == iou_id).first()
        if not db_iou:
            raise HTTPException(status_code=404, detail="IOU not found")
        if db_iou.status == IOUStatus.SETTLED:
            raise HTTPException(status_code=400, detail="IOU is already settled")
        from app.models.account import Account
        account = db.query(Account).filter(Account.id == settle_data.account_id).first()
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")
        db_iou.status = cast(Any, IOUStatus.SETTLED)
        from app.models.transaction import Transaction as Txn, TransactionType, PaymentMethod
        from datetime import datetime, timezone
        from app.services.balance import apply_transaction_to_balance
        income_txn = Txn(
            amount=db_iou.amount,
            description=f"Devolución de IOU: {db_iou.person_name} - {db_iou.description or 'Sin descripción'}",
            transaction_type=TransactionType.INCOME,
            payment_method=PaymentMethod.TRANSFER,
            date=datetime.now(timezone.utc),
            account_id=settle_data.account_id,
        )
        db.add(income_txn)
        db.flush()
        apply_transaction_to_balance(db, income_txn, reverse=False)
        db.commit()
        db.refresh(db_iou)
        return {"message": "IOU settled and income transaction created", "transaction_id": income_txn.id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error settling IOU: {str(e)}")


@router.delete("/{iou_id}")
def delete_iou(iou_id: str, db: Session = Depends(get_db)):
    db_iou = db.query(IOU).filter(IOU.id == iou_id).first()
    if not db_iou:
        raise HTTPException(status_code=404, detail="IOU not found")
    db.delete(db_iou)
    db.commit()
    return {"message": "IOU deleted successfully"}
