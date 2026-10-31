from datetime import datetime, timezone

from app.models.category import Category
from app.models.transaction import Transaction
from app.services.anomaly_detector import calculate_anomaly_leak_total, detect_anomalies


def test_anomalies_exclude_internal_and_non_operational_transactions(db_session, monkeypatch):
    class FixedDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(2026, 10, 20, tzinfo=timezone.utc)

    monkeypatch.setattr("app.services.anomaly_detector.datetime", FixedDatetime)
    food = Category(id="food", name="Comida")
    transfer = Category(id="transfer", name="Transferencia")
    db_session.add_all([food, transfer])

    def expense(category, amount, month, description, internal=False):
        return Transaction(category_id=category, amount=amount, description=description,
                           transaction_type="expense", payment_method="cash",
                           date=datetime(2026, month, 10), is_internal=internal)

    db_session.add_all([
        expense("food", 6000, 9, "Servicio"),
        expense("food", 9000, 10, "Servicio"),
        expense("food", 900000, 10, "Interno", True),
        expense("transfer", 900000, 10, "Transferencia"),
    ])
    db_session.commit()

    alerts = detect_anomalies(db_session)
    assert len(alerts) == 2
    assert any("50%" in alert["message"] for alert in alerts)
    assert calculate_anomaly_leak_total(db_session) == 3000


def test_fiscal_range_includes_last_instant_and_excludes_internal(db_session):
    from datetime import date
    from app.api.fiscal import _get_fiscal_transactions

    for identifier, moment, internal in [
        ("last", datetime(2026, 12, 31, 23, 59, 59, 999999), False),
        ("next", datetime(2027, 1, 1), False),
        ("internal", datetime(2026, 12, 31), True),
    ]:
        db_session.add(Transaction(id=identifier, amount=1000, description=identifier,
                                   date=moment, is_internal=internal,
                                   transaction_type="expense", payment_method="cash"))
    db_session.commit()
    result = _get_fiscal_transactions(db_session, date(2026, 12, 1), date(2026, 12, 31), None)
    assert [transaction.id for transaction in result] == ["last"]


def test_liquidity_ignores_deleted_inactive_and_credit_accounts(db_session):
    from app.models.account import Account
    from app.services.forecaster import get_current_liquidity
    from app.services.balance_sheet import BalanceSheetService

    db_session.add_all([
        Account(name="Disponible", account_type="checking", balance=12345),
        Account(name="Ahorro", account_type="savings", balance=20000),
        Account(name="Eliminada", account_type="checking", balance=99999, is_deleted=True),
        Account(name="Inactiva", account_type="savings", balance=99999, is_active=0),
        Account(name="Crédito", account_type="credit_card", balance=-10000),
    ])
    db_session.commit()
    assert get_current_liquidity(db_session) == 32345
    assert BalanceSheetService.get_cash_accounts_value(db_session) == 32345


def test_card_liability_uses_larger_debt_without_double_counting(db_session):
    from app.models.account import Account
    from app.models.credit_card_statement import CreditCardStatement, StatementStatus
    from app.services.balance_sheet import BalanceSheetService

    db_session.add_all([
        Account(id="live", name="Saldo reciente", account_type="credit_card", balance=-20000),
        Account(id="statement", name="Estado mayor", account_type="credit_card", balance=-1000),
        Account(id="inactive", name="Cerrada con deuda", account_type="credit_card", balance=0, is_active=0),
    ])
    for account_id, balance, paid in [("live", 10000, 2000), ("statement", 15000, 5000), ("inactive", 7000, 2000)]:
        db_session.add(CreditCardStatement(account_id=account_id, statement_balance=balance,
                                           user_share=balance, amount_paid=paid, month=10,
                                           year=2026, status=StatementStatus.PENDING))
    db_session.commit()
    assert BalanceSheetService.get_credit_card_balances(db_session) == 35000


def test_anomaly_previous_month_clamps_calendar_end():
    from app.services.anomaly_detector import _get_month_periods

    current_start, current_end, previous_start, previous_end = _get_month_periods(
        datetime(2026, 3, 31, tzinfo=timezone.utc)
    )
    assert current_start.day == 1
    assert current_end.day == 31
    assert previous_start.month == 2
    assert previous_end.day == 28


def test_projection_preserves_fractional_reserve_months(db_session, monkeypatch):
    from app.services import forecaster

    monkeypatch.setattr(forecaster, "get_current_liquidity", lambda db: 15000)
    monkeypatch.setattr(forecaster, "calculate_historical_averages", lambda db, months_back: {
        "avg_income": 20000, "avg_fixed_expense": 6000, "avg_variable_expense": 4000,
    })
    result = forecaster.get_financial_projection(db_session, months=1)
    assert result["runway_months"] == 1.5


def test_sri_export_uses_complete_calendar_year(db_session, monkeypatch):
    from app.api import fiscal

    db_session.add_all([
        Transaction(id="closing", amount=1000, description="Cierre", transaction_type="expense",
                    payment_method="cash", date=datetime(2026, 12, 31, 23, 59, 59, 999999)),
        Transaction(id="internal", amount=9000, description="Interno", transaction_type="expense",
                    payment_method="cash", date=datetime(2026, 12, 31), is_internal=True),
    ])
    db_session.commit()
    exported = []

    def capture(transactions):
        exported.extend(transaction.id for transaction in transactions)
        return {}

    monkeypatch.setattr(fiscal, "_build_sri_declaration_data", capture)
    monkeypatch.setattr(fiscal, "_serialize_sri_declaration", lambda data, year, format: ("{}", "application/json", "sri.json"))
    response = fiscal.export_declaracion_sri(year=2026, format="json", db=db_session)
    assert response.status_code == 200
    assert exported == ["closing"]


def test_historical_trends_skip_deleted_snapshots_and_keep_order(db_session):
    from app.models.net_worth_snapshot import NetWorthSnapshot
    from app.services.snapshot_service import SnapshotService

    for month, deleted in [(8, False), (9, True), (10, False)]:
        db_session.add(NetWorthSnapshot(month=month, year=2026, total_assets=12000,
                                       total_liabilities=2000, net_worth=10000, is_deleted=deleted))
    db_session.commit()
    trends = SnapshotService.get_historical_trends(db_session)
    assert [entry["period"] for entry in trends] == ["8/2026", "10/2026"]
    assert trends[0]["net_worth"] == 100


def test_sentinel_intermediate_reserve_is_informational(db_session):
    from app.services.sentinel_service import SentinelService

    report = SentinelService(db_session, None)._generate_heuristic_fallback({
        "liquidez_neta": 1000, "deuda_tarjetas": 0, "iva_proyectado_mes": 0,
        "runway_meses": 3, "anomalias_detectadas": [],
    }, "IA desactivada")
    assert report["health_score"] == 90
    assert report["analysis_source"] == "heuristic"
    assert report["warnings"] == [{"level": "info", "message": "Reserva estimada: 3.0 meses."}]
