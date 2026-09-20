"""Helpers for stable transaction fingerprints and manual-write semantics."""

from __future__ import annotations

import hashlib
import re
from datetime import date, datetime
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models.transaction import Transaction


def _enum_value(value: Any) -> str:
    return str(getattr(value, "value", value) or "").lower()


def _date_key(value: Any) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value or "")


def _normalize_description(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().upper())


def calculate_transaction_fingerprint(
    *,
    description: str,
    amount: int,
    date_value: Any,
    transaction_type: Any,
    account_id: Optional[str],
    running_balance: Optional[int] = None,
    occurrence_index: int = 0,
) -> str:
    """Build the canonical v2 fingerprint used by new write paths.

    ``occurrence_index`` preserves legitimate identical movements while keeping
    the database unique constraint useful for imported rows.
    """
    payload = "|".join(
        (
            "v2",
            account_id or "",
            _date_key(date_value),
            str(int(amount)),
            _enum_value(transaction_type),
            _normalize_description(description),
            "" if running_balance is None else str(int(running_balance)),
            str(occurrence_index),
        )
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def unique_transaction_fingerprint(
    db: Session,
    *,
    description: str,
    amount: int,
    date_value: Any,
    transaction_type: Any,
    account_id: Optional[str],
    running_balance: Optional[int] = None,
    exclude_transaction_id: Optional[str] = None,
) -> str:
    """Return a canonical fingerprint not currently used by another row."""
    for occurrence_index in range(10_000):
        candidate = calculate_transaction_fingerprint(
            description=description,
            amount=amount,
            date_value=date_value,
            transaction_type=transaction_type,
            account_id=account_id,
            running_balance=running_balance,
            occurrence_index=occurrence_index,
        )
        query = db.query(Transaction.id).filter(Transaction.fingerprint == candidate)
        if exclude_transaction_id:
            query = query.filter(Transaction.id != exclude_transaction_id)
        if query.first() is None:
            return candidate

    raise RuntimeError("No se pudo generar un fingerprint único para la transacción")
