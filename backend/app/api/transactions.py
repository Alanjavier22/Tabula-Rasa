from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from database import get_db
from app.models.transaction import Transaction, TransactionType, ExpenseType, PaymentMethod
from app.models.transaction_split import TransactionSplit
from app.models.category import Category
from app.models.account import Account
from app.services.transaction_service import (
    create_transaction_with_splits,
    update_transaction_with_splits,
    delete_transaction_with_balance
)
from pydantic import BaseModel, StrictInt

router = APIRouter(prefix="/transactions", tags=["transactions"], redirect_slashes=False)


# Pydantic schemas
class TransactionSplitCreate(BaseModel):
    amount: StrictInt
    category_id: Optional[str] = None
    description: Optional[str] = None


class TransactionSplitResponse(BaseModel):
    id: str
    transaction_id: str
    amount: StrictInt
    category_id: Optional[str] = None
    description: Optional[str] = None

    class Config:
        from_attributes = True


class TransactionBase(BaseModel):
    amount: StrictInt
    description: str
    transaction_type: TransactionType
    expense_type: Optional[ExpenseType] = None
    payment_method: PaymentMethod
    date: Optional[datetime] = None
    category_id: Optional[str] = None
    account_id: Optional[str] = None


class TransactionCreate(TransactionBase):
    splits: Optional[List[TransactionSplitCreate]] = None


class TransactionUpdate(BaseModel):
    amount: Optional[StrictInt] = None
    description: Optional[str] = None
    transaction_type: Optional[TransactionType] = None
    expense_type: Optional[ExpenseType] = None
    payment_method: Optional[PaymentMethod] = None
    date: Optional[datetime] = None
    category_id: Optional[str] = None
    account_id: Optional[str] = None
    splits: Optional[List[TransactionSplitCreate]] = None


class TransactionResponse(BaseModel):
    id: str
    amount: StrictInt
    description: str
    transaction_type: TransactionType
    expense_type: Optional[ExpenseType] = None
    payment_method: PaymentMethod
    date: Optional[datetime] = None
    category_id: Optional[str] = None
    account_id: Optional[str] = None
    splits: List[TransactionSplitResponse] = []
    version: int  # FASE 7: OCC versioning

    class Config:
        from_attributes = True


@router.post("/", response_model=TransactionResponse)
def create_transaction(transaction: TransactionCreate, db: Session = Depends(get_db)):
    transaction_data = transaction.dict(exclude={'splits'})
    splits_data = [split.dict() for split in transaction.splits] if transaction.splits else None
    
    return create_transaction_with_splits(db, transaction_data, splits_data)


@router.get("/", response_model=List[TransactionResponse])
def get_transactions(
    skip: int = 0,
    limit: int = 100,
    transaction_type: TransactionType = None,
    db: Session = Depends(get_db)
):
    query = db.query(Transaction)
    if transaction_type:
        query = query.filter(Transaction.transaction_type == transaction_type)
    transactions = query.offset(skip).limit(limit).all()
    return transactions


@router.get("/{transaction_id}", response_model=TransactionResponse)
def get_transaction(transaction_id: str, db: Session = Depends(get_db)):
    transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return transaction


@router.put("/{transaction_id}", response_model=TransactionResponse)
def update_transaction(
    transaction_id: str,
    transaction: TransactionUpdate,
    db: Session = Depends(get_db)
):
    update_data = transaction.dict(exclude_unset=True)
    splits_data = [split.dict() for split in transaction.splits] if transaction.splits is not None else None
    
    return update_transaction_with_splits(db, transaction_id, update_data, splits_data)


@router.delete("/{transaction_id}")
def delete_transaction(transaction_id: str, db: Session = Depends(get_db)):
    return delete_transaction_with_balance(db, transaction_id)
