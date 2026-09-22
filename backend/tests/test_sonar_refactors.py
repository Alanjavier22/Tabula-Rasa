from datetime import date, datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest


def _transaction(transaction_type="expense", amount=1000, category_name=None, category_id="cat"):
    category = SimpleNamespace(name=category_name) if category_name else None
    return SimpleNamespace(
        transaction_type=transaction_type,
        amount=amount,
        category=category,
        category_id=category_id,
        description="Compra de prueba",
        date=datetime(2026, 3, 15),
        hash=None,
    )


def test_fiscal_refactor_helpers_cover_rules_and_serializers():
    from app.api.fiscal import (
        _build_category_breakdown,
        _build_monthly_fiscal_data,
        _build_sri_declaration_data,
        _calculate_fiscal_totals,
        _parse_fiscal_dates,
        _serialize_sri_declaration,
    )

    assert _parse_fiscal_dates("2026-01-01", "2026-03-31") == (date(2026, 1, 1), date(2026, 3, 31))
    transactions = [
        _transaction("income", 1000, "Salud"),
        _transaction("expense", 2000, "Salud"),
        _transaction("expense", 3000, "Vestimenta", "clothes"),
        _transaction("transfer", 500),
    ]
    totals, categories = _calculate_fiscal_totals(transactions, Decimal("0.15"), Decimal("0.01"))
    assert totals["total_income"] == 1000
    assert totals["total_expenses"] == 5000
    assert totals["iva_projected"] == Decimal("450")
    assert len(_build_category_breakdown(categories)) == 2
    monthly = _build_monthly_fiscal_data(transactions, Decimal("0.15"))
    assert monthly["2026-03"]["expenses"] == 5000
    declaration = _build_sri_declaration_data(transactions)
    assert declaration["3320"] == Decimal("30")
    json_content, json_type, _ = _serialize_sri_declaration(declaration, 2026, "json")
    xml_content, xml_type, _ = _serialize_sri_declaration(declaration, 2026, "xml")
    assert json_type == "application/json"
    assert '"3320"' in json_content
    assert xml_type == "application/xml"
    assert b"detallesDeclaracion" in xml_content


def test_anomaly_refactor_helpers_build_subscription_and_burn_alerts():
    from app.services.anomaly_detector import (
        _build_previous_description_map,
        _category_spending,
        _get_month_periods,
        _subscription_alerts,
        _burn_rate_alerts,
    )

    now = datetime(2026, 3, 31, tzinfo=timezone.utc)
    current_start, _, previous_start, previous_end = _get_month_periods(now)
    assert current_start.month == 3
    assert previous_start.month == 2
    assert previous_end.day == 28
    previous = [_transaction(amount=1000), _transaction(amount=1500)]
    previous[0].description = "streaming"
    previous[1].description = "streaming"
    current = [_transaction(amount=2000)]
    current[0].description = "streaming"
    mapping = _build_previous_description_map(previous)
    assert mapping["streaming"] == 1500
    assert _subscription_alerts(current, mapping)[0]["severity"] == "high"
    current[0].category_id = "cat-1"
    assert _category_spending(current)["cat-1"] == 2000
    alerts = _burn_rate_alerts({"cat-1": 7000, "cat-2": 6000}, {"cat-1": 1000}, {"cat-1": "Comida"})
    assert len(alerts) == 2


