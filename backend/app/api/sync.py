from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, case, update
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Any
from datetime import datetime, timezone
import uuid
import dateutil.parser
import logging

logger = logging.getLogger(__name__)

# Batch size for mass migration processing
BATCH_SIZE = 100

from database import get_db
from app.models.device import PairedDevice
from .auth import get_current_device

from app.models.category import Category
from app.models.account import Account
from app.models.transaction import Transaction
from app.models.credit_card_statement import CreditCardStatement
from app.models.transaction_split import TransactionSplit
from app.models.debt_share import DebtShare
from app.models.iou import IOU
from app.models.budget import Budget
from app.models.goal import Goal
from app.models.reminder import Reminder
from app.models.subscription import Subscription

router = APIRouter(prefix="/sync", tags=["Sync"])

# --- Payloads ---
class SyncRequest(BaseModel):
    last_sync_timestamp: Optional[datetime] = None
    changes: Dict[str, List[Dict[str, Any]]] = Field(default_factory=dict)

class SyncResponse(BaseModel):
    server_timestamp: datetime
    changes: Dict[str, List[Dict[str, Any]]]
    processed: List[Dict[str, Optional[str]]] = Field(default_factory=list)  # FASE 2: Array of {id, hash} for handshake


class BatchSyncRequest(BaseModel):
    changes: Dict[str, List[Dict[str, Any]]]
    skip_balance_recalc: bool = False  # For mass migration, recalc at end

# Topological Ordering Definition
# Map table names to SQLAlchemy models
TABLE_MODELS = {
    # Paso 1: Dependencias nulas
    "categories": Category,
    "accounts": Account,
    # Paso 2: Dependen del paso 1
    "transactions": Transaction,
    "credit_card_statements": CreditCardStatement,
    # Paso 3: Dependen del paso 2 o 1
    "transaction_splits": TransactionSplit,
    "debt_shares": DebtShare,
    "ious": IOU,
    "budgets": Budget,
    "goals": Goal,
    "reminders": Reminder,
    "subscriptions": Subscription
}

SYNC_ORDER = [
    ["categories"],
    ["transactions", "credit_card_statements"],
    ["transaction_splits", "debt_shares", "ious", "budgets", "goals", "reminders", "subscriptions"],
    ["accounts"]  # Process accounts LAST so balance is calculated from transactions
]

# Campos que llegan como strings ISO desde el cliente (Dexie/JS Date.toISOString)
# y deben convertirse a datetime UTC antes de persistir.
DATETIME_FIELDS = {
    "created_at", "updated_at", "date", "due_date", "target_date",
    "next_billing_date", "payment_due_date", "cut_off_date", "snapshot_date",
}


def parse_utc(dt_val: Any) -> datetime:
    """Helper to ensure datetime is UTC aware."""
    if isinstance(dt_val, str):
        dt = dateutil.parser.parse(dt_val)
    elif isinstance(dt_val, datetime):
        dt = dt_val
    else:
        return datetime.min.replace(tzinfo=timezone.utc)

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def normalize_record_for_model(model, record: Dict[str, Any]) -> Dict[str, Any]:
    """
    Filtra y convierte un record entrante para que sea seguro pasar a un modelo SQLAlchemy:
    - Solo conserva keys que son columnas del modelo.
    - Convierte strings ISO a datetime para columnas de fecha conocidas.
    """
    valid_columns = {col.name for col in model.__table__.columns}
    cleaned: Dict[str, Any] = {}
    for key, value in record.items():
        if key not in valid_columns:
            continue
        if key in DATETIME_FIELDS and value is not None and not isinstance(value, datetime):
            cleaned[key] = parse_utc(value)
        else:
            cleaned[key] = value
    return cleaned


def recalculate_all_balances(db: Session) -> int:
    """
    Recalculate all account balances in a single efficient operation.
    Use this after mass migration instead of per-record recalculation.
    
    Returns:
        Number of accounts updated
    """
    # Get all active accounts
    accounts = db.query(Account).filter(Account.is_deleted == False).all()
    
    updated_count = 0
    for account in accounts:
        # Calculate balance from all non-deleted transactions
        result = db.query(
            func.sum(
                case(
                    (Transaction.transaction_type == "income", Transaction.amount),
                    else_=-Transaction.amount
                )
            )
        ).filter(
            Transaction.account_id == account.id,
            Transaction.is_deleted == False
        ).scalar()
        
        new_balance = result if result is not None else 0
        
        # Atomic update
        db.query(Account).filter(Account.id == account.id).update(
            {"balance": new_balance},
            synchronize_session=False
        )
        updated_count += 1
    
    return updated_count


