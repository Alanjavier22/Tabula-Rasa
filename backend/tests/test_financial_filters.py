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


def test_dashboard_metrics_exclude_internal_transactions(db_session):
    from decimal import Decimal
    from app.api.metrics_dashboard import (
        _get_daily_spending,
        _get_expense_breakdown,
        _get_monthly_comparison,
        _get_sankey_totals,
    )

    food = Category(id="food", name="Comida")
    db_session.add(food)
    db_session.add_all([
        Transaction(id="inc", category_id="food", amount=50000, description="Salario",
                    transaction_type="income", payment_method="transfer",
                    date=datetime(2026, 10, 5), is_internal=False),
        Transaction(id="exp-op", category_id="food", amount=12000, description="Mercado",
                    transaction_type="expense", payment_method="cash",
                    date=datetime(2026, 10, 10), is_internal=False),
        Transaction(id="exp-null", category_id=None, amount=3000, description="Varios",
                    transaction_type="expense", payment_method="cash",
                    date=datetime(2026, 10, 12), is_internal=False),
        Transaction(id="exp-int", category_id="food", amount=90000, description="Interno",
                    transaction_type="expense", payment_method="transfer",
                    date=datetime(2026, 10, 10), is_internal=True),
    ])
    db_session.commit()

    end_date = datetime(2026, 11, 1)

    breakdown = _get_expense_breakdown(db_session, 2026, 10, end_date)
    assert breakdown == [
        {"name": "Comida", "value": Decimal("12000")},
        {"name": "Sin Categoría", "value": Decimal("3000")},
    ]

    daily = _get_daily_spending(db_session, 2026, 10, end_date)
    assert daily == [
        {"date": "10-10", "gasto": Decimal("12000")},
        {"date": "10-12", "gasto": Decimal("3000")},
    ]

    comparison = _get_monthly_comparison(db_session)
    assert comparison == [{"mes": "2026-10", "Ingresos": 50000, "Gastos": 15000}]

    sankey_income, sankey_expenses = _get_sankey_totals(db_session, "2026-10")
    assert sankey_income == 50000
    assert sankey_expenses == {"Comida": 12000, "Sin Categoría": 3000}


def test_liquidity_summary_subtracts_negative_credit_card_balances(db_session):
    from app.models.account import Account
    from app.services.insights_builders import _build_liquidity_summary

    db_session.add_all([
        Account(name="Banco", account_type="checking", balance=61381),
        Account(name="Tarjeta", account_type="credit_card", balance=-31476),
    ])
    db_session.commit()

    summary = _build_liquidity_summary(db_session)
    assert summary["liquid_balance"] == 61381
    assert summary["credit_card_debt"] == 31476
    assert summary["net_liquid"] == 29905


def test_settle_iou_respects_iou_direction(client, db_session):
    from app.models.account import Account
    from app.models.iou import IOU, IOUStatus, IOUType

    acc = Account(name="Corriente", account_type="checking", balance=10000)
    db_session.add(acc)
    db_session.flush()
    i_owe = IOU(person_name="Luis", amount=2500, iou_type=IOUType.I_OWE, status=IOUStatus.PENDING)
    they_owe = IOU(person_name="Ana", amount=1500, iou_type=IOUType.THEY_OWE, status=IOUStatus.PENDING)
    db_session.add_all([i_owe, they_owe])
    db_session.commit()

    res_pay = client.post(f"/ious/{i_owe.id}/settle", json={"account_id": acc.id})
    assert res_pay.status_code == 200
    db_session.refresh(acc)
    assert acc.balance == 7500

    res_collect = client.post(f"/ious/{they_owe.id}/settle", json={"account_id": acc.id})
    assert res_collect.status_code == 200
    db_session.refresh(acc)
    assert acc.balance == 9000


def test_put_transaction_accepts_splits_payload(client, db_session):
    from app.models.account import Account
    from app.models.category import Category

    acc = Account(name="Cuenta", account_type="checking", balance=50000)
    cat_a = Category(name="Comida")
    cat_b = Category(name="Hogar")
    db_session.add_all([acc, cat_a, cat_b])
    db_session.commit()

    created = client.post("/transactions/", json={
        "description": "Supermercado",
        "amount": 10000,
        "transaction_type": "expense",
        "payment_method": "debit_card",
        "account_id": acc.id,
        "category_id": cat_a.id,
    }).json()

    updated = client.put(f"/transactions/{created['id']}", json={
        "splits": [
            {"amount": 6000, "category_id": cat_a.id, "description": "Víveres"},
            {"amount": 4000, "category_id": cat_b.id, "description": "Limpieza"},
        ],
    })
    assert updated.status_code == 200
    body = updated.json()
    assert len(body["splits"]) == 2
    assert sum(item["amount"] for item in body["splits"]) == 10000