def test_cashflow_refactor_helpers_cover_subscription_frequencies_and_forecast():
    from app.api.metrics_cashflow import (
        _advance_billing_date,
        _build_daily_subscriptions,
        _build_forecast,
        _get_daily_forecast_amounts,
        _normalize_forecast_days,
    )

    assert _normalize_forecast_days(0) == 30
    assert _normalize_forecast_days(400) == 365
    assert _advance_billing_date(date(2026, 1, 31), "monthly") == date(2026, 2, 28)
    assert _advance_billing_date(date(2026, 1, 31), "quarterly") == date(2026, 4, 30)
    assert _advance_billing_date(date(2026, 1, 1), "weekly") == date(2026, 1, 8)
    assert _advance_billing_date(date(2024, 2, 29), "yearly") == date(2025, 2, 28)
    today = date(2026, 3, 1)
    subscriptions = [
        SimpleNamespace(next_billing_date=datetime(2026, 3, 2), amount=100, frequency="weekly"),
        SimpleNamespace(next_billing_date=datetime(2026, 3, 3), amount=200, frequency="monthly"),
    ]
    daily = _build_daily_subscriptions(subscriptions, today, 10)
    reminders = [
        SimpleNamespace(due_date=datetime(2026, 3, 2), amount=500),
        SimpleNamespace(due_date=datetime(2026, 3, 2), amount=-200),
    ]
    statements = [SimpleNamespace(payment_due_date=datetime(2026, 3, 2), user_share=300, amount_paid=50)]
    amounts = _get_daily_forecast_amounts(reminders, statements, date(2026, 3, 2), daily)
    assert amounts[:2] == (Decimal("500"), Decimal("200"))
    forecast = _build_forecast(today, 2, Decimal("1000"), reminders, statements, daily)
    assert len(forecast) == 3


def test_balance_and_card_matching_helpers_cover_directional_rules():
    from app.models.transaction import TransactionType
    from app.services.balance import _apply_recalculation_delta, _recalculate_from_transactions
    from app.services.credit_card_payment import (
        _extract_card_brand,
        _find_brand_card,
        _find_linked_card,
        _find_named_card,
        _find_unique_bank_card,
        _match_card_by_name,
    )

    income = _transaction("income", 100)
    expense = _transaction("expense", 100)
    income.transaction_type = TransactionType.INCOME
    expense.transaction_type = TransactionType.EXPENSE
    assert _apply_recalculation_delta(1000, income, "checking") == 1100
    assert _apply_recalculation_delta(1000, expense, "checking") == 900
    assert _apply_recalculation_delta(1000, expense, "credit_card") == 900
    assert _recalculate_from_transactions(1000, [income, expense], "checking") == 1000
    assert _extract_card_brand("Pago Visa") == "visa"
    assert _match_card_by_name("Pago Platinum", "Visa Platinum")
    source = SimpleNamespace(id="source", linked_account_id=None, bank_name="Banco")
    card = SimpleNamespace(id="card", name="Visa Platinum", bank_name="Banco", linked_account_id=None)
    assert _find_named_card([card], "Pago Platinum") is card
    assert _find_brand_card([card], source, "visa") is card
    assert _find_unique_bank_card([card], source) is card
    source.linked_account_id = "card"
    assert _find_linked_card([card], source, "Pago") is card


def test_alert_snapshot_and_dashboard_helpers_cover_edge_paths():
    from app.api.alerts import _build_payment_alert
    from app.api.metrics_dashboard import _get_odometer_readings
    from app.models.account import AccountType
    from app.services.snapshot_reconciler import (
        _add_account_balance,
        _calculate_transaction_totals,
        _get_month_bounds,
    )

    status = {
        "total_debt": 1000,
        "account_id": "acc",
        "account_name": "Tarjeta",
        "latest_statement": {"id": "stmt", "due_date": "2026-03-02"},
    }
    assert _build_payment_alert(status, date(2026, 3, 1)).severity == "critical"
    assert _build_payment_alert({**status, "total_debt": 50}, date.today()) is None
    readings, total = _get_odometer_readings([
        SimpleNamespace(amount=1000, metadata_json='{"odometer": 10}', date=datetime(2026, 3, 1)),
        SimpleNamespace(amount=2000, metadata_json="bad", date=datetime(2026, 3, 2)),
    ])
    assert len(readings) == 1
    assert total == 3000
    start, end = _get_month_bounds(12, 2026)
    assert start.month == 12
    assert end.year == 2027
    income, expense, count = _calculate_transaction_totals([_transaction("income", 100), _transaction("expense", 50)])
    assert (income, expense, count) == (Decimal("100"), Decimal("50"), 2)
    assets, liabilities = _add_account_balance(SimpleNamespace(account_type=AccountType.CHECKING), Decimal("100"), Decimal("0"), Decimal("0"))
    assert (assets, liabilities) == (Decimal("100"), Decimal("0"))