@router.post("", response_model=SyncResponse)
def execute_sync(
    payload: SyncRequest,
    device: PairedDevice = Depends(get_current_device),
    db: Session = Depends(get_db)
):
    try:
        # FASE 2: Track processed records for handshake verification
        processed_records: List[Dict[str, str]] = []
        # IDs que acabamos de upsertear en esta misma transacción → no los echo back.
        updated_records_in_this_tx = set()

        # 1. PROCESS INCOMING CHANGES (UPSERT with LWW)
        # FASE 2: Version-based conflict resolution for transactions
        # Track accounts that need balance recalculation
        affected_accounts = set()
        
        for step_tables in SYNC_ORDER:
            for table_name in step_tables:
                if table_name not in payload.changes:
                    continue

                model = TABLE_MODELS[table_name]
                incoming_records = payload.changes[table_name]

                for record in incoming_records:
                    if "id" not in record or "updated_at" not in record:
                        continue

                    record_id = record["id"]
                    incoming_updated_at = parse_utc(record["updated_at"])
                    cleaned = normalize_record_for_model(model, record)

                    # FASE 2: Version-based upsert for transactions (Last-Write-Wins)
                    # FASE 5: Hash-based idempotency check before INSERT
                    if table_name == "transactions":
                        # FASE 5: Check for existing transaction by hash first (idempotency)
                        tx_hash = cleaned.get("hash")
                        if tx_hash:
                            existing_by_hash = db.query(Transaction).filter(
                                Transaction.hash == tx_hash,
                                Transaction.is_deleted == False
                            ).first()
                            
                            if existing_by_hash:
                                # FASE 5: Idempotency - transaction already exists with same hash
                                logger.info(f"[FASE-5] Transaction with hash {tx_hash} already exists, skipping (idempotent)")
                                processed_records.append({"id": existing_by_hash.id, "hash": tx_hash})
                                updated_records_in_this_tx.add(existing_by_hash.id)
                                continue  # Skip to next record
                        
                        existing = db.query(Transaction).filter(Transaction.id == record_id).first()
                        
                        if not existing:
                            # Case 1: Transaction doesn't exist → INSERT
                            logger.info(f"[FASE-2] New transaction {record_id}, inserting")
                            new_txn = Transaction(**cleaned)
                            db.add(new_txn)
                            processed_records.append({"id": record_id, "hash": cleaned.get("hash", "")})
                            updated_records_in_this_tx.add(record_id)
                        else:
                            # Case 2: Transaction exists → version comparison
                            incoming_version = cleaned.get("version", 1)
                            existing_version = existing.version or 1
                            incoming_hash = cleaned.get("hash", "")
                            existing_hash = existing.hash or ""
                            
                            logger.info(f"[FASE-2] Conflict check for {record_id}: incoming v{incoming_version} vs existing v{existing_version}")
                            
                            if incoming_version > existing_version:
                                # Last-Write-Wins: Server accepts client's newer version
                                logger.info(f"[FASE-2] Accepting newer version v{incoming_version} for {record_id}")
                                for key, value in cleaned.items():
                                    if key != "id":
                                        setattr(existing, key, value)
                                processed_records.append({"id": record_id, "hash": incoming_hash})
                                updated_records_in_this_tx.add(record_id)
                            elif incoming_version == existing_version:
                                # Version tie → hash comparison for idempotency
                                if incoming_hash == existing_hash:
                                    # Idempotent retry: safe to ignore
                                    logger.info(f"[FASE-2] Idempotent retry for {record_id} (hash match), skipping")
                                    processed_records.append({"id": record_id, "hash": incoming_hash})
                                else:
                                    # Hash mismatch at same version → conflict
                                    logger.warning(f"[FASE-2] Hash mismatch at v{incoming_version} for {record_id}, marking needs_review")
                                    # Move to Uncategorized (set category_id to null)
                                    existing.category_id = None
                                    existing.needs_review = True
                                    # Apply server data as fallback
                                    for key, value in cleaned.items():
                                        if key != "id":
                                            setattr(existing, key, value)
                                    processed_records.append({"id": record_id, "hash": incoming_hash})
                                    updated_records_in_this_tx.add(record_id)
                            else:
                                # Server has newer version → reject client mutation
                                logger.warning(f"[FASE-2] Rejecting stale version v{incoming_version} for {record_id} (server has v{existing_version})")
                                # Client will download server version in response
                                continue
                    else:
                        # Non-transaction tables: use original LWW logic
                        # Atomic UPSERT using ON CONFLICT DO UPDATE
                        stmt = insert(model).values(**cleaned)
                        
                        # Build update dict for ON CONFLICT (exclude 'id')
                        update_dict = {k: v for k, v in cleaned.items() if k != "id"}
                        
                        # For accounts, exclude 'balance' from update (backend recalc)
                        if table_name == "accounts":
                            update_dict.pop("balance", None)
                        
                        # Apply ON CONFLICT with LWW logic via WHERE clause
                        stmt = stmt.on_conflict_do_update(
                            index_elements=['id'],
                            set_=update_dict,
                            where=(model.updated_at < incoming_updated_at)
                        )
                        
                        db.execute(stmt)
                        updated_records_in_this_tx.add(record_id)
                    
                    # TAREA 2: Initial Balance Bug - Create initial transaction for new accounts with non-zero balance
                    if table_name == "accounts":
                        initial_balance = cleaned.get("balance", 0)
                        # Check if this is a new account (no existing record before this upsert)
                        existing = db.query(model).filter(model.id == record_id).first()
                        if existing and initial_balance != 0:
                            # Check if we already created the initial transaction
                            existing_tx = db.query(Transaction).filter(
                                Transaction.account_id == record_id,
                                Transaction.description == "Saldo Inicial"
                            ).first()
                            if not existing_tx:
                                init_tx = Transaction(
                                    id=str(uuid.uuid4()),
                                    account_id=cleaned["id"],
                                    amount=abs(initial_balance),
                                    description="Saldo Inicial",
                                    transaction_type="income" if initial_balance > 0 else "expense",
                                    payment_method="other",
                                    date=cleaned.get("created_at", datetime.now(timezone.utc)),
                                    is_deleted=False,
                                    created_at=cleaned.get("created_at", datetime.now(timezone.utc)),
                                    updated_at=cleaned.get("created_at", datetime.now(timezone.utc))
                                )
                                db.add(init_tx)
                                affected_accounts.add(cleaned["id"])
                    
                    # Track account for balance recalculation
                    if table_name == "transactions" and "account_id" in cleaned:
                        affected_accounts.add(cleaned["account_id"])
        # 2. RECALCULATE BALANCES FOR AFFECTED ACCOUNTS
        # Backend is the source of truth for balances
        for account_id in affected_accounts:
            if not account_id:
                continue
            # Calculate balance from all non-deleted transactions
            result = db.query(
                func.sum(
                    case(
                        (Transaction.transaction_type == "income", Transaction.amount),
                        else_=-Transaction.amount
                    )
                )
            ).filter(
                Transaction.account_id == account_id,
                Transaction.is_deleted == False
            ).scalar()
            
            new_balance = result if result is not None else 0
            
            # Atomic update of account balance
            db.query(Account).filter(Account.id == account_id).update(
                {"balance": new_balance},
                synchronize_session=False
            )
            
            # Mark this account as updated so it gets returned to client
            updated_records_in_this_tx.add(account_id)

        # 3. COLLECT OUTGOING CHANGES (registros modificados desde last_sync que NO acabamos de upsert)
        outgoing_changes: Dict[str, List[Dict[str, Any]]] = {}
        last_sync = (
            parse_utc(payload.last_sync_timestamp)
            if payload.last_sync_timestamp
            else datetime.min.replace(tzinfo=timezone.utc)
        )

        for table_name, model in TABLE_MODELS.items():
            if not hasattr(model, "updated_at"):
                continue

            # SQLite guarda DateTime sin tz → comparamos en Python tras parse_utc para robustez.
            records = db.query(model).all()
            table_outgoing: List[Dict[str, Any]] = []
            for rec in records:
                rec_updated_at = parse_utc(getattr(rec, "updated_at", None))
                if rec_updated_at > last_sync and rec.id not in updated_records_in_this_tx:
                    rec_dict = {col.name: getattr(rec, col.name) for col in rec.__table__.columns}
                    table_outgoing.append(rec_dict)

            if table_outgoing:
                outgoing_changes[table_name] = table_outgoing

        # 3. COMMIT AND RESPOND
        server_timestamp = datetime.now(timezone.utc)
        device.last_sync = server_timestamp
        db.commit()

        logger.info(f"[FASE-2] Sync complete: processed {len(processed_records)} records")
        return SyncResponse(
            server_timestamp=server_timestamp,
            changes=outgoing_changes,
            processed=processed_records,  # FASE 2: Return handshake verification
        )

    except Exception as e:
        db.rollback()
        print(f"Sync Engine Error: {e}")
        raise HTTPException(status_code=500, detail=f"Error in sync transaction: {e}")