def test_decrypt_value_with_status_never_treats_foreign_fernet_as_plaintext(monkeypatch):
    from cryptography.fernet import Fernet
    from app import security_config
    from app.utils.crypto import decrypt_value_with_status

    key_a = Fernet.generate_key().decode()
    key_b = Fernet.generate_key().decode()
    token_from_a = Fernet(key_a.encode()).encrypt(b"refresh-secret").decode()

    monkeypatch.setattr(security_config, "ENCRYPTION_KEY", key_b)
    plaintext, was_encrypted = decrypt_value_with_status(token_from_a)
    assert plaintext == ""
    assert was_encrypted is True


def test_statements_and_debt_shares_recalculate_user_share_and_card_balance(client, db_session):
    from app.models.account import Account

    card = Account(name="Visa Test", account_type="credit_card", balance=0)
    db_session.add(card)
    db_session.commit()

    created = client.post("/statements/", json={
        "account_id": card.id,
        "statement_balance": 10000,
        "user_share": 10000,
        "payment_due_date": "2026-11-25",
        "cut_off_date": "2026-11-10",
        "month": 11,
        "year": 2026,
        "debt_shares": [{"person_name": "Ana", "amount": 3000, "description": "Cena"}],
    })
    assert created.status_code == 200
    stmt = created.json()
    assert stmt["user_share"] == 7000

    listed = client.get(f"/statements/?account_id={card.id}")
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    fetched = client.get(f"/statements/{stmt['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["id"] == stmt["id"]

    added_share = client.post(f"/statements/{stmt['id']}/shares", json={
        "person_name": "Luis",
        "amount": 2000,
        "description": "Cine",
    })
    assert added_share.status_code == 200
    share_id = added_share.json()["id"]

    updated_share = client.put(f"/statements/shares/{share_id}", json={
        "person_name": "Luis",
        "amount": 1000,
        "description": "Cine ajuste",
    })
    assert updated_share.status_code == 200
    assert client.get(f"/statements/{stmt['id']}").json()["user_share"] == 6000

    updated_stmt = client.put(f"/statements/{stmt['id']}", json={
        "amount_paid": 2000,
        "payment_due_date": "2026-11-28",
        "cut_off_date": "2026-11-11",
    })
    assert updated_stmt.status_code == 200
    assert updated_stmt.json()["amount_paid"] == 2000

    assert client.delete(f"/statements/shares/{share_id}").status_code == 200
    assert client.get(f"/statements/{stmt['id']}").json()["user_share"] == 7000
    assert client.delete(f"/statements/{stmt['id']}").status_code == 200


def test_asset_depreciation_and_export_csv(client, db_session):
    from app.models.asset import Asset
    from app.services.asset_depreciation import AssetDepreciationService

    laptop = Asset(
        name="Laptop Pro",
        purchase_price_cents=120000,
        residual_value_cents=0,
        purchase_date=datetime(2026, 6, 1),
        estimated_life_months=12,
    )
    zero_life = Asset(
        name="Licencia",
        purchase_price_cents=5000,
        residual_value_cents=1000,
        purchase_date=datetime(2026, 1, 1),
        estimated_life_months=0,
    )
    db_session.add_all([laptop, zero_life])
    db_session.commit()

    before = AssetDepreciationService.calculate_current_value(db_session, laptop.id, datetime(2026, 5, 1))
    assert before.current_value_cents == 0

    mid = AssetDepreciationService.calculate_current_value(db_session, laptop.id, datetime(2026, 12, 1))
    assert mid.current_value_cents == 60000

    after = AssetDepreciationService.calculate_current_value(db_session, laptop.id, datetime(2027, 8, 1))
    assert after.current_value_cents == 0
    assert after.is_fully_depreciated is True

    z_val = AssetDepreciationService.calculate_current_value(db_session, zero_life.id, datetime(2026, 6, 1))
    assert z_val.current_value_cents == 1000
    assert z_val.is_fully_depreciated is True

    exported = client.get("/api/export/assets")
    assert exported.status_code == 200
    assert "Laptop Pro" in exported.text


def test_budget_service_spent_and_pacing_across_periods(client, db_session):
    from app.models.budget import Budget
    from app.models.transaction_split import TransactionSplit
    from app.services.budget_service import compute_budget_pacing, compute_budget_spent

    food = Category(name="Mercado")
    db_session.add(food)
    db_session.flush()

    tx = Transaction(
        description="Compra",
        amount=4000,
        transaction_type="expense",
        payment_method="cash",
        date=datetime(2026, 11, 5),
        category_id=food.id,
    )
    parent = Transaction(
        description="Dividida",
        amount=3000,
        transaction_type="expense",
        payment_method="cash",
        date=datetime(2026, 11, 10),
    )
    db_session.add_all([tx, parent])
    db_session.flush()
    db_session.add(TransactionSplit(transaction_id=parent.id, amount=1500, category_id=food.id))

    budget = Budget(name="Mercado Nov", amount=10000, spent=0, month=11, year=2026, category_id=food.id)
    zero_budget = Budget(name="Cero", amount=0, spent=0, month=12, year=2026, category_id=food.id)
    db_session.add_all([budget, zero_budget])
    db_session.commit()

    assert compute_budget_spent(db_session, budget) == 5500
    assert compute_budget_pacing(budget, now=datetime(2026, 12, 1))["month_progress_percentage"] == 100
    assert compute_budget_pacing(budget, now=datetime(2026, 10, 1))["month_progress_percentage"] == 0
    assert compute_budget_pacing(budget, now=datetime(2026, 11, 15), spent_override=9000)["pacing_status"] == "over_pacing"
    assert compute_budget_pacing(budget, now=datetime(2026, 11, 15), spent_override=1000)["pacing_status"] == "under_pacing"
    assert compute_budget_pacing(budget, now=datetime(2026, 11, 15), spent_override=5000)["pacing_status"] == "on_track"
    assert compute_budget_pacing(zero_budget, now=datetime(2026, 11, 15), spent_override=100)["is_over_pacing"] is True
    assert compute_budget_pacing(zero_budget, now=datetime(2026, 11, 15), spent_override=0)["pacing_status"] == "on_track"

    res = client.get("/budgets/")
    assert res.status_code == 200
    assert any(item["spent"] == 5500 for item in res.json())


def test_ai_assistant_tools_import_history_and_recent_transactions(db_session):
    from app.models.account import Account
    from app.models.import_log import ImportLog
    from app.services.ai_assistant_tools import get_import_history, get_recent_transactions

    acc = Account(name="Ahorros", account_type="savings", balance=12000)
    db_session.add(acc)
    db_session.flush()
    db_session.add(ImportLog(account_id=acc.id, file_hash="hash-estado-1", filename="estado.pdf", status="processed"))
    db_session.add(Transaction(
        description="Farmacia",
        amount=1800,
        transaction_type="expense",
        payment_method="cash",
        account_id=acc.id,
        date=datetime(2026, 11, 12),
    ))
    db_session.commit()

    imports = get_import_history(db_session)
    assert len(imports) == 1
    assert imports[0]["filename"] == "estado.pdf"

    recent = get_recent_transactions(db_session)
    assert len(recent["transactions"]) >= 1
    assert recent["transactions"][0]["type"] == "expense"


def test_backup_path_validation_gdrive_credentials_and_config_masking(client, db_session, tmp_path, monkeypatch):
    from cryptography.fernet import Fernet
    from app import security_config
    from app.models.config import Config
    from app.utils import backup_gdrive, backup_local
    from app.utils.crypto import encrypt_value

    backups_dir = tmp_path / "backups"
    backups_dir.mkdir()
    monkeypatch.setattr(backup_local, "_DB_PATH", str(tmp_path / "finance.db"))

    outside = tmp_path / "outside.db"
    outside.write_text("x", encoding="utf-8")
    assert backup_local.delete_pre_restore_backup(str(outside))["success"] is False

    missing = backups_dir / "pre_restore_backup_20990101_000000.db"
    assert backup_local.delete_pre_restore_backup(str(missing))["success"] is False
    assert backup_local.rollback_to_pre_restore(str(missing))["success"] is False

    valid = backups_dir / "pre_restore_backup_20260101_000000.db"
    valid.write_text("db", encoding="utf-8")
    monkeypatch.setattr(backup_local, "restore_from_backup", lambda *_args, **_kwargs: {"success": True})
    rollback = backup_local.rollback_to_pre_restore(str(valid))
    assert rollback["success"] is True
    assert not valid.exists()

    key_a = Fernet.generate_key().decode()
    key_b = Fernet.generate_key().decode()
    foreign_token = Fernet(key_a.encode()).encrypt(b"refresh-token-123").decode()
    monkeypatch.setattr(security_config, "ENCRYPTION_KEY", key_b)

    db_session.add_all([
        Config(key="GOOGLE_DRIVE_CLIENT_ID", value="client-1", value_type="string", is_public=False),
        Config(key="GOOGLE_DRIVE_CLIENT_SECRET", value=encrypt_value("sec-1"), value_type="string", is_public=False),
        Config(key="GOOGLE_DRIVE_REFRESH_TOKEN", value=foreign_token, value_type="string", is_public=False),
    ])
    db_session.commit()

    class SessionProxy:
        def query(self, *args, **kwargs):
            return db_session.query(*args, **kwargs)

        def commit(self):
            db_session.commit()

        def close(self):
            return None

    monkeypatch.setattr("database.SessionLocal", lambda: SessionProxy())
    assert backup_gdrive.get_google_drive_credentials() is None
    stored_token = db_session.query(Config).filter(Config.key == "GOOGLE_DRIVE_REFRESH_TOKEN").first()
    assert stored_token.value == foreign_token

    mask_res = client.put("/config/GOOGLE_DRIVE_CLIENT_SECRET", json={"value": "********"})
    assert mask_res.status_code == 200
    secret_res = client.put("/config/GOOGLE_DRIVE_CLIENT_SECRET", json={"value": "nuevo-secreto"})
    assert secret_res.status_code == 200
    refreshed = db_session.query(Config).filter(Config.key == "GOOGLE_DRIVE_CLIENT_SECRET").first()
    assert str(refreshed.value).startswith("gAAAAAB")


def test_recalculate_stale_snapshots_background_clears_is_stale(db_session, monkeypatch):
    from app.models.net_worth_snapshot import NetWorthSnapshot
    from app.services.snapshot_service import recalculate_stale_snapshots_background

    snap = NetWorthSnapshot(
        month=11,
        year=2026,
        snapshot_date=datetime(2026, 11, 30),
        total_assets=0,
        total_liabilities=0,
        net_worth=0,
        is_stale=True,
    )
    db_session.add(snap)
    db_session.commit()

    class SessionProxy:
        def __getattr__(self, name):
            return getattr(db_session, name)

        def close(self):
            return None

    monkeypatch.setattr("database.SessionLocal", lambda: SessionProxy())
    updated = recalculate_stale_snapshots_background()
    assert updated == 1
    db_session.refresh(snap)
    assert bool(snap.is_stale) is False


def test_auth_last_sync_throttling_and_health_security_headers(client, db_session):
    from datetime import timedelta
    import jwt as pyjwt
    from starlette.requests import Request
    from app.api.auth import get_current_device
    from app.models.device import PairedDevice
    from app.security_config import ALGORITHM, AUTH_COOKIE_NAME, JWT_SECRET

    health_res = client.get("/health")
    assert health_res.status_code == 200
    assert health_res.headers.get("x-content-type-options") == "nosniff"
    assert health_res.headers.get("x-frame-options") == "DENY"

    device = PairedDevice(device_name="Test-PC", is_active=True, last_sync=None)
    db_session.add(device)
    db_session.commit()

    token = pyjwt.encode({"sub": device.id}, JWT_SECRET, algorithm=ALGORITHM)
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": [(b"cookie", f"{AUTH_COOKIE_NAME}={token}".encode())],
    }
    req = Request(scope)

    resolved_first = get_current_device(req, db_session)
    assert resolved_first.id == device.id
    first_sync = resolved_first.last_sync
    assert first_sync is not None

    resolved_second = get_current_device(req, db_session)
    assert resolved_second.last_sync == first_sync

    stale_time = datetime.now(timezone.utc) - timedelta(minutes=10)
    device.last_sync = stale_time
    db_session.commit()
    resolved_third = get_current_device(req, db_session)
    assert resolved_third.last_sync > stale_time.replace(tzinfo=None)