def test_ai_anomaly_and_background_helpers_cover_audit_paths(monkeypatch):
    from app.api.ai_anomalies import (
        AnomalyScanRequest,
        _build_audit_evidence,
        _build_price_hikes,
        _build_transaction_histories,
        _build_zombie_leads,
    )
    from app.services import ai_background

    tx1 = _transaction(amount=1000, category_id="cat-1")
    tx1.description = "Netflix"
    tx2 = _transaction(amount=1200, category_id="cat-1")
    tx2.description = "Netflix"
    tx3 = _transaction(amount=1500, category_id="cat-1")
    tx3.description = "Netflix"
    baselines, history = _build_transaction_histories([tx1, tx2, tx3])
    assert baselines["cat-1"] == 1233.3333333333333
    assert _build_price_hikes(history)
    request = AnomalyScanRequest(
        transactions=[{"id": "tx-1", "category_id": "cat-1", "amount": 3000, "description": "Compra", "date": "2026-03-01"}],
        subscriptions=[],
        categories=[{"id": "cat-1", "name": "Comida"}],
    )
    assert len(_build_audit_evidence(request, baselines)) == 2
    assert _build_zombie_leads(request, history)
    tx1.transaction_type = "expense"
    tx1.category_id = None
    tx1.is_manual = False
    tx1.category_id = None
    assert ai_background._transaction_type_value(tx1) == "expense"
    db = MagicMock()
    db.query.return_value.all.return_value = []
    monkeypatch.setattr(ai_background, "categorize_batch", lambda *_args, **_kwargs: {})
    assert ai_background._categorize_uncategorized([tx1], db) == 1


def test_import_sri_and_debt_helpers_cover_small_service_units(monkeypatch):
    from app.services.account_import_finalizer import _build_transaction, _resolve_category
    from app.services.debt_consolidator import DebtConsolidatorService
    from app.services import sri_classifier

    db = MagicMock()
    tx_data = {
        "description": "Compra",
        "amount_cents": 1000,
        "transaction_type": "expense",
        "date": "2026-03-01",
        "balance_cents": 5000,
    }
    assert _resolve_category(db, {**tx_data, "category_id": "cat"}) == "cat"
    log = SimpleNamespace(account_id="acc", id="log")
    tx = _build_transaction(db, log, {**tx_data, "category_id": "cat"}, datetime(2026, 3, 1))
    assert tx.amount == 1000
    assert tx.account_id == "acc"
    service = DebtConsolidatorService(db)
    statement = SimpleNamespace(user_share=2000, amount_paid=500, payment_due_date=None)
    latest, debt = service._get_statement_debt([statement])
    assert latest is statement
    assert debt == 1500
    assert service._get_projected_deferreds("acc", statement) == 0
    account = SimpleNamespace(payment_day=5)
    assert service._get_due_date(account, None, date(2026, 3, 10)) == "2026-04-05"
    assert "experto tributario" in sri_classifier._build_batch_instruction()
    response = SimpleNamespace(text='{"items": [{"index": 0, "sri_category": "Salud"}]}')
    client = SimpleNamespace(models=SimpleNamespace(generate_content=lambda **_kwargs: response))
    result = sri_classifier._classify_batch_chunk(client, [(0, {"description": "Farmacia", "category_name": ""})], "prompt")
    assert result == {0: "Salud"}
    monkeypatch.setattr(db, "query", lambda *_args: SimpleNamespace(filter=lambda *_a: SimpleNamespace(first=lambda: SimpleNamespace(value="key"))))
    assert sri_classifier._resolve_api_key(db, None) == "key"


