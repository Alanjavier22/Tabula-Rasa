from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.transaction import Transaction
from app.models.category import Category
from app.models.account import Account
from app.models.net_worth_snapshot import NetWorthSnapshot
from app.services.transaction_identity import unique_transaction_fingerprint
from typing import List
import logging
import datetime

logger = logging.getLogger(__name__)


def _validate_required_fields(transactions: List[dict]) -> None:
    required_fields = ['description', 'amount', 'transaction_type', 'payment_method', 'date', 'account_id']
    for index, transaction in enumerate(transactions):
        for field in required_fields:
            if field not in transaction:
                raise ValueError(f"Transaction at index {index} is missing required field: {field}")


def _validate_transaction_types(transactions: List[dict]) -> None:
    valid_types = ['income', 'expense']
    for index, transaction in enumerate(transactions):
        if transaction['transaction_type'] not in valid_types:
            raise ValueError(
                f"Transaction at index {index} has invalid transaction_type: "
                f"{transaction['transaction_type']}"
            )


def _parse_transaction_dates(transactions: List[dict]) -> list[datetime.datetime]:
    parsed_dates = []
    for index, transaction in enumerate(transactions):
        try:
            parsed_dates.append(datetime.datetime.fromisoformat(transaction['date'].replace('Z', '+00:00')))
        except ValueError:
            raise ValueError(f"Transaction at index {index} has invalid date format: {transaction['date']}")
    return parsed_dates


def _load_and_validate_accounts(db: Session, transactions: List[dict]) -> tuple[set, list[Account]]:
    account_ids = {transaction['account_id'] for transaction in transactions}
    accounts = db.query(Account).filter(Account.id.in_(account_ids)).all()
    account_ids_in_db = {account.id for account in accounts}
    missing_accounts = account_ids - account_ids_in_db
    if missing_accounts:
        raise ValueError(f"Accounts not found in database: {missing_accounts}")
    return account_ids, accounts


def _validate_categories(db: Session, transactions: List[dict]) -> None:
    category_ids = {transaction.get('category_id') for transaction in transactions if transaction.get('category_id')}
    if not category_ids:
        return

    categories = db.query(Category).filter(Category.id.in_(category_ids)).all()
    category_ids_in_db = {category.id for category in categories}
    missing_categories = category_ids - category_ids_in_db
    if missing_categories:
        raise ValueError(f"Categories not found in database: {missing_categories}")


def _transaction_type_value(transaction_type) -> str:
    return transaction_type.value if hasattr(transaction_type, 'value') else str(transaction_type)


def _load_existing_fingerprints(db: Session, account_ids: set) -> tuple[set, set]:
    existing_rb_set = set()
    existing_base_set = set()
    existing_txs = db.query(
        Transaction.description,
        Transaction.amount,
        func.strftime('%Y-%m-%d', Transaction.date),
        Transaction.account_id,
        Transaction.transaction_type,
        Transaction.running_balance,
    ).filter(
        Transaction.account_id.in_(account_ids),
        Transaction.is_deleted == False,
    ).all()

    for _description, amount, date_str, account_id, transaction_type, running_balance in existing_txs:
        transaction_type_str = _transaction_type_value(transaction_type)
        existing_base_set.add((amount, date_str, account_id, transaction_type_str))
        if running_balance is not None:
            existing_rb_set.add((amount, date_str, account_id, transaction_type_str, running_balance))

    logger.info(f"[DEDUP] Loaded {len(existing_base_set)} base + {len(existing_rb_set)} rb fingerprints")
    if existing_base_set:
        logger.info(f"[DEDUP] Sample base fingerprints: {list(existing_base_set)[:5]}")
    return existing_rb_set, existing_base_set


def _register_fingerprints_and_check_duplicate(
    transaction: dict,
    index: int,
    date_str: str,
    existing_rb_set: set,
    existing_base_set: set,
) -> bool:
    running_balance = transaction.get('running_balance')
    transaction_type_str = _transaction_type_value(transaction.get('transaction_type', ''))
    base_fingerprint = (transaction['amount'], date_str, transaction['account_id'], transaction_type_str)
    logger.info(
        f"[DEDUP] Checking tx {index}: amount={transaction['amount']}, date={date_str}, "
        f"account={transaction['account_id']}, type={transaction_type_str}, run_bal={running_balance}"
    )

    if running_balance is not None:
        rb_fingerprint = (*base_fingerprint, running_balance)
        logger.info(f"[DEDUP] RB fingerprint: {rb_fingerprint}, in set: {rb_fingerprint in existing_rb_set}")
        if rb_fingerprint in existing_rb_set:
            logger.info("[DEDUP] Duplicate detected via RB fingerprint")
            return True
        if base_fingerprint in existing_base_set:
            logger.info("[DEDUP] Duplicate detected via base fingerprint (old tx without RB)")
            return True
        existing_rb_set.add(rb_fingerprint)
    elif base_fingerprint in existing_base_set:
        logger.info("[DEDUP] Duplicate detected via base fingerprint (no RB)")
        return True

    existing_base_set.add(base_fingerprint)
    return False


