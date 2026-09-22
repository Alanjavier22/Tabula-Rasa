"""
Persiste en la base de datos las transacciones de cuenta que el usuario ya
confirmó en el modal de importación (después de parse_account_document en
account_intelligence.py). No tiene relación con IA ni con el parsing —
por eso vive separado del AccountIntelligenceService.
"""
from typing import Any, Dict, List, cast
from datetime import date, datetime
from sqlalchemy.orm import Session
from app.models.import_log import ImportLog
from app.models.transaction import Transaction
from app.services.categorizer import get_semantic_category
from app.services.transaction_identity import calculate_transaction_fingerprint
from app.utils.date_parser import parse_date_robustly


def _resolve_category(db: Session, tx_data: Dict) -> Any:
    category_id = tx_data.get('category_id')
    if not category_id and tx_data.get('description'):
        category_id = get_semantic_category(
            tx_data['description'],
            tx_data['amount_cents'],
            db,
            tx_data['transaction_type']
        )
    return category_id


def _build_transaction(db: Session, log: ImportLog, tx_data: Dict, dt: datetime) -> Transaction:
    category_id = _resolve_category(db, tx_data)
    new_tx = Transaction(
        description=tx_data['description'],
        amount=abs(tx_data['amount_cents']),
        transaction_type=tx_data['transaction_type'],
        date=dt,
        account_id=log.account_id,
        category_id=category_id,
        payment_method='transfer',
        fingerprint=tx_data.get('fingerprint') or calculate_transaction_fingerprint(
            description=tx_data['description'],
            amount=abs(tx_data['amount_cents']),
            date_value=dt,
            transaction_type=tx_data['transaction_type'],
            account_id=log.account_id,
            running_balance=tx_data.get('balance_cents'),
        ),
        import_log_id=log.id,
        running_balance=tx_data.get('balance_cents'),
        beneficiary=tx_data.get('beneficiary'),
        is_manual=False,
        needs_clarification=tx_data.get('needs_clarification', False)
    )
    if category_id:
        from app.services.categorizer import learn_category_pattern
        learn_category_pattern(
            db,
            cast(Any, new_tx.description),
            cast(Any, category_id),
            cast(Any, new_tx.beneficiary),
        )
    return new_tx


def _persist_confirmed_transactions(
    db: Session,
    log: ImportLog,
    confirmed_transactions: List[Dict],
) -> tuple[int, date]:
    new_txs_count = 0
    earliest_date = datetime.now().date()
    for tx_data in reversed(confirmed_transactions):
        if tx_data.get('is_duplicate', False):
            continue
        dt = parse_date_robustly(tx_data['date']) or datetime.now()
        earliest_date = min(earliest_date, dt.date())
        db.add(_build_transaction(db, log, tx_data, dt))
        new_txs_count += 1
    return new_txs_count, earliest_date


def finalize_account_import(db: Session, import_log_id: str, confirmed_transactions: List[Dict]) -> int:
    """Guarda las transacciones de cuenta confirmadas en la DB."""
    log = db.query(ImportLog).filter(ImportLog.id == import_log_id).first()
    if not log:
        return 0

    try:
        new_txs_count, earliest_date = _persist_confirmed_transactions(
            db, log, confirmed_transactions
        )

        log.status = cast(Any, 'processed')
        db.commit()

        if new_txs_count > 0:
            from app.services.snapshot_service import mark_snapshots_as_stale
            mark_snapshots_as_stale(db, earliest_date.month, earliest_date.year)
            # Recalcular saldos
            from app.services.balance import recalculate_account_balance
            recalculate_account_balance(db, cast(Any, log.account_id))

        return new_txs_count
    except Exception as e:
        db.rollback()
        log.status = cast(Any, 'error')
        log.error_message = cast(Any, str(e))
        db.commit()
        raise e
    finally:
        db.close()
