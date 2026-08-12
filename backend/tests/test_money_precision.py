"""
Money is stored as integer cents (Account.balance, Transaction.amount are both
plain Integer columns - see app/models/account.py and transaction.py). The
project's own history (b2f4c8e91a03_migrate_float_to_numeric_money_fields.py)
shows this used to be Float and caused precision bugs; these tests guard
against that regression by asserting values round-trip through SQLite exactly,
with no float ever entering the path.
"""
from app.models.account import Account, AccountType
from app.models.transaction import Transaction, TransactionType, PaymentMethod


def test_balance_roundtrips_as_exact_integer(db_session):
    values = [0, 1, 99, 100050, 999999999, -50000]
    for v in values:
        acc = Account(name=f"Cuenta {v}", account_type=AccountType.SAVINGS, balance=v)
        db_session.add(acc)
        db_session.commit()
        db_session.refresh(acc)
        assert acc.balance == v
        assert isinstance(acc.balance, int)


def test_transaction_amount_roundtrips_as_exact_integer(db_session):
    acc = Account(name="Cuenta", account_type=AccountType.CHECKING, balance=0)
    db_session.add(acc)
    db_session.commit()

    # $1,234,567.89 worth of cents-style values that are classic float traps
    # (0.1 + 0.2 != 0.3 in binary float) - must survive exactly as ints.
    values = [1, 10, 30, 100, 123456789, 33333333]
    for v in values:
        txn = Transaction(
            description="test", amount=v, transaction_type=TransactionType.EXPENSE,
            payment_method=PaymentMethod.CASH, account_id=acc.id,
        )
        db_session.add(txn)
        db_session.commit()
        db_session.refresh(txn)
        assert txn.amount == v
        assert isinstance(txn.amount, int)


def test_no_float_drift_across_many_small_additions(db_session):
    """
    Classic float trap: summing 0.1 + 0.2 + ... in a loop drifts off the exact
    decimal value. Cents-as-int must not, since it's pure integer arithmetic.
    """
    acc = Account(name="Cuenta", account_type=AccountType.SAVINGS, balance=0)
    db_session.add(acc)
    db_session.commit()

    increment = 10  # 10 cents
    for _ in range(1000):
        acc.balance = acc.balance + increment
    db_session.commit()
    db_session.refresh(acc)

    assert acc.balance == 10000  # exactly $100.00 in cents, no drift
