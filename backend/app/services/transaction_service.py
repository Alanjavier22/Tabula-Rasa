"""
Transaction service — atomic create/update/delete with strict invariants.

Invariants enforced:
  1. Transaction amount must be > 0 (type determines direction, not sign).
  2. Every split amount must be > 0.
  3. When splits are present, SUM(splits) must EXACTLY equal transaction amount.
  4. Referenced category / account must exist.
"""
from sqlalchemy.orm import Session
from fastapi import HTTPException
from typing import List, Optional
from datetime import datetime, timezone

from app.models.transaction import Transaction, TransactionType
from app.models.transaction_split import TransactionSplit
from app.models.category import Category
from app.models.account import Account
from app.services.balance import apply_transaction_to_balance


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _to_int(value, field_name: str = "amount") -> int:
    """Safely coerce a value to int (centavos), raising HTTP 400 on failure."""
    try:
        return int(value)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid monetary value for '{field_name}': {value!r}"
        )


# ---------------------------------------------------------------------------
# Validation functions
# ---------------------------------------------------------------------------

def validate_positive_amount(amount: int, field_name: str = "amount") -> None:
    """Amount must be strictly positive — direction is conveyed by transaction_type."""
    if amount <= 0:
        raise HTTPException(
            status_code=400,
            detail=(
                f"'{field_name}' must be greater than 0 (got {amount}). "
                "Use transaction_type to distinguish income from expense."
            ),
        )


def validate_category_exists(db: Session, category_id: str) -> bool:
    """Validates that a category exists. Raises HTTPException if not found."""
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail=f"Category {category_id} not found")
    return True


def validate_account_exists(db: Session, account_id: str) -> bool:
    """Validates that an account exists. Raises HTTPException if not found."""
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail=f"Account {account_id} not found")
    return True


def validate_splits(splits: List[dict], transaction_amount: int) -> None:
    """
    Validate a list of split dicts against the parent transaction amount.

    Rules:
      - Each split amount must be > 0.
      - SUM(split amounts) must EXACTLY equal transaction_amount (zero tolerance).
    """
    total = 0
    for idx, split in enumerate(splits):
        split_amount = _to_int(split["amount"], f"splits[{idx}].amount")
        validate_positive_amount(split_amount, f"splits[{idx}].amount")
        total += split_amount

    if total != transaction_amount:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Split amounts must exactly equal the transaction amount. "
                f"Expected {transaction_amount}, got {total} "
                f"(difference: {total - transaction_amount})."
            ),
        )


def create_splits(db: Session, transaction_id: str, splits_data: List[dict]) -> None:
    """Creates transaction splits with validation."""
    for split_data in splits_data:
        # Validate category exists if provided
        if split_data.get("category_id"):
            validate_category_exists(db, split_data["category_id"])

        split = TransactionSplit(
            transaction_id=transaction_id,
            amount=_to_int(split_data["amount"]),
            category_id=split_data.get("category_id"),
            description=split_data.get("description"),
        )
        db.add(split)


# ---------------------------------------------------------------------------
# Main service functions
# ---------------------------------------------------------------------------

def create_transaction_with_splits(
    db: Session,
    transaction_data: dict,
    splits_data: Optional[List[dict]] = None,
) -> Transaction:
    """
    Creates a transaction with optional splits atomically.

    Args:
        db: SQLAlchemy session
        transaction_data: Dictionary with transaction fields
        splits_data: Optional list of split dictionaries

    Returns:
        The created transaction with splits loaded

    Raises:
        HTTPException: If validation fails
    """
    try:
        # --- coerce & validate amount ------------------------------------
        if "amount" in transaction_data:
            transaction_data["amount"] = _to_int(transaction_data["amount"])
        validate_positive_amount(transaction_data["amount"])

        # --- validate references -----------------------------------------
        if transaction_data.get("category_id"):
            validate_category_exists(db, transaction_data["category_id"])
        if transaction_data.get("account_id"):
            validate_account_exists(db, transaction_data["account_id"])

        # --- validate splits before touching the DB ----------------------
        if splits_data:
            validate_splits(splits_data, transaction_data["amount"])

        # --- persist -----------------------------------------------------
        db_transaction = Transaction(**transaction_data)
        db.add(db_transaction)
        db.flush()

        apply_transaction_to_balance(db, db_transaction, reverse=False)

        if splits_data:
            create_splits(db, db_transaction.id, splits_data)

        db.commit()
        db.refresh(db_transaction)
        return db_transaction

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error creating transaction: {str(e)}")


def update_transaction_with_splits(
    db: Session,
    transaction_id: str,
    transaction_data: dict,
    splits_data: Optional[List[dict]] = None,
) -> Transaction:
    """
    Updates a transaction with optional splits atomically.

    Args:
        db: SQLAlchemy session
        transaction_id: ID of transaction to update
        transaction_data: Dictionary with transaction fields to update
        splits_data: Optional list of split dictionaries (replaces all existing splits)

    Returns:
        The updated transaction with splits loaded

    Raises:
        HTTPException: If validation fails or transaction not found
    """
    try:
        db_transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
        if not db_transaction:
            raise HTTPException(status_code=404, detail="Transaction not found")

        # --- coerce & validate amount if being updated -------------------
        if "amount" in transaction_data:
            transaction_data["amount"] = _to_int(transaction_data["amount"])
            validate_positive_amount(transaction_data["amount"])

        # Reverse old transaction effect on balance
        apply_transaction_to_balance(db, db_transaction, reverse=True)

        # Update transaction fields
        for key, value in transaction_data.items():
            setattr(db_transaction, key, value)

        db_transaction.updated_at = datetime.now(timezone.utc)

        # --- validate splits against the (possibly new) amount -----------
        if splits_data is not None:
            db.query(TransactionSplit).filter(
                TransactionSplit.transaction_id == transaction_id
            ).delete()

            if splits_data:
                validate_splits(splits_data, db_transaction.amount)
                create_splits(db, transaction_id, splits_data)

        # Apply new transaction effect on balance
        apply_transaction_to_balance(db, db_transaction, reverse=False)

        db.commit()
        db.refresh(db_transaction)
        return db_transaction

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error updating transaction: {str(e)}")


def delete_transaction_with_balance(db: Session, transaction_id: str) -> dict:
    """
    Deletes a transaction and reverses its effect on account balance.

    Args:
        db: SQLAlchemy session
        transaction_id: ID of transaction to delete

    Returns:
        Success message

    Raises:
        HTTPException: If transaction not found
    """
    db_transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not db_transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Reverse transaction effect on balance before deletion
    apply_transaction_to_balance(db, db_transaction, reverse=True)

    db.delete(db_transaction)
    db.commit()
    return {"message": "Transaction deleted successfully"}
