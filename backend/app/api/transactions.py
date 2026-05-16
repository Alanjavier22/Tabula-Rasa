from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any, cast
import datetime
from database import get_db
from app.api.auth import get_current_device
from app.models.transaction import Transaction, TransactionType, ExpenseType, PaymentMethod
from app.models.transaction_split import TransactionSplit
from app.models.category import Category
from app.models.account import Account
from app.services.transaction_service import (
    create_transaction_with_splits,
    update_transaction_with_splits,
    delete_transaction_with_balance,
    get_existing_hashes
)
from app.services.transaction_importer import import_transactions
from app.services.ai_background import categorize_transactions_background
from pydantic import BaseModel, StrictInt, field_validator
import pandas as pd
import io

router = APIRouter(
    prefix="/transactions", 
    tags=["transactions"], 
    dependencies=[Depends(get_current_device)],
    redirect_slashes=False
)


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
    date: Optional[datetime.datetime] = None
    category_id: Optional[str] = None
    account_id: Optional[str] = None
    goal_id: Optional[str] = None  # Vinculación con metas para progreso automático
    beneficiary: Optional[str] = None


class TransactionCreate(TransactionBase):
    splits: Optional[List[TransactionSplitCreate]] = None


class TransactionUpdate(BaseModel):
    amount: Optional[StrictInt] = None
    description: Optional[str] = None
    transaction_type: Optional[TransactionType] = None
    expense_type: Optional[ExpenseType] = None
    payment_method: Optional[PaymentMethod] = None
    date: Optional[datetime.datetime] = None
    category_id: Optional[str] = None
    account_id: Optional[str] = None
    goal_id: Optional[str] = None  # Vinculación con metas para progreso automático
    splits: Optional[List[TransactionSplitCreate]] = None
    beneficiary: Optional[str] = None


class ImportTransactionsRequest(BaseModel):
    transactions: List[dict]
    skip_duplicates: bool = True


class DuplicateCheckRequest(BaseModel):
    hashes: List[str]


class DuplicateCheckResponse(BaseModel):
    existing_hashes: List[str]


class TransactionResponse(BaseModel):
    id: str
    amount: StrictInt
    description: str
    transaction_type: str  # Return as string for frontend compatibility
    expense_type: Optional[ExpenseType] = None
    payment_method: PaymentMethod
    date: Optional[datetime.datetime] = None
    category_id: Optional[str] = None
    account_id: Optional[str] = None
    goal_id: Optional[str] = None  # Vinculación con metas para progreso automático
    splits: List[TransactionSplitResponse] = []
    beneficiary: Optional[str] = None
    version: int  # FASE 7: OCC versioning

    @field_validator('transaction_type', mode='before')
    @classmethod
    def normalize_type(cls, v):
        if v is None: return v
        return str(v).lower()

    class Config:
        from_attributes = True


@router.post("/", response_model=TransactionResponse)
def create_transaction(transaction: TransactionCreate, db: Session = Depends(get_db)):
    transaction_data = transaction.model_dump(exclude={'splits'})
    splits_data = [split.model_dump() for split in transaction.splits] if transaction.splits else None
    
    return create_transaction_with_splits(db, transaction_data, splits_data)


@router.get("/", response_model=List[TransactionResponse])
def get_transactions(
    skip: int = 0,
    limit: int = 10000,
    transaction_type: Optional[TransactionType] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Transaction).filter(Transaction.is_deleted == False)
    if transaction_type:
        query = query.filter(Transaction.transaction_type == transaction_type)
    transactions = query.order_by(Transaction.date.desc()).offset(skip).limit(limit).all()
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
    update_data = transaction.model_dump(exclude_unset=True)
    splits_data = [split.model_dump() for split in transaction.splits] if transaction.splits is not None else None
    
    return update_transaction_with_splits(db, transaction_id, update_data, splits_data)


@router.delete("/{transaction_id}")
def delete_transaction(transaction_id: str, db: Session = Depends(get_db)):
    return delete_transaction_with_balance(db, transaction_id)


# FASE 6: Import transactions endpoint with background AI categorization
@router.post("/import-batch")
def import_transactions_endpoint(
    request: ImportTransactionsRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Import a batch of transactions using bulk insert with async AI categorization.
    
    Args:
        request: ImportTransactionsRequest with transactions list and skip_duplicates flag
        background_tasks: FastAPI BackgroundTasks for async AI categorization
        db: Database session
        
    Returns:
        Dictionary with imported_count and message about background categorization
        
    Raises:
        HTTPException 400: If transactions list is empty or validation fails
    """
    try:
        # 1. Bulk insert - ultra-fast single COMMIT
        result = import_transactions(
            db=db,
            transactions=request.transactions,
            skip_duplicates=request.skip_duplicates
        )
        
        # 2. Trigger background AI categorization if transactions were inserted
        inserted_ids = result.get('inserted_ids', [])
        if inserted_ids:
            background_tasks.add_task(categorize_transactions_background, inserted_ids)
        
        return {
            "imported_count": result['imported_count'],
            "message": "Importación exitosa. Categorización en proceso."
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error importing transactions: {str(e)}")


@router.post("/check-duplicates", response_model=DuplicateCheckResponse)
def check_duplicate_transactions(
    request: DuplicateCheckRequest,
    db: Session = Depends(get_db)
):
    """
    Endpoint para verificación masiva de transacciones duplicadas vía hashes.
    """
    # Llama a la función CRUD creada en el paso 2
    existing = get_existing_hashes(db, request.hashes)
    return DuplicateCheckResponse(existing_hashes=existing)

@router.post("/cleanup-duplicates")
def cleanup_duplicate_transactions(db: Session = Depends(get_db)):
    """
    Delete duplicate transactions based on fingerprint (amount + date + account + type).
    Keeps the first occurrence of each duplicate group.
    Recalculates account balances after cleanup.
    """
    try:
        from sqlalchemy import func
        from app.models.transaction import Transaction
        from app.services.balance import recalculate_account_balance
        
        # Find duplicates by grouping on (amount, date, account_id, transaction_type)
        duplicates_query = db.query(
            Transaction.amount,
            func.date(Transaction.date).label('date'),
            Transaction.account_id,
            Transaction.transaction_type,
            func.count(Transaction.id).label('count')
        ).filter(
            Transaction.is_deleted == False
        ).group_by(
            Transaction.amount,
            func.date(Transaction.date),
            Transaction.account_id,
            Transaction.transaction_type
        ).having(
            func.count(Transaction.id) > 1
        ).all()
        
        deleted_count = 0
        affected_accounts = set()
        
        for dup in duplicates_query:
            amount, date, account_id, txn_type, count = dup
            
            # Get all transactions matching this fingerprint
            matching_txs = db.query(Transaction).filter(
                Transaction.amount == amount,
                func.date(Transaction.date) == date,
                Transaction.account_id == account_id,
                Transaction.transaction_type == txn_type,
                Transaction.is_deleted == False
            ).order_by(Transaction.created_at).all()
            
            # Keep the first one, delete the rest
            for tx in matching_txs[1:]:
                tx.is_deleted = cast(Any, True)
                affected_accounts.add(tx.account_id)
                deleted_count += 1
        
        db.commit()
        
        # Recalculate balances for affected accounts
        for account_id in affected_accounts:
            recalculate_account_balance(db, cast(str, account_id))
        
        return {
            "success": True,
            "deleted_count": deleted_count,
            "affected_accounts": len(affected_accounts),
            "message": f"Se eliminaron {deleted_count} transacciones duplicadas y se recalcularon {len(affected_accounts)} saldos de cuenta"
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error limpiando duplicados: {str(e)}")




