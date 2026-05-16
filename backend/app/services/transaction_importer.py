from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.transaction import Transaction
from app.models.category import Category
from app.models.account import Account
from app.models.net_worth_snapshot import NetWorthSnapshot
from typing import List
import logging
import datetime

logger = logging.getLogger(__name__)


def import_transactions(
    db: Session,
    transactions: List[dict],
    skip_duplicates: bool = True
) -> dict:
    """
    Import a list of transactions into the database using bulk insert.
    
    Args:
        db: Database session
        transactions: List of transaction dictionaries with keys:
            - description (str): Transaction description
            - amount (int): Transaction amount in centavos (always positive)
            - transaction_type (str): "income" or "expense"
            - payment_method (str): Payment method
            - date (str): ISO format date string
            - category_id (str): Category UUID (optional)
            - account_id (str): Account UUID
        skip_duplicates: If True, skip transactions with same description, amount, date and account
        
    Returns:
        Dictionary with imported_count, skipped_count, and inserted_ids
    """
    if not transactions:
        raise ValueError("Transactions list cannot be empty")
    
    # Validate required fields
    required_fields = ['description', 'amount', 'transaction_type', 'payment_method', 'date', 'account_id']
    for idx, tx in enumerate(transactions):
        for field in required_fields:
            if field not in tx:
                raise ValueError(f"Transaction at index {idx} is missing required field: {field}")
    
    # Validate transaction type
    valid_types = ['income', 'expense']
    for idx, tx in enumerate(transactions):
        if tx['transaction_type'] not in valid_types:
            raise ValueError(f"Transaction at index {idx} has invalid transaction_type: {tx['transaction_type']}")
    
    # Validate and parse dates
    parsed_dates = []
    for idx, tx in enumerate(transactions):
        try:
            parsed = datetime.datetime.fromisoformat(tx['date'].replace('Z', '+00:00'))
            parsed_dates.append(parsed)
        except ValueError:
            raise ValueError(f"Transaction at index {idx} has invalid date format: {tx['date']}")
    
    # Validate account exists
    account_ids = {tx['account_id'] for tx in transactions}
    accounts = db.query(Account).filter(Account.id.in_(account_ids)).all()
    account_ids_in_db = {acc.id for acc in accounts}
    missing_accounts = account_ids - account_ids_in_db
    if missing_accounts:
        raise ValueError(f"Accounts not found in database: {missing_accounts}")
    
    # Validate category if provided (optional for AI)
    category_ids = {tx.get('category_id') for tx in transactions if tx.get('category_id')}
    if category_ids:
        categories = db.query(Category).filter(Category.id.in_(category_ids)).all()
        category_ids_in_db = {cat.id for cat in categories}
        missing_categories = category_ids - category_ids_in_db
        if missing_categories:
            raise ValueError(f"Categories not found in database: {missing_categories}")
    
    # --- DEDUPLICATION ---
    from app.services.balance import apply_transaction_to_balance
    
    skipped = 0
    existing_rb_set = set()
    existing_base_set = set()
    
    if skip_duplicates:
        # Build fingerprint sets for deduplication.
        # Primary: (amount, date_str, account_id, transaction_type, running_balance) - robust against description changes
        # Base: (amount, date_str, account_id, transaction_type) - catches old txns without running_balance
        existing_txs = db.query(
            Transaction.description,
            Transaction.amount,
            func.strftime('%Y-%m-%d', Transaction.date),
            Transaction.account_id,
            Transaction.transaction_type,
            Transaction.running_balance
        ).filter(
            Transaction.account_id.in_(account_ids),
            Transaction.is_deleted == False
        ).all()
        

        # Build fingerprints
        for desc, amt, date_str, acc_id, txn_type, run_bal in existing_txs:
            # Always add base fingerprint for all transactions
            # Use txn_type.value to get the string value ('expense', 'income') instead of enum name
            txn_type_str = txn_type.value if hasattr(txn_type, 'value') else str(txn_type)
            existing_base_set.add((amt, date_str, acc_id, txn_type_str))
            if run_bal is not None:
                existing_rb_set.add((amt, date_str, acc_id, txn_type_str, run_bal))
        
        logger.info(f"[DEDUP] Loaded {len(existing_base_set)} base + {len(existing_rb_set)} rb fingerprints")
        # Log sample fingerprints for debugging
        if existing_base_set:
            logger.info(f"[DEDUP] Sample base fingerprints: {list(existing_base_set)[:5]}")
    
    new_txs = []
    for idx, tx in enumerate(transactions):
        tx_date = parsed_dates[idx]
        tx_date_str = tx_date.strftime('%Y-%m-%d')
        
        # Check for duplicate against DB and within the current batch
        if skip_duplicates:
            run_bal = tx.get('running_balance')
            txn_type = tx.get('transaction_type', '')
            txn_type_str = str(txn_type.value) if hasattr(txn_type, 'value') else str(txn_type)
            
            base_fp = (tx['amount'], tx_date_str, tx['account_id'], txn_type_str)
            
            logger.info(f"[DEDUP] Checking tx {idx}: amount={tx['amount']}, date={tx_date_str}, account={tx['account_id']}, type={txn_type_str}, run_bal={run_bal}")
            
            is_duplicate = False
            if run_bal is not None:
                # Check exact match (rb fingerprint) first
                rb_fp = (tx['amount'], tx_date_str, tx['account_id'], txn_type_str, run_bal)
                logger.info(f"[DEDUP] RB fingerprint: {rb_fp}, in set: {rb_fp in existing_rb_set}")
                if rb_fp in existing_rb_set:
                    is_duplicate = True
                    logger.info(f"[DEDUP] Duplicate detected via RB fingerprint")
                # Also check base match (catches old transactions without running_balance)
                elif base_fp in existing_base_set:
                    is_duplicate = True
                    logger.info(f"[DEDUP] Duplicate detected via base fingerprint (old tx without RB)")
            else:
                # No running_balance: use base fingerprint
                logger.info(f"[DEDUP] Base fingerprint: {base_fp}, in set: {base_fp in existing_base_set}")
                if base_fp in existing_base_set:
                    is_duplicate = True
                    logger.info(f"[DEDUP] Duplicate detected via base fingerprint (no RB)")
            
            if is_duplicate:
                skipped += 1
                logger.info(f"[DEDUP] Skipping duplicate tx {idx}")
                continue
            
            # Register fingerprints to also deduplicate within the same batch
            existing_base_set.add(base_fp)
            if run_bal is not None:
                existing_rb_set.add((tx['amount'], tx_date_str, tx['account_id'], txn_type_str, run_bal))
        
        new_transaction = Transaction(
            description=tx['description'],
            amount=tx['amount'],
            transaction_type=tx['transaction_type'],
            payment_method=tx['payment_method'],
            date=tx_date,
            account_id=tx['account_id'],
            category_id=tx.get('category_id'),
            running_balance=tx.get('running_balance')
        )
        new_txs.append(new_transaction)
    
    # Bulk insert and update balances - single COMMIT
    if new_txs:
        # Cache existing snapshots to avoid redundant queries
        existing_snapshots = db.query(
            NetWorthSnapshot.month, NetWorthSnapshot.year
        ).all()
        snapshot_lookup = {(s.month, s.year) for s in existing_snapshots}
        
        # Cache account lookups for performance
        account_cache = {acc.id: acc for acc in accounts}
        from app.services.credit_card_payment import process_cross_payment
        
        for tx in new_txs:
            # Smart Balance Protection:
            # 1. Skip if month is closed (snapshot exists)
            # 2. Skip if transaction date is before current month (historical reconstruction)
            tx_month = tx.date.month
            tx_year = tx.date.year
            
            now = datetime.datetime.now()
            is_historical = (tx_year < now.year) or (tx_year == now.year and tx_month < now.month)
            
            if (tx_month, tx_year) not in snapshot_lookup and not is_historical:
                apply_transaction_to_balance(db, tx, reverse=False)
                logger.info(f"[BALANCE] Applied tx to balance: {tx.description}")
            else:
                reason = "CLOSED MONTH" if (tx_month, tx_year) in snapshot_lookup else "HISTORICAL"
                logger.info(f"[BALANCE] Skipped balance update ({reason}): {tx.description}")
            
            db.add(tx)
            
            # Cross-payment: detect credit card payments in imported transactions
            if tx.account_id and tx.account_id in account_cache:
                source_acc = account_cache[tx.account_id]
                process_cross_payment(db, tx, source_acc)
        
        db.commit()
    
    logger.info(f"Bulk import completed: {len(new_txs)} inserted, {skipped} duplicates skipped")
    
    return {
        'imported_count': len(new_txs),
        'skipped_count': skipped,
        'inserted_ids': [str(tx.id) for tx in new_txs]
    }
