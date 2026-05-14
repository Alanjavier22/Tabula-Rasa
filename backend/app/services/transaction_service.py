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
        # GOLDEN RULE: Any income to a credit card is an internal payment, not real income.
        if transaction_data.get("transaction_type") == "income" and transaction_data.get("account_id"):
            from app.models.account import Account, AccountType
            account = db.query(Account).filter(Account.id == transaction_data["account_id"]).first()
            if account and account.account_type == AccountType.CREDIT_CARD:
                transaction_data["is_internal"] = True

        db_transaction = Transaction(**transaction_data)
        db.add(db_transaction)
        db.flush()

        apply_transaction_to_balance(db, db_transaction, reverse=False)

        # Cross-payment: detect credit card payments and create mirror transaction
        if db_transaction.account_id:
            from app.services.credit_card_payment import process_cross_payment
            source_account = db.query(Account).filter(Account.id == db_transaction.account_id).first()
            if source_account:
                process_cross_payment(db, db_transaction, source_account)

        if splits_data:
            create_splits(db, db_transaction.id, splits_data)

        # Recalculate goal progress if transaction is assigned to a goal
        if db_transaction.goal_id:
            from app.api.goals import recalculate_goal_progress
            recalculate_goal_progress(db_transaction.goal_id, db)

        # Disparamos la sanación de snapshots si la transacción es del pasado o afecta el histórico
        from app.services.snapshot_service import mark_snapshots_as_stale
        mark_snapshots_as_stale(db, db_transaction.date.month, db_transaction.date.year)

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

        # --- Detect category change and learn pattern ---
        old_category_id = db_transaction.category_id
        new_category_id = transaction_data.get('category_id')
        
        # Update transaction fields
        for key, value in transaction_data.items():
            setattr(db_transaction, key, value)

        db_transaction.updated_at = datetime.now(timezone.utc)
        
        # Learn from user's recategorization (only when category actually changed)
        if new_category_id and new_category_id != old_category_id:
            from app.services.categorizer import learn_category_pattern
            learn_category_pattern(db, db_transaction.description, new_category_id, db_transaction.beneficiary)

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

        # Recalculate goal progress if transaction is assigned to a goal
        # Recalculate both old goal (if changed) and new goal
        old_goal_id = db_transaction.goal_id
        new_goal_id = transaction_data.get("goal_id")
        
        if old_goal_id and old_goal_id != new_goal_id:
            from app.api.goals import recalculate_goal_progress
            recalculate_goal_progress(old_goal_id, db)
        if new_goal_id and new_goal_id != old_goal_id:
            from app.api.goals import recalculate_goal_progress
            recalculate_goal_progress(new_goal_id, db)

        # Disparamos la sanación de snapshots para el mes de la transacción
        from app.services.snapshot_service import mark_snapshots_as_stale
        mark_snapshots_as_stale(db, db_transaction.date.month, db_transaction.date.year)

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

    # Recalculate goal progress if transaction was assigned to a goal
    goal_id = db_transaction.goal_id
    
    # Soft delete: mark as deleted instead of physically deleting
    db_transaction.is_deleted = True
    # Disparamos la sanación de snapshots para el mes de la transacción eliminada
    from app.services.snapshot_service import mark_snapshots_as_stale
    mark_snapshots_as_stale(db, db_transaction.date.month, db_transaction.date.year)

    db.commit()
    
    if goal_id:
        from app.api.goals import recalculate_goal_progress
        recalculate_goal_progress(goal_id, db)
    
    return {"message": "Transaction deleted successfully"}


def get_existing_hashes(db: Session, hashes: List[str]) -> List[str]:
    """
    Recibe una lista de hashes y devuelve solo los que ya existen.
    Utiliza una consulta IN masiva seleccionando únicamente la columna hash.

    Args:
        db: SQLAlchemy session
        hashes: List of transaction hashes to check

    Returns:
        List of hashes that already exist in the database
    """
    if not hashes:
        return []

    # Seleccionamos SOLO la columna hash para máxima eficiencia de memoria
    results = db.query(Transaction.hash).filter(Transaction.hash.in_(hashes)).all()

    # results es una lista de tuplas ej: [("hash1",), ("hash2",)]
    return [result[0] for result in results]
