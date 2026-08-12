"""
Covers app/services/credit_card_payment.py - the cross-payment detector that
mirrors a "pay my credit card" transaction from a checking/savings account
onto an INCOME transaction on the matching credit card. Nothing here was
covered by any test before this suite.
"""
from app.models.account import Account, AccountType
from app.models.transaction import Transaction, TransactionType, PaymentMethod
from app.services.credit_card_payment import (
    is_credit_card_payment,
    _extract_card_brand,
    _match_card_by_name,
    find_target_credit_card,
    process_cross_payment,
)


# --- is_credit_card_payment ---

def test_is_credit_card_payment_matches_common_ecuadorian_bank_descriptions():
    positives = [
        "PAGO TARJETA VISA",
        "PAGO DE TC BANCO GUAYAQUIL",
        "TRANSFERENCIA A TARJETA MASTERCARD",
        "ABONO A TARJETA DE CREDITO",
        "PAGO MINIMO TARJETA",
        "pago de estado de cuenta",  # case-insensitive
    ]
    for desc in positives:
        assert is_credit_card_payment(desc) is True, desc


def test_is_credit_card_payment_rejects_unrelated_descriptions():
    negatives = [
        "COMPRA SUPERMERCADO MI COMISARIATO",
        "RETIRO CAJERO AUTOMATICO",
        "",
        None,
    ]
    for desc in negatives:
        assert is_credit_card_payment(desc) is False, desc


# --- _extract_card_brand ---

def test_extract_card_brand_recognizes_known_brands():
    assert _extract_card_brand("PAGO TARJETA VISA GUAYAQUIL") == "visa"
    assert _extract_card_brand("PAGO MASTERCARD PACIFICO") == "mastercard"
    assert _extract_card_brand("PAGO AMERICAN EXPRESS") == "amex"
    assert _extract_card_brand("PAGO DINERS CLUB") == "diners"


def test_extract_card_brand_returns_none_when_unrecognized():
    assert _extract_card_brand("PAGO TARJETA DEL BANCO") is None


# --- _match_card_by_name ---

def test_match_card_by_name_direct_and_partial():
    assert _match_card_by_name("PAGO VISA PLATINUM GUAYAQUIL", "Visa Platinum") is True
    assert _match_card_by_name("PAGO A MI TARJETA PLATINUM", "Visa Platinum") is True
    assert _match_card_by_name("COMPRA SUPERMERCADO", "Visa Platinum") is False


# --- find_target_credit_card ---

def test_find_target_credit_card_prefers_direct_link(db_session):
    credit_card = Account(name="Visa Guayaquil", account_type=AccountType.CREDIT_CARD, balance=0)
    db_session.add(credit_card)
    db_session.commit()

    checking = Account(
        name="Cuenta Ahorros", account_type=AccountType.SAVINGS, balance=0,
        linked_account_id=credit_card.id,
    )
    db_session.add(checking)
    db_session.commit()

    # Description doesn't even mention the card - direct link should still win.
    found = find_target_credit_card(db_session, checking, "PAGO TARJETA")
    assert found is not None
    assert found.id == credit_card.id


def test_find_target_credit_card_falls_back_to_brand_and_bank(db_session):
    visa = Account(name="Visa Clasica", account_type=AccountType.CREDIT_CARD, balance=0, bank_name="Guayaquil")
    amex = Account(name="Amex Oro", account_type=AccountType.CREDIT_CARD, balance=0, bank_name="Pichincha")
    db_session.add_all([visa, amex])
    db_session.commit()

    checking = Account(name="Ahorros Guayaquil", account_type=AccountType.SAVINGS, balance=0, bank_name="Guayaquil")
    db_session.add(checking)
    db_session.commit()

    found = find_target_credit_card(db_session, checking, "PAGO A VISA")
    assert found is not None
    assert found.id == visa.id


def test_find_target_credit_card_returns_none_when_ambiguous(db_session):
    card_a = Account(name="Visa Guayaquil", account_type=AccountType.CREDIT_CARD, balance=0, bank_name="Guayaquil")
    card_b = Account(name="Amex Pichincha", account_type=AccountType.CREDIT_CARD, balance=0, bank_name="Pichincha")
    db_session.add_all([card_a, card_b])
    db_session.commit()

    checking = Account(name="Cuenta Sin Banco", account_type=AccountType.SAVINGS, balance=0)
    db_session.add(checking)
    db_session.commit()

    # No link, no name/brand match, no bank on the source account -> genuinely ambiguous.
    found = find_target_credit_card(db_session, checking, "PAGO GENERICO")
    assert found is None


# --- process_cross_payment (integration: exercises money precision too) ---

def test_process_cross_payment_creates_exact_mirror_and_updates_balance(db_session):
    checking = Account(name="Cuenta Ahorros", account_type=AccountType.SAVINGS, balance=500000, bank_name="Guayaquil")
    credit_card = Account(name="Visa Guayaquil", account_type=AccountType.CREDIT_CARD, balance=250075, bank_name="Guayaquil")
    db_session.add_all([checking, credit_card])
    db_session.commit()

    txn = Transaction(
        description="PAGO TARJETA VISA",
        amount=100050,  # $1000.50, stored as integer cents
        transaction_type=TransactionType.EXPENSE,
        payment_method=PaymentMethod.TRANSFER,
        account_id=checking.id,
    )
    db_session.add(txn)
    db_session.commit()

    mirror = process_cross_payment(db_session, txn, checking)

    assert mirror is not None
    assert mirror.amount == 100050  # exact integer, no float rounding
    assert mirror.transaction_type == TransactionType.INCOME
    assert mirror.account_id == credit_card.id

    db_session.refresh(credit_card)
    assert credit_card.balance == 350125  # 250075 + 100050, exact integer arithmetic


def test_process_cross_payment_is_idempotent(db_session):
    checking = Account(name="Cuenta Ahorros", account_type=AccountType.SAVINGS, balance=0, bank_name="Guayaquil")
    credit_card = Account(name="Visa Guayaquil", account_type=AccountType.CREDIT_CARD, balance=0, bank_name="Guayaquil")
    db_session.add_all([checking, credit_card])
    db_session.commit()

    txn = Transaction(
        description="PAGO TARJETA VISA",
        amount=5000,
        transaction_type=TransactionType.EXPENSE,
        payment_method=PaymentMethod.TRANSFER,
        account_id=checking.id,
    )
    db_session.add(txn)
    db_session.commit()

    first = process_cross_payment(db_session, txn, checking)
    second = process_cross_payment(db_session, txn, checking)

    assert first is not None
    assert second is None  # duplicate mirror must be skipped


def test_process_cross_payment_ignores_non_expense_and_non_matching(db_session):
    checking = Account(name="Cuenta Ahorros", account_type=AccountType.SAVINGS, balance=0)
    db_session.add(checking)
    db_session.commit()

    income_txn = Transaction(
        description="PAGO TARJETA VISA", amount=100, transaction_type=TransactionType.INCOME,
        payment_method=PaymentMethod.TRANSFER, account_id=checking.id,
    )
    unrelated_txn = Transaction(
        description="COMPRA SUPERMERCADO", amount=100, transaction_type=TransactionType.EXPENSE,
        payment_method=PaymentMethod.TRANSFER, account_id=checking.id,
    )
    db_session.add_all([income_txn, unrelated_txn])
    db_session.commit()

    assert process_cross_payment(db_session, income_txn, checking) is None
    assert process_cross_payment(db_session, unrelated_txn, checking) is None