@router.post("/batch", response_model=SyncResponse)
def execute_batch_sync(
    payload: BatchSyncRequest,
    device: PairedDevice = Depends(get_current_device),
    db: Session = Depends(get_db)
):
    """
    Batch sync endpoint for mass migration.
    Processes records in batches of 100 with single transaction per batch.
    Use skip_balance_recalc=True during migration, then call recalculate_all_balances() once at end.
    """
    try:
        updated_records_in_this_tx = set()
        affected_accounts = set()
        
        # Process in batches of BATCH_SIZE (100)
        for step_tables in SYNC_ORDER:
            for table_name in step_tables:
                if table_name not in payload.changes:
                    continue
                
                model = TABLE_MODELS[table_name]
                incoming_records = payload.changes[table_name]
                
                # Split into batches
                for i in range(0, len(incoming_records), BATCH_SIZE):
                    batch = incoming_records[i:i + BATCH_SIZE]
                    
                    # Single transaction per batch
                    try:
                        for record in batch:
                            if "id" not in record or "updated_at" not in record:
                                continue
                            
                            record_id = record["id"]
                            incoming_updated_at = parse_utc(record["updated_at"])
                            cleaned = normalize_record_for_model(model, record)
                            
                            # Atomic UPSERT
                            stmt = insert(model).values(**cleaned)
                            update_dict = {k: v for k, v in cleaned.items() if k != "id"}
                            
                            if table_name == "accounts":
                                update_dict.pop("balance", None)
                            
                            stmt = stmt.on_conflict_do_update(
                                index_elements=['id'],
                                set_=update_dict,
                                where=(model.updated_at < incoming_updated_at)
                            )
                            
                            db.execute(stmt)
                            updated_records_in_this_tx.add(record_id)
                            
                            if table_name == "transactions" and "account_id" in cleaned:
                                affected_accounts.add(cleaned["account_id"])
                        
                        # Commit after each batch
                        db.commit()
                    except Exception as e:
                        db.rollback()
                        print(f"Batch error (records {i}-{i+len(batch)}): {e}")
                        raise
        
        # Recalculate balances only if not skipped
        if not payload.skip_balance_recalc:
            for account_id in affected_accounts:
                if not account_id:
                    continue
                result = db.query(
                    func.sum(
                        case(
                            (Transaction.transaction_type == "income", Transaction.amount),
                            else_=-Transaction.amount
                        )
                    )
                ).filter(
                    Transaction.account_id == account_id,
                    Transaction.is_deleted == False
                ).scalar()
                
                new_balance = result if result is not None else 0
                db.query(Account).filter(Account.id == account_id).update(
                    {"balance": new_balance},
                    synchronize_session=False
                )
        
        # Collect outgoing changes
        outgoing_changes: Dict[str, List[Dict[str, Any]]] = {}
        last_sync = datetime.min.replace(tzinfo=timezone.utc)
        
        for table_name, model in TABLE_MODELS.items():
            if not hasattr(model, "updated_at"):
                continue
            
            records = db.query(model).all()
            table_outgoing: List[Dict[str, Any]] = []
            for rec in records:
                rec_updated_at = parse_utc(getattr(rec, "updated_at", None))
                if rec_updated_at > last_sync and rec.id not in updated_records_in_this_tx:
                    rec_dict = {col.name: getattr(rec, col.name) for col in rec.__table__.columns}
                    table_outgoing.append(rec_dict)
            
            if table_outgoing:
                outgoing_changes[table_name] = table_outgoing
        
        server_timestamp = datetime.now(timezone.utc)
        device.last_sync = server_timestamp
        db.commit()
        
        return SyncResponse(
            server_timestamp=server_timestamp,
            changes=outgoing_changes,
        )
        
    except Exception as e:
        db.rollback()
        print(f"Batch Sync Error: {e}")
        raise HTTPException(status_code=500, detail=f"Error in batch sync: {e}")


@router.post("/recalculate-balances")
def trigger_balance_recalculation(
    device: PairedDevice = Depends(get_current_device),
    db: Session = Depends(get_db)
):
    """
    Trigger recalculation of all account balances.
    Call this after mass migration with skip_balance_recalc=True.
    """
    try:
        updated_count = recalculate_all_balances(db)
        db.commit()
        return {"message": f"Recalculated balances for {updated_count} accounts"}
    except Exception as e:
        db.rollback()
        print(f"Balance recalculation error: {e}")
        raise HTTPException(status_code=500, detail=f"Error recalculating balances: {e}")