def _build_transaction(db: Session, transaction: dict, transaction_date: datetime.datetime) -> Transaction:
    return Transaction(
        description=transaction['description'],
        amount=transaction['amount'],
        transaction_type=transaction['transaction_type'],
        payment_method=transaction['payment_method'],
        date=transaction_date,
        account_id=transaction['account_id'],
        category_id=transaction.get('category_id'),
        running_balance=transaction.get('running_balance'),
        fingerprint=unique_transaction_fingerprint(
            db,
            description=transaction['description'],
            amount=transaction['amount'],
            date_value=transaction_date,
            transaction_type=transaction['transaction_type'],
            account_id=transaction['account_id'],
            running_balance=transaction.get('running_balance'),
        ),
        is_manual=False,
    )


def _prepare_new_transactions(
    db: Session,
    transactions: List[dict],
    parsed_dates: list[datetime.datetime],
    account_ids: set,
    skip_duplicates: bool,
) -> tuple[list[Transaction], int]:
    if skip_duplicates:
        existing_rb_set, existing_base_set = _load_existing_fingerprints(db, account_ids)
    else:
        existing_rb_set, existing_base_set = set(), set()

    skipped = 0
    new_transactions = []
    for index, transaction in enumerate(transactions):
        transaction_date = parsed_dates[index]
        date_str = transaction_date.strftime('%Y-%m-%d')
        if skip_duplicates and _register_fingerprints_and_check_duplicate(
            transaction,
            index,
            date_str,
            existing_rb_set,
            existing_base_set,
        ):
            skipped += 1
            logger.info(f"[DEDUP] Skipping duplicate tx {index}")
            continue
        new_transactions.append(_build_transaction(db, transaction, transaction_date))
    return new_transactions, skipped


def _persist_new_transactions(db: Session, new_transactions: list[Transaction], accounts: list[Account]) -> None:
    if not new_transactions:
        return

    from app.services.balance import apply_transaction_to_balance
    from app.services.credit_card_payment import process_cross_payment

    snapshots = db.query(NetWorthSnapshot.month, NetWorthSnapshot.year).all()
    snapshot_lookup = {(snapshot.month, snapshot.year) for snapshot in snapshots}
    account_cache = {account.id: account for account in accounts}

    for transaction in new_transactions:
        transaction_month = transaction.date.month
        transaction_year = transaction.date.year
        now = datetime.datetime.now()
        is_historical = (
            transaction_year < now.year
            or transaction_year == now.year and transaction_month < now.month
        )
        if (transaction_month, transaction_year) not in snapshot_lookup and not is_historical:
            apply_transaction_to_balance(db, transaction, reverse=False)
            logger.info(f"[BALANCE] Applied tx to balance: {transaction.description}")
        else:
            reason = "CLOSED MONTH" if (transaction_month, transaction_year) in snapshot_lookup else "HISTORICAL"
            logger.info(f"[BALANCE] Skipped balance update ({reason}): {transaction.description}")

        db.add(transaction)
        if transaction.account_id and transaction.account_id in account_cache:
            process_cross_payment(db, transaction, account_cache[transaction.account_id])
    db.commit()


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
    
    _validate_required_fields(transactions)
    _validate_transaction_types(transactions)
    parsed_dates = _parse_transaction_dates(transactions)
    account_ids, accounts = _load_and_validate_accounts(db, transactions)
    _validate_categories(db, transactions)
    
    new_txs, skipped = _prepare_new_transactions(
        db,
        transactions,
        parsed_dates,
        account_ids,
        skip_duplicates,
    )
    _persist_new_transactions(db, new_txs, accounts)
    
    logger.info(f"Bulk import completed: {len(new_txs)} inserted, {skipped} duplicates skipped")
    
    return {
        'imported_count': len(new_txs),
        'skipped_count': skipped,
        'inserted_ids': [str(tx.id) for tx in new_txs]
    }