def test_ai_and_account_intelligence_helpers_cover_prompt_and_enrichment(monkeypatch, tmp_path):
    import anyio
    from app.api import ai_assistant
    from app.api import ai_insights
    from app.services import account_intelligence
    from app.services.account_intelligence import AccountIntelligenceService

    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    assert "AUDITOR FINANCIERO" in ai_assistant._build_system_instruction(db)
    assert ai_insights._normalize_insights({"insights": "uno", "alerts": "bad", "patterns": []})["insights"] == ["uno"]
    request = ai_assistant.ChatRequest(message="hola")
    handlers = ai_assistant._build_tool_handlers(db, request, "key", {})
    assert "get_total_balance" in handlers
    quota_error = Exception("429 quota")
    with pytest.raises(ai_assistant.HTTPException):
        ai_assistant._raise_assistant_error(quota_error)

    service = AccountIntelligenceService(db_session=db)
    db.query.return_value.filter.return_value.first.return_value = None
    tx = {"date": "2026-03-01", "description": "Compra", "amount_cents": 1000, "transaction_type": "expense"}
    enriched = service._enrich_transactions([tx], {}, {}, "acc")
    assert enriched[0]["fingerprint"]
    service._mark_existing_duplicates(enriched)
    assert enriched[0]["is_duplicate"] is False

    class FakeResponse:
        text = '{"transactions": []}'

    class FakeModels:
        def generate_content(self, **_kwargs):
            return FakeResponse()

    parsed = anyio.run(service._parse_with_ai, SimpleNamespace(models=FakeModels()), b"data", "file.csv", None)
    assert parsed["transactions"] == []


def test_snapshot_service_helpers_cover_metadata_and_rewind_paths():
    from app.models.account import AccountType
    from app.services.snapshot_service import (
        _build_metadata,
        _get_pending_debt_shares,
        _get_temporal_ious,
        _persist_snapshot,
        _rewind_balance,
    )
    from app.models.iou import IOUType

    db = MagicMock()
    account = SimpleNamespace(id="acc", balance=1000, account_type="checking", name="Cuenta")
    assert _rewind_balance(db, account, datetime(2026, 3, 1), False) == 1000
    query = db.query.return_value
    query.filter.return_value.all.return_value = []
    assert _get_temporal_ious(db, IOUType.THEY_OWE, datetime(2026, 3, 1)) == []
    assert _get_pending_debt_shares(db, datetime(2026, 3, 1)) == []
    metadata = _build_metadata([account], [], [], [], [])
    assert metadata["accounts"][0]["name"] == "Cuenta"
    existing = SimpleNamespace()
    result = _persist_snapshot(db, existing, 3, 2026, 100, 20, metadata, True)
    assert result is existing
    assert existing.net_worth == 80


