from datetime import datetime, timezone

import pytest

from app.models.account import Account, AccountType
from app.models.category import Category
from app.models.net_worth_snapshot import NetWorthSnapshot
from app.models.transaction import Transaction
from app.services.transaction_importer import import_transactions


def _create_account(db_session, name="Cuenta de importación"):
    account = Account(name=name, account_type=AccountType.CHECKING, balance=0)
    db_session.add(account)
    db_session.commit()
    db_session.refresh(account)
    return account


def _transaction(account_id, description="Movimiento", amount=100, date=None, **extra):
    payload = {
        "description": description,
        "amount": amount,
        "transaction_type": "expense",
        "payment_method": "cash",
        "date": date or datetime.now(timezone.utc).isoformat(),
        "account_id": account_id,
    }
    payload.update(extra)
    return payload


def test_import_transactions_applies_balance_and_category(db_session):
    account = _create_account(db_session)
    category = Category(name="Importaciones")
    db_session.add(category)
    db_session.commit()
    today = datetime.now(timezone.utc).isoformat()

    result = import_transactions(
        db_session,
        [
            _transaction(account.id, description="Compra", amount=500, date=today),
            _transaction(
                account.id,
                description="Nómina",
                amount=700,
                date=today,
                transaction_type="income",
                payment_method="transfer",
                category_id=category.id,
            ),
        ],
    )

    assert result["imported_count"] == 2
    assert result["skipped_count"] == 0
    assert len(result["inserted_ids"]) == 2
    db_session.refresh(account)
    assert account.balance == 200
    assert db_session.query(Transaction).count() == 2
    assert db_session.query(Transaction).filter(Transaction.category_id == category.id).count() == 1


def test_import_transactions_deduplicates_existing_and_batch_rows(db_session):
    account = _create_account(db_session)
    transaction_date = "2026-09-10T12:00:00+00:00"

    first = import_transactions(
        db_session,
        [_transaction(account.id, description="Original", amount=1000, date=transaction_date)],
    )
    second = import_transactions(
        db_session,
        [
            _transaction(account.id, description="Cambio de descripción", amount=1000, date=transaction_date),
            _transaction(
                account.id,
                description="Con saldo",
                amount=1000,
                date=transaction_date,
                running_balance=100,
            ),
            _transaction(
                account.id,
                description="Nuevo con saldo",
                amount=2000,
                date=transaction_date,
                running_balance=800,
            ),
            _transaction(
                account.id,
                description="Duplicado exacto",
                amount=2000,
                date=transaction_date,
                running_balance=800,
            ),
            _transaction(
                account.id,
                description="Mismo movimiento",
                amount=2000,
                date=transaction_date,
                running_balance=801,
            ),
        ],
    )

    assert first["imported_count"] == 1
    assert second["imported_count"] == 1
    assert second["skipped_count"] == 4
    assert db_session.query(Transaction).count() == 2


def test_import_transactions_skips_balance_for_closed_and_historical_month(db_session):
    account = _create_account(db_session)
    now = datetime.now(timezone.utc)
    db_session.add(
        NetWorthSnapshot(
            month=now.month,
            year=now.year,
            total_assets=0,
            total_liabilities=0,
            net_worth=0,
        )
    )
    db_session.commit()

    result = import_transactions(
        db_session,
        [
            _transaction(account.id, description="Mes cerrado", amount=500, date=now.isoformat()),
            _transaction(
                account.id,
                description="Histórico",
                amount=700,
                date=datetime(now.year - 1, 1, 15, tzinfo=timezone.utc).isoformat(),
            ),
        ],
        skip_duplicates=False,
    )

    assert result["imported_count"] == 2
    db_session.refresh(account)
    assert account.balance == 0
    assert db_session.query(Transaction).count() == 2


def test_import_transactions_rejects_invalid_payloads(db_session):
    account = _create_account(db_session)
    payload = _transaction(account.id)

    missing_field = payload.copy()
    missing_field.pop("description")
    with pytest.raises(ValueError, match="missing required field: description"):
        import_transactions(db_session, [missing_field])

    invalid_type = payload.copy()
    invalid_type["transaction_type"] = "refund"
    with pytest.raises(ValueError, match="invalid transaction_type"):
        import_transactions(db_session, [invalid_type])

    invalid_date = payload.copy()
    invalid_date["date"] = "not-a-date"
    with pytest.raises(ValueError, match="invalid date format"):
        import_transactions(db_session, [invalid_date])

    missing_account = payload.copy()
    missing_account["account_id"] = "account-does-not-exist"
    with pytest.raises(ValueError, match="Accounts not found"):
        import_transactions(db_session, [missing_account])

    missing_category = payload.copy()
    missing_category["category_id"] = "category-does-not-exist"
    with pytest.raises(ValueError, match="Categories not found"):
        import_transactions(db_session, [missing_category])
