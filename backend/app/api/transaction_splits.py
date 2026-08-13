from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional, Any, cast
from database import get_db
from app.api.crud_factory import make_crud_router
from app.models.transaction_split import TransactionSplit
from app.models.transaction import Transaction
from app.models.category import Category
from pydantic import BaseModel


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


def _validate_category(category_id: Optional[str], db: Session) -> None:
    if category_id:
        if not db.query(Category).filter(Category.id == category_id).first():
            raise HTTPException(status_code=404, detail="Category not found")


def _validate_split_sum(transaction: Transaction, new_amount: int, existing_sum: int) -> None:
    if new_amount <= 0:
        raise HTTPException(status_code=400, detail="Split amount must be greater than 0.")
    if existing_sum + new_amount > cast(int, transaction.amount or 0):
        raise HTTPException(
            status_code=400,
            detail=f"Split sum ({existing_sum + new_amount}) exceeds transaction amount ({transaction.amount})"
        )


def _pre_create(payload: TransactionSplitCreate, db: Session) -> None:
    transaction = db.query(Transaction).filter(Transaction.id == payload.transaction_id).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    _validate_category(payload.category_id, db)

    existing_sum = sum(
        (s.amount for s in db.query(TransactionSplit).filter(
            TransactionSplit.transaction_id == payload.transaction_id
        ).all()),
        0
    )
    _validate_split_sum(transaction, payload.amount, existing_sum)


def _pre_update(existing: TransactionSplit, payload: TransactionSplitUpdate, db: Session) -> None:
    transaction = db.query(Transaction).filter(Transaction.id == existing.transaction_id).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    _validate_category(payload.category_id, db)

    if payload.amount is not None:
        existing_sum = sum(
            (s.amount for s in db.query(TransactionSplit).filter(
                TransactionSplit.transaction_id == existing.transaction_id,
                TransactionSplit.id != existing.id
            ).all()),
            0
        )
        _validate_split_sum(transaction, payload.amount, existing_sum)


router: APIRouter = make_crud_router(
    prefix="/transaction-splits",
    tags=["transaction-splits"],
    model=TransactionSplit,
    create_schema=TransactionSplitCreate,
    update_schema=TransactionSplitUpdate,
    response_schema=TransactionSplitResponse,
    entity_name="Transaction split",
    filter_deleted=False,
    include_list=False,
    pre_create=_pre_create,
    pre_update=_pre_update,
)


@router.get("/", response_model=List[TransactionSplitResponse])
def get_transaction_splits(skip: int = 0, limit: int = 100, transaction_id: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(TransactionSplit)
    if transaction_id:
        query = query.filter(TransactionSplit.transaction_id == transaction_id)
    return query.offset(skip).limit(limit).all()


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
        db_split = TransactionSplit(**split_data.model_dump())
        db.add(db_split)
        db.flush()
        created_splits.append(db_split)

    db.commit()
    for split in created_splits:
        db.refresh(split)
    return created_splits
