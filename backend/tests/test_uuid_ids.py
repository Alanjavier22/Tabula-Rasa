"""
Covers the end state of the UUID primary-key migration
(e9aa56991e55/de10f91abd65: integer PKs -> UUID string PKs, applied once and
irreversible - see those files' docstrings). That one-shot migration already
asserted its own row-count integrity and ran PRAGMA integrity_check when it
executed, so replaying it isn't meaningful; what IS worth regression-testing
going forward is that the UUID-based id scheme it left behind keeps working:
every model generates valid, unique UUIDv4 ids, and FK string matching (the
exact mechanism app/services/credit_card_payment.py relies on for
`card.id == source_account.linked_account_id`) stays exact.
"""
import uuid

from app.models.account import Account, AccountType
from app.models.category import Category
from app.models.transaction import Transaction, TransactionType, PaymentMethod


def test_generated_ids_are_valid_uuid4(db_session):
    acc = Account(name="Cuenta", account_type=AccountType.SAVINGS, balance=0)
    cat = Category(name="Comida")
    db_session.add_all([acc, cat])
    db_session.commit()

    for obj in (acc, cat):
        parsed = uuid.UUID(obj.id)
        assert parsed.version == 4
        assert str(parsed) == obj.id  # canonical hyphenated lowercase form


def test_generated_ids_are_unique_across_many_inserts(db_session):
    accounts = [Account(name=f"Cuenta {i}", account_type=AccountType.SAVINGS, balance=0) for i in range(200)]
    db_session.add_all(accounts)
    db_session.commit()  # id defaults are evaluated at flush, not at construction

    ids = {acc.id for acc in accounts}
    assert len(ids) == 200  # no collisions, no shared-default-lambda bug


def test_foreign_key_uuid_matches_exactly_across_relationship(db_session):
    """
    This is exactly the pattern credit_card_payment.find_target_credit_card
    relies on (`card.id == source_account.linked_account_id`): a plain Python
    string equality check between two independently generated UUID PKs. If id
    generation ever produced inconsistent casing/format, that matching would
    silently break.
    """
    linked = Account(name="Tarjeta", account_type=AccountType.CREDIT_CARD, balance=0)
    db_session.add(linked)
    db_session.commit()

    checking = Account(
        name="Cuenta", account_type=AccountType.SAVINGS, balance=0,
        linked_account_id=linked.id,
    )
    db_session.add(checking)
    db_session.commit()
    db_session.refresh(checking)

    assert checking.linked_account_id == linked.id

    txn = Transaction(
        description="test", amount=100, transaction_type=TransactionType.EXPENSE,
        payment_method=PaymentMethod.CASH, account_id=checking.id,
    )
    db_session.add(txn)
    db_session.commit()
    db_session.refresh(txn)

    assert txn.account.id == checking.id
    assert txn.account_id == checking.id
