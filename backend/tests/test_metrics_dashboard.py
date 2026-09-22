from datetime import datetime
from decimal import Decimal

from app.api import metrics_dashboard
from app.models.category import Category
from app.models.config import Config
from app.models.transaction import PaymentMethod, Transaction
from app.models.transaction_split import TransactionSplit


def _add_transaction(db_session, *, description, amount, transaction_type, date, category_id=None):
    transaction = Transaction(
        description=description,
        amount=amount,
        transaction_type=transaction_type,
        payment_method=PaymentMethod.CASH,
        date=date,
        category_id=category_id,
    )
    db_session.add(transaction)
    db_session.flush()
    return transaction


def test_dashboard_summary_preserves_aggregations_and_sankey(db_session, monkeypatch):
    monkeypatch.setattr(metrics_dashboard, "detect_anomalies", lambda db: [])
    now = datetime.now().replace(microsecond=0)
    food = Category(name="Comida")
    transport = Category(name="Transporte")
    vehicle = Category(name="Combustible")
    transfer = Category(name="Transferencia")
    income = Category(name="Ingresos")
    db_session.add_all([food, transport, vehicle, transfer, income])
    db_session.flush()

    _add_transaction(
        db_session,
        description="Salario",
        amount=1000,
        transaction_type="income",
        date=now,
        category_id=income.id,
    )
    _add_transaction(
        db_session,
        description="Supermercado",
        amount=300,
        transaction_type="expense",
        date=now,
        category_id=food.id,
    )
    mixed = _add_transaction(
        db_session,
        description="Compra mixta",
        amount=400,
        transaction_type="expense",
        date=now,
        category_id=food.id,
    )
    db_session.add_all([
        TransactionSplit(transaction_id=mixed.id, amount=250, category_id=food.id),
        TransactionSplit(transaction_id=mixed.id, amount=150, category_id=transport.id),
    ])
    _add_transaction(
        db_session,
        description="Gasolina",
        amount=150,
        transaction_type="expense",
        date=now,
        category_id=vehicle.id,
    )
    _add_transaction(
        db_session,
        description="Pago interno",
        amount=200,
        transaction_type="expense",
        date=now,
        category_id=transfer.id,
    )
    db_session.commit()

    result = metrics_dashboard.get_dashboard_summary(db_session)

    assert result["total_income"] == Decimal("1000")
    assert result["total_expenses"] == Decimal("850")
    assert sum(item["gasto"] for item in result["daily_spending"]) == Decimal("1050")
    assert result["vehicle_cost"] == 150.0

    breakdown = {item["name"]: item["value"] for item in result["expense_breakdown"]}
    assert breakdown == {
        "Comida": Decimal("700"),
        "Combustible": Decimal("150"),
        "Transferencia": Decimal("200"),
    }

    month = now.strftime("%Y-%m")
    comparison = {item["mes"]: item for item in result["monthly_comparison"]}
    assert comparison[month] == {"mes": month, "Ingresos": 1000, "Gastos": 1050}

    sankey = result["sankey_data"]
    assert sankey["nodes"][0] == {"name": "Ingresos"}
    flows = {
        sankey["nodes"][link["target"]]["name"]: link["value"]
        for link in sankey["links"]
    }
    assert flows == {
        "Comida": 550,
        "Transporte": 150,
        "Combustible": 150,
        "Transferencia": 200,
    }


def test_dashboard_summary_uses_configured_blacklist(db_session, monkeypatch):
    monkeypatch.setattr(metrics_dashboard, "detect_anomalies", lambda db: [])
    now = datetime.now().replace(microsecond=0)
    db_session.add(Config(key="income_blacklist", value="NO CONTAR,OTRO"))
    _add_transaction(
        db_session,
        description="Ingreso válido",
        amount=700,
        transaction_type="income",
        date=now,
    )
    _add_transaction(
        db_session,
        description="NO CONTAR - ajuste",
        amount=300,
        transaction_type="income",
        date=now,
    )
    db_session.commit()

    result = metrics_dashboard.get_dashboard_summary(db_session)

    assert result["total_income"] == Decimal("700")


def test_dashboard_summary_returns_empty_sankey_without_transactions(db_session, monkeypatch):
    monkeypatch.setattr(metrics_dashboard, "detect_anomalies", lambda db: [])

    result = metrics_dashboard.get_dashboard_summary(db_session)

    assert result["total_income"] == Decimal("0")
    assert result["total_expenses"] == Decimal("0")
    assert result["expense_breakdown"] == []
    assert result["monthly_comparison"] == []
    assert result["vehicle_cost"] == 0.0
    assert result["sankey_data"] == {
        "nodes": [{"name": "Sin Datos"}, {"name": "Registra Transacciones"}],
        "links": [{"source": 0, "target": 1, "value": 0}],
    }
