from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
from app.api.auth import get_current_device
from app.models.deferred_payment import DeferredPayment
from app.models.account import Account
from pydantic import BaseModel
from typing import List, Optional, Any, cast
from datetime import datetime
import uuid

router = APIRouter(
    prefix="/deferred",
    tags=["deferred"],
    dependencies=[Depends(get_current_device)]
)

class DeferredPaymentBase(BaseModel):
    account_id: str
    name: str
    description: Optional[str] = None
    total_amount: int
    installment_amount: int
    total_installments: int
    current_installment: int = 1
    remaining_balance: int
    is_shared: bool = False
    shared_with: Optional[str] = None
    shared_amount: Optional[int] = None
    start_date: Optional[datetime] = None

class DeferredPaymentCreate(DeferredPaymentBase):
    pass

class DeferredPaymentResponse(DeferredPaymentBase):
    id: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

@router.get("/", response_model=List[DeferredPaymentResponse])
def get_deferred_payments(db: Session = Depends(get_db)):
    return db.query(DeferredPayment).filter(DeferredPayment.is_deleted == False).all()

@router.post("/", response_model=DeferredPaymentResponse)
def create_deferred_payment(payment: DeferredPaymentCreate, db: Session = Depends(get_db)):
    db_payment = DeferredPayment(**payment.model_dump())
    db.add(db_payment)
    db.commit()
    db.refresh(db_payment)
    return db_payment

@router.post("/{payment_id}/advance")
def advance_installment(payment_id: str, db: Session = Depends(get_db)):
    payment = db.query(DeferredPayment).filter(DeferredPayment.id == payment_id, DeferredPayment.is_deleted == False).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Deferred payment not found")
    
    if payment.current_installment >= payment.total_installments:
        payment.is_active = cast(Any, False)
        payment.remaining_balance = cast(Any, 0)
    else:
        payment.current_installment = cast(Any, payment.current_installment + 1)
        payment.remaining_balance = cast(Any, max(0, payment.remaining_balance - payment.installment_amount))
    
    db.commit()
    return {"message": "Installment advanced", "current": payment.current_installment, "remaining": payment.remaining_balance}

@router.delete("/{payment_id}")
def delete_deferred_payment(payment_id: str, db: Session = Depends(get_db)):
    payment = db.query(DeferredPayment).filter(DeferredPayment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Deferred payment not found")
    payment.is_deleted = cast(Any, True)
    db.commit()
    return {"message": "Deleted successfully"}