def test_google_oauth_callback_and_drive_backup_helpers(client, db_session, tmp_path, monkeypatch):
    from types import SimpleNamespace
    from unittest.mock import MagicMock
    from cryptography.fernet import Fernet
    from app import security_config
    from app.models.config import Config
    from app.utils import backup_gdrive
    from app.utils.crypto import encrypt_value

    monkeypatch.setattr(security_config, "ENCRYPTION_KEY", Fernet.generate_key().decode())

    db_session.add_all([
        Config(key="GOOGLE_DRIVE_CLIENT_ID", value="cid-oauth", value_type="string", is_public=False),
        Config(key="GOOGLE_DRIVE_CLIENT_SECRET", value=encrypt_value("csec-oauth"), value_type="string", is_public=False),
    ])
    db_session.commit()

    def fake_post_error(*_args, **_kwargs):
        return SimpleNamespace(json=lambda: {"error": "access_denied", "error_description": "<script>bad</script>"})

    monkeypatch.setattr("app.api.backup.requests.post", fake_post_error)
    err_res = client.get("/backup/google/callback?code=c1")
    assert err_res.status_code == 200
    assert "<script>" not in err_res.text
    assert "&lt;script&gt;bad&lt;/script&gt;" in err_res.text

    def fake_post_no_rt(*_args, **_kwargs):
        return SimpleNamespace(json=lambda: {"access_token": "at-only"})

    monkeypatch.setattr("app.api.backup.requests.post", fake_post_no_rt)
    no_rt_res = client.get("/backup/google/callback?code=c2")
    assert no_rt_res.status_code == 200
    assert "No se recibió" in no_rt_res.text

    def fake_post_ok(*_args, **_kwargs):
        return SimpleNamespace(json=lambda: {"refresh_token": "rt-fresh-secret"})

    monkeypatch.setattr("app.api.backup.requests.post", fake_post_ok)
    ok_res = client.get("/backup/google/callback?code=c3")
    assert ok_res.status_code == 200
    assert "Autorización Exitosa" in ok_res.text
    saved = db_session.query(Config).filter(Config.key == "GOOGLE_DRIVE_REFRESH_TOKEN").first()
    assert saved is not None and str(saved.value).startswith("gAAAAAB")

    def fake_post_boom(*_args, **_kwargs):
        raise RuntimeError("sensitive-boom-detail")

    monkeypatch.setattr("app.api.backup.requests.post", fake_post_boom)
    boom_res = client.get("/backup/google/callback?code=c4")
    assert boom_res.status_code == 500
    assert "sensitive-boom-detail" not in boom_res.text

    db_file = tmp_path / "finance.db"
    db_file.write_text("sqlite", encoding="utf-8")
    monkeypatch.setattr(backup_gdrive, "_DB_PATH", str(db_file))
    monkeypatch.setattr(backup_gdrive, "get_google_drive_credentials", lambda: ("cid", "csec", "rt"))
    monkeypatch.setattr(backup_gdrive, "Credentials", lambda **_kw: MagicMock(refresh=MagicMock()))
    monkeypatch.setattr("google.auth.transport.requests.Request", lambda: None)

    fake_files = MagicMock()
    fake_files.get.return_value.execute.return_value = {"name": "../../tabula_rasa_backup_test.sqlite3"}
    fake_files.get_media.return_value = b"stream"
    fake_files.list.return_value.execute.return_value = {
        "files": [
            {"id": f"id-{i}", "name": f"tabula_rasa_backup_{i}.sqlite3"}
            for i in range(backup_gdrive.BACKUP_ROTATION_COUNT + 1)
        ]
    }
    fake_drive = MagicMock()
    fake_drive.files.return_value = fake_files
    monkeypatch.setattr(backup_gdrive, "build", lambda *_a, **_kw: fake_drive)
    monkeypatch.setattr(
        backup_gdrive.googleapiclient.http,
        "MediaIoBaseDownload",
        lambda fh, _req: SimpleNamespace(next_chunk=lambda: (fh.write(b"sqlite") and None, True)),
    )

    downloaded = backup_gdrive.download_backup_from_drive("b-1")
    assert downloaded is not None
    assert "tabula_rasa_backup_test.sqlite3" in downloaded

    backup_gdrive.rotate_google_drive_backups(fake_drive, "folder-1")
    fake_files.delete.assert_called_once_with(fileId="id-0")


