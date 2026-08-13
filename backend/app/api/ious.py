from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional, Any, cast
from database import get_db
from app.api.crud_factory import make_crud_router
from app.models.iou import IOU, IOUType, IOUStatus
from app.models.transaction import Transaction
from pydantic import BaseModel
from datetime import datetime


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


def _pre_create(payload: IOUCreate, db: Session) -> None:
    if payload.transaction_id:
        transaction = db.query(Transaction).filter(Transaction.id == payload.transaction_id).first()
        if not transaction:
            raise HTTPException(status_code=404, detail="Transaction not found")


def _register_pending(router: APIRouter) -> None:
    # Debe registrarse antes de GET /{iou_id} - ver nota en crud_factory.py.
    @router.get("/pending", response_model=List[IOUResponse])
    def get_pending_ious(db: Session = Depends(get_db)):
        return db.query(IOU).filter(IOU.is_deleted == False, IOU.status == IOUStatus.PENDING).order_by(IOU.created_at.desc()).all()  # noqa: E712


router: APIRouter = make_crud_router(
    prefix="/ious",
    tags=["ious"],
    model=IOU,
    create_schema=IOUCreate,
    update_schema=IOUUpdate,
    response_schema=IOUResponse,
    entity_name="IOU",
    include_list=False,
    pre_create=_pre_create,
    before_id_routes=_register_pending,
)


@router.get("/", response_model=List[IOUResponse])
def get_ious(skip: int = 0, limit: int = 100, status: Optional[IOUStatus] = None, iou_type: Optional[IOUType] = None, db: Session = Depends(get_db)):
    query = db.query(IOU).filter(IOU.is_deleted == False)  # noqa: E712
    if status:
        query = query.filter(IOU.status == status)
    if iou_type:
        query = query.filter(IOU.iou_type == iou_type)
    return query.order_by(IOU.created_at.desc()).offset(skip).limit(limit).all()


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
        from datetime import timezone
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
