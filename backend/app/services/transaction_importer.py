from sqlalchemy.orm import Session
from app.models.transaction import Transaction
from app.models.category import Category
from app.models.account import Account
from typing import List, Optional
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


def import_transactions(
    db: Session,
    transactions: List[dict],
    skip_duplicates: bool = True
) -> dict:
    """
    Import a list of transactions into the database.
    
    Args:
        db: Database session
        transactions: List of transaction dictionaries with keys:
            - description (str): Transaction description
            - amount (float): Transaction amount (positive for income, negative for expense)
            - transaction_type (str): "income" or "expense"
            - payment_method (str): Payment method (e.g., "credit_card", "debit_card", "cash", "transfer")
            - date (str): ISO format date string (e.g., "2026-05-01T00:00:00")
            - category_id (str): Category UUID
            - account_id (str): Account UUID
        skip_duplicates: If True, skip transactions with same description, amount, and date
        
    Returns:
        Dictionary with:
            - imported_count (int): Number of successfully imported transactions
            - skipped_count (int): Number of skipped transactions (duplicates)
            - failed_count (int): Number of failed transactions
            - errors (list): List of error messages
        
    Raises:
        ValueError: If transactions list is empty
        ValueError: If required fields are missing from any transaction
    """
    if not transactions:
        raise ValueError("Transactions list cannot be empty")
    
    # Validate required fields
    required_fields = ['description', 'amount', 'transaction_type', 'payment_method', 'date', 'category_id', 'account_id']
    for idx, tx in enumerate(transactions):
        for field in required_fields:
            if field not in tx:
                raise ValueError(f"Transaction at index {idx} is missing required field: {field}")
    
    # Validate transaction type
    valid_types = ['income', 'expense']
    for idx, tx in enumerate(transactions):
        if tx['transaction_type'] not in valid_types:
            raise ValueError(f"Transaction at index {idx} has invalid transaction_type: {tx['transaction_type']}")
    
    # Validate date format
    for idx, tx in enumerate(transactions):
        try:
            datetime.fromisoformat(tx['date'].replace('Z', '+00:00'))
        except ValueError:
            raise ValueError(f"Transaction at index {idx} has invalid date format: {tx['date']}")
    
    # Validate category exists
    category_ids = {tx['category_id'] for tx in transactions}
    categories = db.query(Category).filter(Category.id.in_(category_ids)).all()
    category_ids_in_db = {cat.id for cat in categories}
    missing_categories = category_ids - category_ids_in_db
    if missing_categories:
        raise ValueError(f"Categories not found in database: {missing_categories}")
    
    # Validate account exists
    account_ids = {tx['account_id'] for tx in transactions}
    accounts = db.query(Account).filter(Account.id.in_(account_ids)).all()
    account_ids_in_db = {acc.id for acc in accounts}
    missing_accounts = account_ids - account_ids_in_db
    if missing_accounts:
        raise ValueError(f"Accounts not found in database: {missing_accounts}")
    
    # Import transactions
    imported_count = 0
    skipped_count = 0
    failed_count = 0
    errors = []
    
    for tx in transactions:
        try:
            # Check for duplicates if requested
            if skip_duplicates:
                tx_date = datetime.fromisoformat(tx['date'].replace('Z', '+00:00'))
                existing = db.query(Transaction).filter(
                    Transaction.description == tx['description'],
                    Transaction.amount == tx['amount'],
                    Transaction.date == tx_date
                ).first()
                
                if existing:
                    skipped_count += 1
                    logger.info(f"Skipped duplicate transaction: {tx['description']} - ${tx['amount']}")
                    continue
            
            # Create transaction
            new_transaction = Transaction(
                description=tx['description'],
                amount=tx['amount'],
                transaction_type=tx['transaction_type'],
                payment_method=tx['payment_method'],
                date=datetime.fromisoformat(tx['date'].replace('Z', '+00:00')),
                category_id=tx['category_id'],
                account_id=tx['account_id']
            )
            
            db.add(new_transaction)
            db.commit()
            db.refresh(new_transaction)
            
            imported_count += 1
            logger.info(f"Imported transaction: {tx['description']} - ${tx['amount']}")
            
        except Exception as e:
            failed_count += 1
            error_msg = f"Failed to import transaction '{tx.get('description', 'unknown')}': {str(e)}"
            errors.append(error_msg)
            logger.error(error_msg)
            db.rollback()
    
    result = {
        'imported_count': imported_count,
        'skipped_count': skipped_count,
        'failed_count': failed_count,
        'errors': errors
    }
    
    logger.info(f"Import completed: {imported_count} imported, {skipped_count} skipped, {failed_count} failed")
    
    return result
