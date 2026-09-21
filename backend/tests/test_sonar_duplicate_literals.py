"""Cubre las rutas de ejecución de constantes introducidas para SonarCloud."""

from datetime import datetime
from types import SimpleNamespace


def test_account_statement_parser_uses_shared_terms():
    from app.services.account_statement_parser import local_extract_transactions

    with_amount_column = (
        "Fecha,Detalle,Monto,Tipo\n"
        "2026-09-01,Compra,-10.00,Débito\n"
        "2026-09-02,Ingreso,20.00,Ingreso\n"
    ).encode("utf-8")
    parsed = local_extract_transactions(with_amount_column, "movimientos.csv")

    assert [item["transaction_type"] for item in parsed["transactions"]] == [
        "expense",
        "income",
    ]

    with_split_columns = (
        "Fecha,Detalle,Cargo,Depósito\n"
        "2026-09-03,Compra,10.00,\n"
    ).encode("utf-8")
    parsed_split = local_extract_transactions(with_split_columns, "movimientos.csv")

    assert parsed_split["transactions"][0]["amount_cents"] == 1000


def test_transaction_summary_uses_shared_uncategorized_label(db_session):
    from app.models.transaction import Transaction
    from app.services.insights_builders import (
        UNCATEGORIZED_LABEL,
        _build_transaction_summary,
    )

    db_session.add_all([
        Transaction(
            amount=100,
            description="Compra pequeña 1",
            transaction_type="expense",
            payment_method="cash",
            date=datetime(2026, 9, 1),
        ),
        Transaction(
            amount=100,
            description="Compra pequeña 2",
            transaction_type="expense",
            payment_method="cash",
            date=datetime(2026, 9, 2),
        ),
        Transaction(
            amount=1000,
            description="Compra atípica",
            transaction_type="expense",
            payment_method="cash",
            date=datetime(2026, 9, 3),
        ),
    ])
    db_session.commit()

    summary = _build_transaction_summary(db_session, datetime(2026, 9, 20))

    assert summary["expense_by_category"][UNCATEGORIZED_LABEL] == 1200
    assert summary["atypical_transactions"]


def test_sri_classifier_uses_default_category_on_provider_failure():
    from app.services.sri_classifier import DEFAULT_SRI_CATEGORY, SRIClassifier

    class FailingModels:
        def generate_content(self, **_kwargs):
            raise RuntimeError("provider unavailable")

    classifier = SRIClassifier.__new__(SRIClassifier)
    classifier.client = SimpleNamespace(models=FailingModels())

    assert classifier.classify("Compra desconocida") == DEFAULT_SRI_CATEGORY