def test_goal_progress_and_subscription_payment_fingerprints(client, db_session):
    from app.models.account import Account
    from app.models.goal import Goal
    from app.models.subscription import Subscription, SubscriptionFrequency

    acc = Account(name="Corriente Sub", account_type="checking", balance=50000)
    cat = Category(name="Streaming")
    goal = Goal(name="Viaje", target_amount=20000, current_amount=0)
    db_session.add_all([acc, cat, goal])
    db_session.flush()

    sub = Subscription(
        name="Musica",
        amount=1200,
        frequency=SubscriptionFrequency.MONTHLY,
        account_id=acc.id,
        category_id=cat.id,
        is_active=True,
    )
    db_session.add(sub)
    db_session.commit()

    pay_res = client.post(f"/subscriptions/{sub.id}/pay")
    assert pay_res.status_code == 200

    txn_res = client.post("/transactions/", json={
        "description": "Aporte Viaje",
        "amount": 5000,
        "transaction_type": "expense",
        "payment_method": "transfer",
        "account_id": acc.id,
        "goal_id": goal.id,
    })
    assert txn_res.status_code == 200

    recalc_res = client.post("/goals/recalculate-progress")
    assert recalc_res.status_code == 200
    db_session.refresh(goal)
    assert goal.current_amount == 5000