def test_ai_insights_snapshot_prompt_and_error_branches():
    from app.api import ai_insights

    now = datetime(2026, 3, 5)
    data = {
        "txn_summary": {
            "total_expenses": 500,
            "atypical_transactions": ["$20.00 en Comida (hace 1 días)"],
        },
        "budget_summary": [{"category": "Comida", "spent": 120, "limit": 100, "exceeded": True}],
        "cc_summary": {"pending_amount": 300, "open_statements": 1, "statements_due_within_7_days": 1},
        "liquidity": {"liquid_balance": 1000, "ious_receivable": 200, "credit_card_debt": 300, "net_liquid": 900},
        "debt_summary": {
            "total_pending_debt_shares": 200,
            "pending_debt_count": 1,
            "upcoming_cutoffs_within_7_days": 0,
            "debts_by_person": {"Alex": {"total_amount": 200, "count": 1}},
        },
        "goals_summary": {
            "active_count": 1,
            "total_target": 1000,
            "total_current": 200,
            "total_remaining": 800,
            "overall_progress_pct": 20,
            "goals": [{"name": "Viaje", "current_amount": 200, "target_amount": 1000, "progress_pct": 20}],
        },
        "historical": {"avg_monthly_income": 2000, "avg_monthly_expense": 1500},
        "rolling": {
            "rolling_30d_income": 1000,
            "rolling_30d_expenses": 500,
            "rolling_30d_balance": 500,
            "rolling_30d_expense_by_category": {"Comida": 500},
        },
        "recurring_small": [{"name": "Cafe", "occurrences": 3, "total_amount": 30}],
        "day_of_month": 5,
        "days_in_month": 31,
        "percentage_elapsed": 16.1,
        "current_daily_burn": 100,
        "historical_daily_burn": 50,
        "burn_rate_ratio": 2,
        "safe_to_spend": 700,
    }
    snapshot = ai_insights._build_financial_snapshot(data, now)
    assert "TRANSACCIONES ATÍPICAS" in snapshot
    assert "PRESUPUESTOS EXCEDIDOS" in snapshot
    assert "Viaje" in snapshot

    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = SimpleNamespace(value="direct")
    assert "RESUMEN FINANCIERO" in ai_insights._build_insights_prompt(db, snapshot)
    quota_error = Exception("quota exceeded")
    with pytest.raises(ai_insights.HTTPException) as error:
        ai_insights._raise_insights_api_error(quota_error)
    assert error.value.status_code == 503
    model_error = Exception("model not found")
    with pytest.raises(ai_insights.HTTPException) as error:
        ai_insights._raise_insights_api_error(model_error)
    assert error.value.status_code == 503
    temporary_error = Exception("temporary failure")
    with pytest.raises(ai_insights.HTTPException) as error:
        ai_insights._raise_insights_api_error(temporary_error)
    assert error.value.status_code == 503


def test_ai_assistant_message_turns_and_error_branches(monkeypatch):
    import anyio
    from app.api import ai_assistant

    class FakeChat:
        def __init__(self):
            self.messages = []

        async def send_message(self, message):
            self.messages.append(message)
            return SimpleNamespace(text="respuesta", function_calls=[])

    async def retry(call):
        return await call()

    monkeypatch.setattr(ai_assistant, "with_gemini_retry_async", retry)
    chat = FakeChat()
    request = ai_assistant.ChatRequest(message="hola")
    response = anyio.run(ai_assistant._send_initial_message, chat, request)
    assert response.text == "respuesta"
    assert chat.messages == ["hola"]

    request.document_base64 = "aG9sYQ=="
    request.document_mime_type = "text/plain"
    anyio.run(ai_assistant._send_initial_message, chat, request)
    assert len(chat.messages) == 2

    call = SimpleNamespace(name="get_total_balance", args={})
    first = SimpleNamespace(function_calls=[call])
    monkeypatch.setattr(ai_assistant, "_execute_function_call", lambda *_args: _async_value({"total": 1}))
    final, calls = anyio.run(ai_assistant._run_chat_turns, first, chat, request, "key")
    assert final.text == "respuesta"
    assert calls == [{"name": "get_total_balance", "args": {}}]

    unavailable_error = Exception("503 unavailable")
    with pytest.raises(ai_assistant.HTTPException) as error:
        ai_assistant._raise_assistant_error(unavailable_error)
    assert error.value.status_code == 503
    api_key_error = Exception("bad api key")
    with pytest.raises(ai_assistant.HTTPException) as error:
        ai_assistant._raise_assistant_error(api_key_error)
    assert error.value.status_code == 401
    unexpected_error = Exception("unexpected")
    with pytest.raises(ai_assistant.HTTPException) as error:
        ai_assistant._raise_assistant_error(unexpected_error)
    assert error.value.status_code == 500


async def _async_value(value):
    return value


