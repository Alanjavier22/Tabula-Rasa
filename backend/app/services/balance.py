from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.transaction import Transaction, TransactionType


def apply_transaction_to_balance(db: Session, transaction: Transaction, reverse: bool = False) -> None:
    """
    Applies (or reverses) a transaction's effect on the account balance.
    
    For checking/savings accounts:
      - INCOME adds to balance
      - EXPENSE subtracts from balance
    
    For credit_card accounts:
      - EXPENSE adds to debt (balance becomes more negative)
      - INCOME (payment to card) reduces debt (balance becomes less negative)
    
    If reverse=True, applies the opposite operation (used on delete/update).
    """
    if not transaction.account_id:
        return
    
    account = db.query(Account).filter(Account.id == transaction.account_id).first()
    if not account:
        return
    
    multiplier = -1 if reverse else 1
    amount = transaction.amount * multiplier
    
    if account.account_type == "credit_card":
        # Credit card: expenses increase debt (negative balance), income (payments) decrease debt
        if transaction.transaction_type == TransactionType.EXPENSE:
            account.balance -= amount  # negative balance grows
        else:  # INCOME (payment)
            account.balance += amount  # debt reduced
    else:
        # Checking/savings: income adds, expense subtracts
        if transaction.transaction_type == TransactionType.INCOME:
            account.balance += amount
        else:  # EXPENSE
            account.balance -= amount
    
    db.flush()


def recalculate_account_balance(db: Session, account_id: str, initial_balance: int = None) -> int:
    """
    Recalculate an account's balance with 'Anchor Logic'.
    
    1. Search for the most recent transaction with a 'running_balance' (the anchor).
    2. If found, use it as the base and apply only newer transactions.
    3. If not found, fall back to the account's base balance or 0 and apply all transactions.
    """
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        return 0

    # --- SUPER ANCHOR: Credit Card Statements ---
    # For credit cards, the latest statement balance is the ULTIMATE TRUTH.
    from app.models.credit_card_statement import CreditCardStatement
    latest_stmt = db.query(CreditCardStatement).filter(
        CreditCardStatement.account_id == account_id,
        CreditCardStatement.is_deleted == False
    ).order_by(CreditCardStatement.year.desc(), CreditCardStatement.month.desc()).first()

    # 1. Look for the 'Anchor Transaction'
    anchor_tx = db.query(Transaction).filter(
        Transaction.account_id == account_id,
        Transaction.running_balance.isnot(None),
        Transaction.is_deleted == False
    ).order_by(Transaction.date.desc(), Transaction.created_at.desc()).first()

    # Determine which anchor is more recent/reliable
    use_stmt_anchor = False
    if account.account_type == "credit_card" and latest_stmt:
        # If statement exists, we compare it with transaction anchor
        # For now, if a statement exists, it OVERRIDES anything else as the base.
        use_stmt_anchor = True

    if use_stmt_anchor and latest_stmt:
        # Base balance is the statement balance (stored as positive debt in CC context, 
        # but account.balance is negative debt)
        base_balance = -latest_stmt.statement_balance
        anchor_date = latest_stmt.cut_off_date or date(latest_stmt.year, latest_stmt.month, 28)
        
        # Get transactions NEWER than the statement cut-off
        newer_transactions = db.query(Transaction).filter(
            Transaction.account_id == account_id,
            Transaction.is_deleted == False,
            Transaction.date > anchor_date
        ).all()
        
        new_balance = base_balance
        for txn in newer_transactions:
            txn_amount = txn.amount
            if txn.transaction_type == TransactionType.EXPENSE:
                new_balance -= txn_amount
            else:
                new_balance += txn_amount

    elif anchor_tx:
        # We found an anchor! This is the bank's absolute truth at that point in time.
        base_balance = anchor_tx.running_balance
        anchor_date = anchor_tx.date
        anchor_id = anchor_tx.id
        
        # 2. Get all transactions strictly NEWER than the anchor
        # We use date and creation time/ID to ensure we don't miss anything or double count
        newer_transactions = db.query(Transaction).filter(
            Transaction.account_id == account_id,
            Transaction.is_deleted == False,
            Transaction.date >= anchor_date
        ).all()
        
        new_balance = base_balance
        for txn in newer_transactions:
            # Skip the anchor itself and any transaction that happened BEFORE it on the same day
            # (We use created_at to determine the sequence within the same date)
            if txn.date == anchor_date and txn.created_at <= anchor_tx.created_at:
                continue

            txn_amount = txn.amount
            if account.account_type == "credit_card":
                if txn.transaction_type == TransactionType.EXPENSE:
                    new_balance -= txn_amount
                else:
                    new_balance += txn_amount
            else:
                if txn.transaction_type == TransactionType.INCOME:
                    new_balance += txn_amount
                else:
                    new_balance -= txn_amount
    else:
        # No anchor found. Fallback to starting from 0 or the current base.
        # Note: In a cleared DB, this will be 0.
        new_balance = initial_balance if initial_balance is not None else 0
        
        transactions = db.query(Transaction).filter(
            Transaction.account_id == account_id, 
            Transaction.is_deleted == False
        ).order_by(Transaction.date.asc()).all()
        
        for txn in transactions:
            txn_amount = txn.amount
            if account.account_type == "credit_card":
                if txn.transaction_type == TransactionType.EXPENSE:
                    new_balance -= txn_amount
                else:
                    new_balance += txn_amount
            else:
                if txn.transaction_type == TransactionType.INCOME:
                    new_balance += txn_amount
                else:
                    new_balance -= txn_amount
    
    account.balance = new_balance
    db.commit()
    return new_balance
