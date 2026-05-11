from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone
from database import get_db
from app.api.auth import get_current_device
from app.models.subscription import Subscription, SubscriptionFrequency
from app.models.account import Account
from app.models.category import Category
from pydantic import BaseModel

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"], dependencies=[Depends(get_current_device)], redirect_slashes=False)


class SubscriptionBase(BaseModel):
    name: str
    amount: int
    frequency: SubscriptionFrequency
    next_billing_date: Optional[datetime] = None
    account_id: Optional[str] = None
    category_id: Optional[str] = None
    is_active: bool = True


class SubscriptionCreate(SubscriptionBase):
    pass


class SubscriptionUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[int] = None
    frequency: Optional[SubscriptionFrequency] = None
    next_billing_date: Optional[datetime] = None
    account_id: Optional[str] = None
    category_id: Optional[str] = None
    is_active: Optional[bool] = None


class SubscriptionResponse(BaseModel):
    id: str
    name: str
    amount: int
    frequency: SubscriptionFrequency
    next_billing_date: Optional[datetime] = None
    account_id: Optional[str] = None
    category_id: Optional[str] = None
    is_active: bool = True
    version: int  # FASE 7: OCC versioning
    class Config:
        from_attributes = True


@router.post("/", response_model=SubscriptionResponse)
def create_subscription(subscription: SubscriptionCreate, db: Session = Depends(get_db)):
    if subscription.account_id:
        if not db.query(Account).filter(Account.id == subscription.account_id).first():
            raise HTTPException(status_code=404, detail="Account not found")
    if subscription.category_id:
        if not db.query(Category).filter(Category.id == subscription.category_id).first():
            raise HTTPException(status_code=404, detail="Category not found")
    db_sub = Subscription(**subscription.dict())
    db.add(db_sub)
    db.commit()
    db.refresh(db_sub)
    return db_sub


@router.get("/", response_model=List[SubscriptionResponse])
def get_subscriptions(skip: int = 0, limit: int = 100, is_active: Optional[bool] = None, db: Session = Depends(get_db)):
    query = db.query(Subscription).filter(Subscription.is_deleted == False)
    if is_active is not None:
        query = query.filter(Subscription.is_active == is_active)
    return query.offset(skip).limit(limit).all()


@router.get("/{subscription_id}", response_model=SubscriptionResponse)
def get_subscription(subscription_id: str, db: Session = Depends(get_db)):
    sub = db.query(Subscription).filter(Subscription.id == subscription_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    return sub


@router.put("/{subscription_id}", response_model=SubscriptionResponse)
def update_subscription(subscription_id: str, subscription: SubscriptionUpdate, db: Session = Depends(get_db)):
    db_sub = db.query(Subscription).filter(Subscription.id == subscription_id).first()
    if not db_sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    if subscription.account_id:
        if not db.query(Account).filter(Account.id == subscription.account_id).first():
            raise HTTPException(status_code=404, detail="Account not found")
    if subscription.category_id:
        if not db.query(Category).filter(Category.id == subscription.category_id).first():
            raise HTTPException(status_code=404, detail="Category not found")
    for key, value in subscription.dict(exclude_unset=True).items():
        setattr(db_sub, key, value)
    db_sub.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(db_sub)
    return db_sub


@router.delete("/{subscription_id}")
def delete_subscription(subscription_id: str, db: Session = Depends(get_db)):
    db_sub = db.query(Subscription).filter(Subscription.id == subscription_id).first()
    if not db_sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    db.delete(db_sub)
    db.commit()
    return {"message": "Subscription deleted successfully"}


@router.post("/{subscription_id}/pay")
def pay_subscription(subscription_id: str, db: Session = Depends(get_db)):
    """
    Mark a subscription as paid:
    1. Create an expense transaction with the subscription's data
    2. Update the linked account balance
    3. Advance next_billing_date to the next cycle
    """
    from app.models.transaction import Transaction, TransactionType, PaymentMethod
    from app.services.balance import apply_transaction_to_balance
    from dateutil.relativedelta import relativedelta

    db_sub = db.query(Subscription).filter(Subscription.id == subscription_id).first()
    if not db_sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    if not db_sub.is_active:
        raise HTTPException(status_code=400, detail="Subscription is not active")

    try:
        # 1. Create expense transaction from subscription data
        txn = Transaction(
            amount=db_sub.amount,
            description=f"Pago suscripción: {db_sub.name}",
            transaction_type=TransactionType.EXPENSE,
            payment_method=PaymentMethod.TRANSFER,
            date=datetime.now(timezone.utc),
            account_id=db_sub.account_id,
            category_id=db_sub.category_id,
        )
        db.add(txn)
        db.flush()

        # 2. Apply to account balance
        if db_sub.account_id:
            apply_transaction_to_balance(db, txn, reverse=False)

        # 3. Advance next_billing_date based on frequency
        if db_sub.next_billing_date:
            freq_delta = {
                SubscriptionFrequency.WEEKLY: relativedelta(weeks=1),
                SubscriptionFrequency.MONTHLY: relativedelta(months=1),
                SubscriptionFrequency.QUARTERLY: relativedelta(months=3),
                SubscriptionFrequency.YEARLY: relativedelta(years=1),
            }
            db_sub.next_billing_date = db_sub.next_billing_date + freq_delta.get(
                db_sub.frequency, relativedelta(months=1)
            )
        else:
            # If no billing date was set, set it to now + frequency
            freq_delta = {
                SubscriptionFrequency.WEEKLY: relativedelta(weeks=1),
                SubscriptionFrequency.MONTHLY: relativedelta(months=1),
                SubscriptionFrequency.QUARTERLY: relativedelta(months=3),
                SubscriptionFrequency.YEARLY: relativedelta(years=1),
            }
            db_sub.next_billing_date = datetime.now(timezone.utc) + freq_delta.get(
                db_sub.frequency, relativedelta(months=1)
            )

        db_sub.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(db_sub)

        return {
            "message": f"Suscripción '{db_sub.name}' marcada como pagada",
            "transaction_id": txn.id,
            "next_billing_date": db_sub.next_billing_date.isoformat() if db_sub.next_billing_date else None,
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al pagar suscripción: {str(e)}")
