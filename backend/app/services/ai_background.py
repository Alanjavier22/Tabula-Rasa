import time
import logging
from sqlalchemy.orm import Session
from app.models.transaction import Transaction
from app.models.category import Category
from app.services.categorizer import get_semantic_category, categorize_batch
from app.services.sri_classifier import sri_classify_batch
from database import SessionLocal

logger = logging.getLogger(__name__)


def categorize_transactions_background(transaction_ids: list[str]):
    """
    Procesa transacciones en lotes usando batch categorization para respetar los límites de la API.
    
    Args:
        transaction_ids: Lista de IDs de transacciones a categorizar
    """
    db = SessionLocal()
    try:
        transactions = db.query(Transaction).filter(Transaction.id.in_(transaction_ids)).all()
        
        # Filter transactions without category
        uncategorized = [tx for tx in transactions if not tx.category_id]
        
        if not uncategorized:
            logger.info("No transactions to categorize (all already have categories)")
            return
        
        # Use batch categorization (all in one request)
        batch_data = []
        for tx in uncategorized:
            batch_data.append({
                "description": tx.description,
                "amount": tx.amount,
                "transaction_type": tx.transaction_type.value if hasattr(tx.transaction_type, 'value') else tx.transaction_type
            })
        
        logger.info(f"Sending {len(batch_data)} transactions for batch categorization")
        results = categorize_batch(batch_data, db_session=db)
        
        # Apply results to transactions
        for i, tx in enumerate(uncategorized):
            if i in results:
                cat_id, clarification = results[i]
                tx.category_id = cat_id
                tx.needs_clarification = clarification
                logger.info(f"Categorized transaction {tx.id}: category_id={cat_id}, clarification={clarification}")

        # Clasificación SRI: solo expenses sin sri_category, agrupado en el mismo lote
        category_names = {str(c.id): c.name for c in db.query(Category).all()}
        sri_pending = [
            tx for tx in transactions
            if (tx.transaction_type.value if hasattr(tx.transaction_type, 'value') else tx.transaction_type) == 'expense'
            and not tx.sri_category
        ]
        if sri_pending:
            sri_batch_data = [
                {"description": tx.description, "category_name": category_names.get(tx.category_id, "")}
                for tx in sri_pending
            ]
            logger.info(f"Sending {len(sri_batch_data)} transactions for SRI batch classification")
            sri_results = sri_classify_batch(sri_batch_data, db_session=db)
            for i, tx in enumerate(sri_pending):
                if i in sri_results:
                    tx.sri_category = sri_results[i]

        db.commit()
        logger.info(f"Batch categorization completed for {len(uncategorized)} transactions")
            
    except Exception as e:
        logger.error(f"Error en categorización asíncrona: {e}")
        db.rollback()
    finally:
        db.close()
