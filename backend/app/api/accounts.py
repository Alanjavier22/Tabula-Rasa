from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, Any, cast
from database import get_db
from app.api.crud_factory import make_crud_router
from app.models.account import Account, AccountType
from pydantic import BaseModel, StrictInt


class AccountBase(BaseModel):
    name: str
    account_type: AccountType
    balance: StrictInt = 0
    currency: str = "USD"
    description: Optional[str] = None
    bank_name: Optional[str] = None
    linked_account_id: Optional[str] = None
    is_active: bool = True
    statement_day: Optional[int] = None
    payment_day: Optional[int] = None


class AccountCreate(AccountBase):
    pass


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    account_type: Optional[AccountType] = None
    balance: Optional[StrictInt] = None
    currency: Optional[str] = None
    description: Optional[str] = None
    bank_name: Optional[str] = None
    linked_account_id: Optional[str] = None
    is_active: Optional[bool] = None
    statement_day: Optional[int] = None
    payment_day: Optional[int] = None


class AccountResponse(BaseModel):
    id: str
    name: str
    account_type: AccountType
    balance: StrictInt
    currency: str
    description: Optional[str] = None
    bank_name: Optional[str] = None
    linked_account_id: Optional[str] = None
    is_active: bool
    statement_day: Optional[int] = None
    payment_day: Optional[int] = None
    version: int  # FASE 7: OCC versioning

    class Config:
        from_attributes = True


router: APIRouter = make_crud_router(
    prefix="/accounts",
    tags=["accounts"],
    model=Account,
    create_schema=AccountCreate,
    update_schema=AccountUpdate,
    response_schema=AccountResponse,
    entity_name="Account",
)


class SetBalanceRequest(BaseModel):
    balance: StrictInt


@router.post("/{account_id}/set-balance", response_model=AccountResponse)
def set_balance(account_id: str, payload: SetBalanceRequest, db: Session = Depends(get_db)):
    """Force-set account balance to a specific value. Use to sync with reality."""
    db_account = db.query(Account).filter(Account.id == account_id).first()
    if not db_account:
        raise HTTPException(status_code=404, detail="Account not found")
    db_account.balance = cast(Any, payload.balance)
    db.commit()
    db.refresh(db_account)
    return db_account


@router.post("/{account_id}/recalculate", response_model=AccountResponse)
def recalculate_balance(account_id: str, initial_balance: int = 0, db: Session = Depends(get_db)):
    """Recalculate balance from initial_balance + sum of all transactions."""
    from app.services.balance import recalculate_account_balance
    db_account = db.query(Account).filter(Account.id == account_id).first()
    if not db_account:
        raise HTTPException(status_code=404, detail="Account not found")
    recalculate_account_balance(db, account_id, initial_balance)
    db.refresh(db_account)
    return db_account