def test_get_insights_falls_back_across_models_and_to_local_summary(monkeypatch):
    from types import SimpleNamespace
    from google.genai import errors
    from app.api import ai_insights
    from app.services import ai_models

    monkeypatch.setattr(ai_models.time, "sleep", lambda _s: None)
    monkeypatch.setattr(ai_insights, "get_gemini_key", lambda _db: "k-test")
    sample_data = {
        "txn_summary": {"total_expenses": 50000, "atypical_transactions": []},
        "budget_summary": [{"category": "Comida", "spent": 12000, "limit": 10000, "exceeded": True}],
        "cc_summary": {"pending_amount": 25000, "open_statements": 1, "statements_due_within_7_days": 1},
        "liquidity": {"liquid_balance": 40000, "ious_receivable": 0, "credit_card_debt": 25000, "net_liquid": 15000},
        "debt_summary": {"total_pending_debt_shares": 0, "pending_debt_count": 0, "upcoming_cutoffs_within_7_days": 0, "debts_by_person": {}},
        "goals_summary": {"active_count": 0, "total_target": 0, "total_current": 0, "total_remaining": 0, "overall_progress_pct": 0.0, "goals": []},
        "historical": {"avg_monthly_income": 100000, "avg_monthly_expense": 50000},
        "rolling": {"rolling_30d_income": 100000, "rolling_30d_expenses": 70000, "rolling_30d_balance": 30000, "rolling_30d_expense_by_category": {}},
        "recurring_small": [{"name": "Café", "occurrences": 4, "total_amount": 1600}],
        "day_of_month": 15,
        "days_in_month": 30,
        "percentage_elapsed": 50.0,
        "current_daily_burn": 3000.0,
        "historical_daily_burn": 1666.0,
        "burn_rate_ratio": 1.8,
        "safe_to_spend": -500,
    }
    monkeypatch.setattr(ai_insights, "_collect_insight_data", lambda *_a: sample_data)
    monkeypatch.setattr(ai_insights, "_build_financial_snapshot", lambda *_a: "RESUMEN")
    monkeypatch.setattr(ai_insights, "_build_insights_prompt", lambda *_a: "PROMPT")

    seen_models = []

    def partial_fail_generate(model, **_kwargs):
        seen_models.append(model)
        if model == ai_insights.REASONING_MODEL:
            raise errors.ServerError(503, {"error": {"code": 503, "message": "high demand"}})
        return SimpleNamespace(text='{"insights":["ok"],"alerts":[],"patterns":[]}')

    monkeypatch.setattr(ai_insights, "create_gemini_client", lambda _k: SimpleNamespace(models=SimpleNamespace(generate_content=partial_fail_generate)))
    res_fallback_model = ai_insights.get_insights(db=SimpleNamespace())
    assert res_fallback_model["insights"] == ["ok"]
    assert len(set(seen_models)) >= 2

    def all_503_generate(**_kwargs):
        raise errors.ServerError(503, {"error": {"code": 503, "message": "UNAVAILABLE"}})

    monkeypatch.setattr(ai_insights, "create_gemini_client", lambda _k: SimpleNamespace(models=SimpleNamespace(generate_content=all_503_generate)))
    res_local = ai_insights.get_insights(db=SimpleNamespace())
    assert len(res_local["insights"]) == 3
    assert any("Comida" in a for a in res_local["alerts"])
    assert any("Café" in p for p in res_local["patterns"])
