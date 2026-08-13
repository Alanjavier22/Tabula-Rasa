from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional, Any, cast
from datetime import datetime, timezone
from database import get_db
from app.api.crud_factory import make_crud_router
from app.models.subscription import Subscription, SubscriptionFrequency
from app.models.account import Account
from app.models.category import Category
from pydantic import BaseModel


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


def _validate_refs(account_id: Optional[str], category_id: Optional[str], db: Session) -> None:
    if account_id:
        if not db.query(Account).filter(Account.id == account_id).first():
            raise HTTPException(status_code=404, detail="Account not found")
    if category_id:
        if not db.query(Category).filter(Category.id == category_id).first():
            raise HTTPException(status_code=404, detail="Category not found")


def _pre_create(payload: SubscriptionCreate, db: Session) -> None:
    _validate_refs(payload.account_id, payload.category_id, db)


def _pre_update(existing: Subscription, payload: SubscriptionUpdate, db: Session) -> None:
    _validate_refs(payload.account_id, payload.category_id, db)
    existing.updated_at = cast(Any, datetime.now(timezone.utc))


router: APIRouter = make_crud_router(
    prefix="/subscriptions",
    tags=["subscriptions"],
    model=Subscription,
    create_schema=SubscriptionCreate,
    update_schema=SubscriptionUpdate,
    response_schema=SubscriptionResponse,
    entity_name="Subscription",
    include_list=False,
    pre_create=_pre_create,
    pre_update=_pre_update,
)


@router.get("/", response_model=List[SubscriptionResponse])
def get_subscriptions(skip: int = 0, limit: int = 100, is_active: Optional[bool] = None, db: Session = Depends(get_db)):
    query = db.query(Subscription).filter(Subscription.is_deleted == False)  # noqa: E712
    if is_active is not None:
        query = query.filter(Subscription.is_active == is_active)
    return query.offset(skip).limit(limit).all()


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
        freq_delta = {
            SubscriptionFrequency.WEEKLY: relativedelta(weeks=1),
            SubscriptionFrequency.MONTHLY: relativedelta(months=1),
            SubscriptionFrequency.QUARTERLY: relativedelta(months=3),
            SubscriptionFrequency.YEARLY: relativedelta(years=1),
        }
        delta = freq_delta.get(cast(SubscriptionFrequency, db_sub.frequency), relativedelta(months=1))
        if db_sub.next_billing_date:
            db_sub.next_billing_date = cast(Any, db_sub.next_billing_date + delta)
        else:
            # If no billing date was set, set it to now + frequency
            db_sub.next_billing_date = cast(Any, datetime.now(timezone.utc) + delta)

        db_sub.updated_at = cast(Any, datetime.now(timezone.utc))
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
