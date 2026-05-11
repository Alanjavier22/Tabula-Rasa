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
    Recalculate an account's balance from scratch based on initial balance and all transactions.
    Returns the new computed balance.
    
    If initial_balance is not provided, uses the account's current balance as the base
    (which includes the initial balance configured by the user).
    """
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        return 0
    
    # If initial_balance is not provided, use account's current balance as base
    # This preserves the initial balance configured by the user
    if initial_balance is None:
        initial_balance = account.balance
    
    transactions = db.query(Transaction).filter(Transaction.account_id == account_id, Transaction.is_deleted == False).all()
    
    new_balance = initial_balance
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
