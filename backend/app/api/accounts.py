from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
from app.models.account import Account, AccountType
from pydantic import BaseModel, StrictInt

router = APIRouter(prefix="/accounts", tags=["accounts"], redirect_slashes=False)


class AccountBase(BaseModel):
    name: str
    account_type: AccountType
    balance: StrictInt = 0
    currency: str = "USD"
    description: Optional[str] = None
    bank_name: Optional[str] = None
    linked_account_id: Optional[str] = None
    is_active: bool = True


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
    version: int  # FASE 7: OCC versioning

    class Config:
        from_attributes = True


@router.post("/", response_model=AccountResponse)
def create_account(account: AccountCreate, db: Session = Depends(get_db)):
    db_account = Account(**account.dict())
    db.add(db_account)
    db.commit()
    db.refresh(db_account)
    return db_account


@router.get("/", response_model=List[AccountResponse])
def get_accounts(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    accounts = db.query(Account).offset(skip).limit(limit).all()
    return accounts


@router.get("/{account_id}", response_model=AccountResponse)
def get_account(account_id: str, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


@router.put("/{account_id}", response_model=AccountResponse)
def update_account(account_id: str, account: AccountUpdate, db: Session = Depends(get_db)):
    db_account = db.query(Account).filter(Account.id == account_id).first()
    if not db_account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    update_data = account.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_account, key, value)
    
    db.commit()
    db.refresh(db_account)
    return db_account


@router.delete("/{account_id}")
def delete_account(account_id: str, db: Session = Depends(get_db)):
    db_account = db.query(Account).filter(Account.id == account_id).first()
    if not db_account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    db.delete(db_account)
    db.commit()
    return {"message": "Account deleted successfully"}


class SetBalanceRequest(BaseModel):
    balance: StrictInt


@router.post("/{account_id}/set-balance", response_model=AccountResponse)
def set_balance(account_id: str, payload: SetBalanceRequest, db: Session = Depends(get_db)):
    """Force-set account balance to a specific value. Use to sync with reality."""
    db_account = db.query(Account).filter(Account.id == account_id).first()
    if not db_account:
        raise HTTPException(status_code=404, detail="Account not found")
    db_account.balance = payload.balance
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
