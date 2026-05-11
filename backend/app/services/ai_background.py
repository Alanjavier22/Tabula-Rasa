import time
import logging
from sqlalchemy.orm import Session
from app.models.transaction import Transaction
from app.services.categorizer import get_semantic_category, categorize_batch
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
                tx.category_id = results[i]
                logger.info(f"Categorized transaction {tx.id}: category_id={results[i]}")
        
        db.commit()
        logger.info(f"Batch categorization completed for {len(uncategorized)} transactions")
            
    except Exception as e:
        logger.error(f"Error en categorización asíncrona: {e}")
        db.rollback()
    finally:
        db.close()
