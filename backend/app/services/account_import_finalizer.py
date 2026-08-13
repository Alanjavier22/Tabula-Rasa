"""
Persiste en la base de datos las transacciones de cuenta que el usuario ya
confirmó en el modal de importación (después de parse_account_document en
account_intelligence.py). No tiene relación con IA ni con el parsing —
por eso vive separado del AccountIntelligenceService.
"""
from typing import Any, Dict, List, cast
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.import_log import ImportLog
from app.models.transaction import Transaction
from app.services.categorizer import get_semantic_category
from app.utils.date_parser import parse_date_robustly


def finalize_account_import(db: Session, import_log_id: str, confirmed_transactions: List[Dict]) -> int:
    """Guarda las transacciones de cuenta confirmadas en la DB."""
    log = db.query(ImportLog).filter(ImportLog.id == import_log_id).first()
    if not log:
        return 0

    try:
        new_txs_count = 0
        earliest_date = datetime.now().date()

        # We reverse the list to insert from OLDEST to NEWEST
        # This ensures that 'created_at' reflects the chronological flow within a day
        for tx_data in reversed(confirmed_transactions):
            if not tx_data.get('is_duplicate', False):
                dt = parse_date_robustly(tx_data['date']) or datetime.now()
                if dt.date() < earliest_date:
                    earliest_date = dt.date()

                # Use the category_id from the confirmed data if available,
                # otherwise fallback to re-calculating (safety)
                category_id = tx_data.get('category_id')
                if not category_id and tx_data.get('description'):
                    category_id = get_semantic_category(
                        tx_data['description'],
                        tx_data['amount_cents'],
                        db,
                        tx_data['transaction_type']
                    )

                new_tx = Transaction(
                    description=tx_data['description'],
                    amount=abs(tx_data['amount_cents']),
                    transaction_type=tx_data['transaction_type'],
                    date=dt,
                    account_id=log.account_id,
                    category_id=category_id,
                    payment_method='transfer', # Por defecto en cuentas de ahorro
                    fingerprint=tx_data['fingerprint'],
                    import_log_id=log.id,
                    running_balance=tx_data.get('balance_cents'),
                    beneficiary=tx_data.get('beneficiary'),
                    is_manual=False,
                    needs_clarification=tx_data.get('needs_clarification', False)
                )
                db.add(new_tx)

                # Aprender el patrón basándose en la confirmación del usuario
                if category_id:
                    from app.services.categorizer import learn_category_pattern
                    learn_category_pattern(db, cast(Any, new_tx.description), cast(Any, category_id), cast(Any, new_tx.beneficiary))

                new_txs_count += 1

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
