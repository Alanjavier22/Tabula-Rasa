"""
Cross-payment service: Detects credit card payments in savings/checking transactions
and automatically creates mirror INCOME transactions on the linked credit card.

Works for both manual and import flows.
"""
import re
import logging
from typing import Optional, Tuple
from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.transaction import Transaction, TransactionType, PaymentMethod

logger = logging.getLogger(__name__)

# Patterns that indicate a payment TO a credit card
CREDIT_CARD_PAYMENT_PATTERNS = [
    r"PAGO\s*(?:DE\s*)?TARJETA",
    r"PAGO\s*(?:DE\s*)?T\.?C\.?",
    r"PAGO\s*(?:DE\s*)?CREDIT",
    r"PAGO\s*(?:A\s*)?VISA",
    r"PAGO\s*(?:A\s*)?MASTERCARD",
    r"PAGO\s*(?:A\s*)?AMEX",
    r"PAGO\s*(?:A\s*)?AMERICAN\s*EXPRESS",
    r"PAGO\s*(?:A\s*)?DINERS",
    r"PAGO\s*(?:A\s*)?DINNERS",
    r"PAGO\s*(?:DE\s*)?ESTADO\s*DE\s*CUENTA",
    r"TRANSFERENCIA\s*(?:A\s*)?TARJETA",
    r"ABONO\s*(?:A\s*)?TARJETA",
    r"PAGO\s*MINIMO",
    r"PAGO\s*TOTAL\s*(?:DE\s*)?TARJETA",
    r"DEBITO\s*(?:POR\s*)?PAGO\s*TARJETA",
]

# Card brand keywords for matching to specific cards
CARD_BRAND_KEYWORDS = {
    "visa": ["VISA"],
    "mastercard": ["MASTERCARD", "MASTER"],
    "amex": ["AMEX", "AMERICAN EXPRESS", "AMERICAN"],
    "diners": ["DINERS", "DINNERS", "DINERS CLUB"],
}


def is_credit_card_payment(description: str) -> bool:
    """Check if a transaction description looks like a credit card payment."""
    if not description:
        return False
    desc_upper = description.upper().strip()
    for pattern in CREDIT_CARD_PAYMENT_PATTERNS:
        if re.search(pattern, desc_upper):
            return True
    return False


def _extract_card_brand(description: str) -> Optional[str]:
    """Extract the card brand from description if mentioned."""
    desc_upper = description.upper()
    for brand, keywords in CARD_BRAND_KEYWORDS.items():
        for kw in keywords:
            if kw in desc_upper:
                return brand
    return None


def _match_card_by_name(description: str, card_name: str) -> bool:
    """Check if the card name is mentioned in the description."""
    desc_upper = description.upper()
    name_upper = card_name.upper()
    # Check direct name match
    if name_upper in desc_upper:
        return True
    # Check individual words of the card name (at least 2 chars)
    words = [w for w in name_upper.split() if len(w) >= 3]
    for word in words:
        if word in desc_upper:
            return True
    return False


def find_target_credit_card(
    db: Session,
    source_account: Account,
    description: str,
) -> Optional[Account]:
    """
    Find the credit card that a payment is destined to.
    
    Priority:
    1. linked_account_id on the source account (direct link)
    2. Card name mentioned in description
    3. Card brand match (VISA, AMEX, DINERS) + same bank
    4. Card brand match (VISA, AMEX, DINERS) any bank
    5. Same bank, only one credit card → auto-match
    """
    credit_cards = db.query(Account).filter(
        Account.account_type == "credit_card",
        Account.is_active == 1,
        Account.is_deleted == False,
    ).all()

    if not credit_cards:
        return None

    # 1. Direct link: source account has linked_account_id pointing to a credit card
    if source_account.linked_account_id:
        linked = next((c for c in credit_cards if c.id == source_account.linked_account_id), None)
        if linked:
            return linked

    # Also check reverse: any credit card links back to this source
    for card in credit_cards:
        if card.linked_account_id == source_account.id:
            # Check if description matches this card's name or brand
            if _match_card_by_name(description, card.name):
                return card

    # 2. Card name mentioned in description
    for card in credit_cards:
        if _match_card_by_name(description, card.name):
            return card

    # 3. Brand match + same bank
    brand = _extract_card_brand(description)
    if brand:
        same_bank_cards = [c for c in credit_cards if c.bank_name and source_account.bank_name 
                           and c.bank_name.upper() == source_account.bank_name.upper()]
        for card in same_bank_cards:
            card_name_upper = card.name.upper()
            for kw in CARD_BRAND_KEYWORDS.get(brand, []):
                if kw in card_name_upper:
                    return card

        # 4. Brand match, any bank
        for card in credit_cards:
            card_name_upper = card.name.upper()
            for kw in CARD_BRAND_KEYWORDS.get(brand, []):
                if kw in card_name_upper:
                    return card

    # 5. Same bank, only one credit card
    if source_account.bank_name:
        same_bank_cards = [c for c in credit_cards if c.bank_name and 
                           c.bank_name.upper() == source_account.bank_name.upper()]
        if len(same_bank_cards) == 1:
            return same_bank_cards[0]

    return None


def process_cross_payment(
    db: Session,
    transaction: Transaction,
    source_account: Account,
) -> Optional[Transaction]:
    """
    If the transaction is a credit card payment from a savings/checking account,
    create a mirror INCOME transaction on the target credit card to reduce its balance.
    
    Returns the mirror transaction if created, None otherwise.
    """
    # Only process EXPENSE transactions from non-credit-card accounts
    if source_account.account_type == "credit_card":
        return None
    if transaction.transaction_type != TransactionType.EXPENSE:
        return None
    if not is_credit_card_payment(transaction.description):
        return None

    target_card = find_target_credit_card(db, source_account, transaction.description)
    if not target_card:
        logger.info(f"[CROSS-PAYMENT] Payment detected but no matching credit card found: '{transaction.description}'")
        return None

    # Check for existing mirror transaction to avoid duplicates
    existing_mirror = db.query(Transaction).filter(
        Transaction.account_id == target_card.id,
        Transaction.amount == transaction.amount,
        Transaction.date == transaction.date,
        Transaction.transaction_type == TransactionType.INCOME,
        Transaction.description.contains("Pago desde"),
        Transaction.is_deleted == False,
    ).first()

    if existing_mirror:
        logger.info(f"[CROSS-PAYMENT] Mirror transaction already exists for card {target_card.name}, skipping")
        return None

    # Create mirror INCOME transaction on the credit card
    mirror_desc = f"Pago desde {source_account.name}: {transaction.description}"
    mirror_txn = Transaction(
        description=mirror_desc[:255],
        amount=transaction.amount,
        transaction_type=TransactionType.INCOME,
        payment_method=PaymentMethod.TRANSFER,
        date=transaction.date,
        account_id=target_card.id,
        category_id=transaction.category_id,
    )
    db.add(mirror_txn)
    db.flush()

    # Update the credit card balance (INCOME reduces debt)
    target_card.balance += transaction.amount
    db.flush()

    logger.info(
        f"[CROSS-PAYMENT] Created mirror payment: ${transaction.amount / 100:.2f} "
        f"from '{source_account.name}' → '{target_card.name}'"
    )
    return mirror_txn