def test_ai_background_and_import_persistence_branches(monkeypatch):
    from app.services import ai_background
    from app.services import account_import_finalizer

    tx = _transaction()
    tx.id = "tx-1"
    tx.is_manual = True
    db = MagicMock()
    assert ai_background._categorize_uncategorized([tx], db) == 0
    tx.is_manual = False
    tx.category_id = None
    monkeypatch.setattr(ai_background, "categorize_batch", lambda *_args, **_kwargs: {0: ("cat", True)})
    assert ai_background._categorize_uncategorized([tx], db) == 1
    assert tx.category_id == "cat"
    assert tx.needs_clarification is True

    tx.sri_category = None
    db.query.return_value.all.return_value = [SimpleNamespace(id="cat", name="Comida")]
    monkeypatch.setattr(ai_background, "sri_classify_batch", lambda *_args, **_kwargs: {0: "Alimentos"})
    ai_background._classify_sri_pending([tx], db)
    assert tx.sri_category == "Alimentos"

    log = SimpleNamespace(account_id="acc", id="log")
    added = []
    db.add.side_effect = added.append
    monkeypatch.setattr(account_import_finalizer, "parse_date_robustly", lambda value: datetime.fromisoformat(value))
    monkeypatch.setattr(account_import_finalizer, "_build_transaction", lambda *_args: "transaction")
    count, earliest = account_import_finalizer._persist_confirmed_transactions(
        db,
        log,
        [{"date": "2026-03-02"}, {"date": "2026-03-01", "is_duplicate": True}],
    )
    assert (count, earliest) == (1, date(2026, 3, 2))
    assert added == ["transaction"]


def test_snapshot_and_transaction_helpers_cover_remaining_branches(monkeypatch):
    from app.models.account import AccountType
    from app.services import snapshot_service, transaction_service

    db = MagicMock()
    running = SimpleNamespace(running_balance=800)
    db.query.return_value.filter.return_value.order_by.return_value.first.side_effect = [running, None]
    db.query.return_value.filter.return_value.all.return_value = []
    accounts = [
        SimpleNamespace(id="a1", balance=1000, account_type="checking"),
        SimpleNamespace(id="a2", balance=200, account_type="checking"),
    ]
    assert snapshot_service._calculate_assets(db, accounts, datetime(2026, 3, 1), True) == 1000

    db.query.return_value.filter.return_value.first.side_effect = [SimpleNamespace(statement_balance=500), None]
    liabilities_accounts = [
        SimpleNamespace(id="card-1", balance=-700, account_type=AccountType.CREDIT_CARD),
        SimpleNamespace(id="card-2", balance=-100, account_type=AccountType.CREDIT_CARD),
    ]
    assert snapshot_service._calculate_liabilities(db, liabilities_accounts, 3, 2026, datetime(2026, 3, 1), False) == 800
    created = snapshot_service._persist_snapshot(db, None, 3, 2026, 100, 20, {}, False)
    assert created.net_worth == 80

    data = {
        "amount": "100",
        "description": "Compra",
        "date": datetime(2026, 3, 1),
        "transaction_type": "expense",
    }
    monkeypatch.setattr(transaction_service, "unique_transaction_fingerprint", lambda *_args, **_kwargs: "fp")
    transaction_service._prepare_transaction_data(db, data, None)
    assert data["amount"] == 100
    assert data["is_manual"] is True
    assert data["fingerprint"] == "fp"
    db.query.return_value.filter.return_value.first.side_effect = None
    account = SimpleNamespace(account_type=AccountType.CREDIT_CARD)
    db.query.return_value.filter.return_value.first.return_value = account
    payment = {"transaction_type": "income", "account_id": "card"}
    transaction_service._mark_internal_credit_card_payment(db, payment)
    assert payment["is_internal"] is True
    monkeypatch.setattr("app.services.credit_card_payment.process_cross_payment", lambda *_args: None)
    transaction_service._process_cross_payment(db, SimpleNamespace(account_id="card"))
    monkeypatch.setattr("app.api.goals.recalculate_goal_progress", lambda *_args: None)
    transaction_service._recalculate_goal_if_needed(db, SimpleNamespace(goal_id="goal"))


