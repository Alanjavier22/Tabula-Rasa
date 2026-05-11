from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
from app.api.auth import get_current_device
from app.models.transaction_split import TransactionSplit
from app.models.transaction import Transaction
from app.models.category import Category
from pydantic import BaseModel

router = APIRouter(
    prefix="/transaction-splits", 
    tags=["transaction-splits"], 
    dependencies=[Depends(get_current_device)],
    redirect_slashes=False
)


class TransactionSplitBase(BaseModel):
    transaction_id: str
    amount: int
    category_id: Optional[str] = None
    description: Optional[str] = None


class TransactionSplitCreate(TransactionSplitBase):
    pass


class TransactionSplitUpdate(BaseModel):
    amount: Optional[int] = None
    category_id: Optional[str] = None
    description: Optional[str] = None


class TransactionSplitResponse(BaseModel):
    id: str
    transaction_id: str
    amount: int
    category_id: Optional[str] = None
    description: Optional[str] = None

    class Config:
        from_attributes = True


@router.post("/", response_model=TransactionSplitResponse)
def create_transaction_split(split: TransactionSplitCreate, db: Session = Depends(get_db)):
    # Validate amount is positive
    if split.amount <= 0:
        raise HTTPException(
            status_code=400,
            detail="Split amount must be greater than 0."
        )

    transaction = db.query(Transaction).filter(Transaction.id == split.transaction_id).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if split.category_id:
        if not db.query(Category).filter(Category.id == split.category_id).first():
            raise HTTPException(status_code=404, detail="Category not found")

    existing_splits = db.query(TransactionSplit).filter(
        TransactionSplit.transaction_id == split.transaction_id
    ).all()
    existing_sum = sum((s.amount for s in existing_splits), 0)

    if existing_sum + split.amount > transaction.amount:
        raise HTTPException(
            status_code=400,
            detail=f"Split sum ({existing_sum + split.amount}) exceeds transaction amount ({transaction.amount})"
        )

    db_split = TransactionSplit(**split.dict())
    db.add(db_split)
    db.commit()
    db.refresh(db_split)
    return db_split


@router.get("/", response_model=List[TransactionSplitResponse])
def get_transaction_splits(skip: int = 0, limit: int = 100, transaction_id: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(TransactionSplit)
    if transaction_id:
        query = query.filter(TransactionSplit.transaction_id == transaction_id)
    return query.offset(skip).limit(limit).all()


@router.get("/{split_id}", response_model=TransactionSplitResponse)
def get_transaction_split(split_id: str, db: Session = Depends(get_db)):
    split = db.query(TransactionSplit).filter(TransactionSplit.id == split_id).first()
    if not split:
        raise HTTPException(status_code=404, detail="Transaction split not found")
    return split


@router.put("/{split_id}", response_model=TransactionSplitResponse)
def update_transaction_split(split_id: str, split: TransactionSplitUpdate, db: Session = Depends(get_db)):
    db_split = db.query(TransactionSplit).filter(TransactionSplit.id == split_id).first()
    if not db_split:
        raise HTTPException(status_code=404, detail="Transaction split not found")

    transaction = db.query(Transaction).filter(Transaction.id == db_split.transaction_id).first()

    if split.category_id:
        if not db.query(Category).filter(Category.id == split.category_id).first():
            raise HTTPException(status_code=404, detail="Category not found")

    if split.amount is not None:
        # Validate amount is positive
        if split.amount <= 0:
            raise HTTPException(
                status_code=400,
                detail="Split amount must be greater than 0."
            )

        existing_splits = db.query(TransactionSplit).filter(
            TransactionSplit.transaction_id == db_split.transaction_id,
            TransactionSplit.id != split_id
        ).all()
        existing_sum = sum((s.amount for s in existing_splits), 0)

        if existing_sum + split.amount > transaction.amount:
            raise HTTPException(
                status_code=400,
                detail=f"Split sum ({existing_sum + split.amount}) exceeds transaction amount ({transaction.amount})"
            )

    for key, value in split.dict(exclude_unset=True).items():
        setattr(db_split, key, value)
    db.commit()
    db.refresh(db_split)
    return db_split


@router.delete("/{split_id}")
def delete_transaction_split(split_id: str, db: Session = Depends(get_db)):
    db_split = db.query(TransactionSplit).filter(TransactionSplit.id == split_id).first()
    if not db_split:
        raise HTTPException(status_code=404, detail="Transaction split not found")
    db.delete(db_split)
    db.commit()
    return {"message": "Transaction split deleted successfully"}


@router.post("/batch/{transaction_id}", response_model=List[TransactionSplitResponse])
def create_transaction_splits_batch(
    transaction_id: str,
    splits: List[TransactionSplitCreate],
    db: Session = Depends(get_db)
):
    """Create multiple splits for a transaction in one batch operation."""
    transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Validate each split amount is positive
    for idx, s in enumerate(splits):
        if s.amount <= 0:
            raise HTTPException(
                status_code=400,
                detail=f"splits[{idx}].amount must be greater than 0 (got {s.amount})."
            )

    total_split_amount = sum((s.amount for s in splits), 0)
    txn_amount = transaction.amount

    if total_split_amount != txn_amount:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Split amounts must exactly equal the transaction amount. "
                f"Expected {txn_amount}, got {total_split_amount} "
                f"(difference: {total_split_amount - txn_amount})."
            )
        )

    db.query(TransactionSplit).filter(TransactionSplit.transaction_id == transaction_id).delete()

    created_splits = []
    for split_data in splits:
        split_data.transaction_id = transaction_id
        if split_data.category_id:
            if not db.query(Category).filter(Category.id == split_data.category_id).first():
                raise HTTPException(status_code=404, detail="Category not found")
        db_split = TransactionSplit(**split_data.dict())
        db.add(db_split)
        db.flush()
        created_splits.append(db_split)

    db.commit()
    for split in created_splits:
        db.refresh(split)
    return created_splits