def test_backup_helpers_and_sankey_helpers_cover_small_pure_paths(monkeypatch, tmp_path):
    from app.api.metrics_dashboard import (
        _add_sankey_expense,
        _append_sankey_expenses,
        _build_sankey_data,
        _get_sankey_income,
    )
    from app.utils import backup_gdrive, backup_local

    valid = tmp_path / "backup_20260301_120000.db"
    valid.write_text("db")
    assert backup_local._get_file_timestamp(str(valid), valid.name, "backup_", ".db").year == 2026
    invalid = tmp_path / "backup_invalid.db"
    invalid.write_text("db")
    assert backup_local._get_file_timestamp(str(invalid), invalid.name, "backup_", ".db")
    for name in ("backup_20260301_120000.db", "backup_20260302_120000.db"):
        (tmp_path / name).write_text("db")
    backup_local._rotate_files_with_pattern(str(tmp_path), "backup_", ".db", 1)
    assert len(list(tmp_path.glob("backup_*.db"))) == 1

    backup_gdrive._cleanup_local_backup(None)
    backup_gdrive._cleanup_local_backup(str(valid))
    assert not valid.exists()

    class Files:
        def create(self, **_kwargs):
            return SimpleNamespace(execute=lambda: {"id": "uploaded"})

    drive = SimpleNamespace(files=lambda: Files())
    monkeypatch.setattr(backup_gdrive, "MediaFileUpload", lambda *_args, **_kwargs: object())
    assert backup_gdrive._upload_backup(drive, str(invalid), "backup.db", "folder") is True
    income = _transaction("income", 250)
    income.splits = []
    assert _get_sankey_income(income) == 250
    expenses = {}
    expense = _transaction("expense", 50, "Comida")
    expense.splits = []
    income_expense = _transaction("expense", 80, "Comida")
    income_expense.splits = []
    _add_sankey_expense(expense, expenses)
    _add_sankey_expense(income_expense, expenses)
    assert expenses == {"Comida": 130}
    nodes, links = [], []
    assert _append_sankey_expenses(nodes, links, expenses) == 2
    assert _build_sankey_data(100, expenses)["nodes"][0]["name"] == "Ingresos"


def test_insight_fiscal_and_integrity_helpers_cover_edge_values():
    from app.api.fiscal import _get_sri_concept_code, _is_zero_iva_category
    from app.services.insights_builders import (
        _build_atypical_transactions,
        _build_expense_categories,
        _sum_by_transaction_type,
    )
    from app.services.snapshot_reconciler import SnapshotReconciler
    from app.services.statement_intelligence import StatementIntelligenceService
    from init_db import _get_sqlite_type

    assert _is_zero_iva_category("salud") is True
    assert _is_zero_iva_category("Comida") is False
    assert _get_sri_concept_code("salud")
    assert _get_sri_concept_code("No existe") is None
    transactions = [_transaction("expense", 100, "Comida"), _transaction("income", 200, "Ingresos")]
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = SimpleNamespace(name="Comida")
    cache, categories = _build_expense_categories(db, transactions)
    assert categories == {"Comida": 100}
    assert cache["cat"] == "Comida"
    assert _sum_by_transaction_type(transactions, "income") == 200
    atypical = _build_atypical_transactions(transactions, cache, 40, datetime(2026, 3, 20))
    assert len(atypical) == 1
    assert SnapshotReconciler.validate_transaction_hash(SimpleNamespace(hash=None)) is True
    assert SnapshotReconciler.validate_transaction_hash(SimpleNamespace(
        hash="bad", account_id="a", date="d", description="x", amount=1
    )) is False
    assert StatementIntelligenceService._deferred_installments("3/12") == (3, 12)
    assert StatementIntelligenceService._deferred_installments("x/y") == (1, 1)
    assert _get_sqlite_type("INTEGER") == "INTEGER"
