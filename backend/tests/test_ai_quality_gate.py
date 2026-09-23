import anyio
import base64
import io
import json
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException, UploadFile


async def _run_inline(function, **_kwargs):
    return function()


def _ai_context_db(categories=None, accounts=None):
    db = MagicMock()
    db.query.return_value.filter.return_value.all.side_effect = [
        categories or [],
        accounts or [],
    ]
    return db


def test_gemini_retry_classification_and_backoff(monkeypatch):
    from google.genai import errors
    from app.services import ai_models

    class CodeError(Exception):
        code = 503

    assert ai_models.is_transient_gemini_error(CodeError()) is True
    assert ai_models.is_transient_gemini_error(errors.ServerError(503, {})) is True
    assert ai_models.is_transient_gemini_error(TimeoutError()) is True
    assert ai_models.is_transient_gemini_error(RuntimeError("RESOURCE_EXHAUSTED")) is True
    assert ai_models.is_transient_gemini_error(RuntimeError("bad request")) is False
    assert ai_models._gemini_error_code(SimpleNamespace(status="busy")) == "busy"

    calls = {"count": 0}
    waits = []

    def flaky_call():
        calls["count"] += 1
        if calls["count"] == 1:
            raise CodeError("temporarily unavailable")
        return "ok"

    monkeypatch.setattr(ai_models.time, "sleep", waits.append)
    assert ai_models.with_gemini_retry(flaky_call, max_retries=2) == "ok"
    assert waits == [1]

    async_calls = {"count": 0}

    def async_flaky_call():
        async_calls["count"] += 1
        if async_calls["count"] == 1:
            raise TimeoutError("timeout")
        return "async-ok"

    async def no_sleep(_seconds):
        return None

    monkeypatch.setattr(ai_models.asyncio, "sleep", no_sleep)
    assert anyio.run(ai_models.with_gemini_retry_async, async_flaky_call, 2) == "async-ok"

    with pytest.raises(RuntimeError):
        ai_models.with_gemini_retry(lambda: (_ for _ in ()).throw(RuntimeError("fatal")), max_retries=1)


def test_gemini_gateway_resolves_keys_and_bounds_timeout(monkeypatch):
    from app import security_config
    from app.models.config import Config
    from app.services import gemini_gateway

    monkeypatch.setattr(security_config, "ENCRYPTION_KEY", None)
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = SimpleNamespace(value="stored-key")
    assert gemini_gateway.get_configured_gemini_key(db) == "stored-key"

    db.query.return_value.filter.return_value.first.return_value = None
    monkeypatch.setenv("GEMINI_API_KEY", "  environment-key  ")
    assert gemini_gateway.get_configured_gemini_key(db) == "environment-key"
    monkeypatch.setenv("GEMINI_API_KEY", "  ")
    assert gemini_gateway.get_configured_gemini_key(db) is None

    captured = {}

    class FakeClient:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setenv("GEMINI_TIMEOUT_MS", "not-a-number")
    gemini_gateway.create_gemini_client("key", client_cls=FakeClient)
    assert captured["http_options"].timeout == gemini_gateway.DEFAULT_TIMEOUT_MS

    monkeypatch.setenv("GEMINI_TIMEOUT_MS", "999999")
    gemini_gateway.create_gemini_client("key", client_cls=FakeClient)
    assert captured["http_options"].timeout == gemini_gateway.MAX_TIMEOUT_MS

    monkeypatch.setenv("GEMINI_TIMEOUT_MS", "-10")
    gemini_gateway.create_gemini_client("key", client_cls=FakeClient)
    assert captured["http_options"].timeout == gemini_gateway.DEFAULT_TIMEOUT_MS
    assert Config.__tablename__ == "config"


def test_shared_gemini_helper_maps_success_and_failures(monkeypatch):
    from google.genai import errors
    from app.api import ai_shared

    db = MagicMock()
    monkeypatch.setattr(ai_shared, "get_configured_gemini_key", lambda _db: "configured")
    assert ai_shared.get_gemini_key(db) == "configured"
    monkeypatch.setattr(ai_shared, "get_configured_gemini_key", lambda _db: None)
    with pytest.raises(HTTPException) as missing:
        ai_shared.get_gemini_key(db)
    assert missing.value.status_code == 400

    response = SimpleNamespace(text=json.dumps({"ok": True}))
    client = SimpleNamespace(models=SimpleNamespace(generate_content=lambda **_kwargs: response))
    monkeypatch.setattr(ai_shared, "create_gemini_client", lambda _key: client)
    monkeypatch.setattr(ai_shared, "with_gemini_retry_async", _run_inline)
    assert anyio.run(ai_shared.call_gemini_json, "prompt", "key") == {"ok": True}

    for result, status in ((SimpleNamespace(text=""), 500), (SimpleNamespace(text="{"), 500)):
        monkeypatch.setattr(ai_shared, "create_gemini_client", lambda _key, result=result: SimpleNamespace(
            models=SimpleNamespace(generate_content=lambda **_kwargs: result)
        ))
        with pytest.raises(HTTPException) as error:
            anyio.run(ai_shared.call_gemini_json, "prompt", "key")
        assert error.value.status_code == status

    for exception, status in (
        (TimeoutError("slow"), 504),
        (errors.APIError(401, {}), 401),
        (errors.APIError(429, {}), 429),
        (errors.APIError(503, {}), 503),
        (errors.APIError(400, {}), 502),
        (RuntimeError("network"), 502),
    ):
        async def raise_retry(*_args, exception=exception, **_kwargs):
            raise exception

        monkeypatch.setattr(ai_shared, "with_gemini_retry_async", raise_retry)
        with pytest.raises(HTTPException) as error:
            anyio.run(ai_shared.call_gemini_json, "prompt", "key")
        assert error.value.status_code == status


def test_component_check_and_assistant_document_validation(monkeypatch):
    from app.api import ai, ai_assistant

    db = MagicMock()
    monkeypatch.setattr(ai, "get_gemini_key", lambda _db: "key")
    monkeypatch.setattr(ai, "create_gemini_client", lambda _key: SimpleNamespace(
        models=SimpleNamespace(generate_content=lambda **_kwargs: SimpleNamespace(text=" OK "))
    ))
    monkeypatch.setattr(ai, "with_gemini_retry_async", _run_inline)
    result = anyio.run(ai.test_component, "chat", db)
    assert result == {"status": "success", "message": "OK"}

    async def fail_retry(*_args, **_kwargs):
        raise RuntimeError("offline")

    monkeypatch.setattr(ai, "with_gemini_retry_async", fail_retry)
    result = anyio.run(ai.test_component, "chat", db)
    assert result["status"] == "error"

    with pytest.raises(ValueError):
        ai_assistant.ChatRequest(message="hello", document_mime_type="application/x-invalid")

    class FakeChat:
        def __init__(self):
            self.payload = None

        def send_message(self, payload):
            self.payload = payload
            return SimpleNamespace(text="respuesta")

    monkeypatch.setattr(ai_assistant, "with_gemini_retry_async", _run_inline)
    chat = FakeChat()
    response = anyio.run(ai_assistant._send_initial_message, chat, ai_assistant.ChatRequest(message="hola"))
    assert response.text == "respuesta"
    assert chat.payload == "hola"

    document = base64.b64encode(b"document").decode()
    chat = FakeChat()
    response = anyio.run(
        ai_assistant._send_initial_message,
        chat,
        ai_assistant.ChatRequest(message="resume", document_base64=document, document_mime_type="text/plain"),
    )
    assert response.text == "respuesta"
    assert isinstance(chat.payload, list)

    with pytest.raises(HTTPException) as invalid:
        anyio.run(
            ai_assistant._send_initial_message,
            FakeChat(),
            ai_assistant.ChatRequest(message="resume", document_base64="%%%"),
        )
    assert invalid.value.status_code == 400

    monkeypatch.setattr(ai_assistant, "MAX_DOCUMENT_BYTES", 1)
    with pytest.raises(HTTPException) as oversized:
        anyio.run(
            ai_assistant._send_initial_message,
            FakeChat(),
            ai_assistant.ChatRequest(message="resume", document_base64=document),
        )
    assert oversized.value.status_code == 413


def test_document_and_audio_ai_endpoints_cover_validation_and_success(monkeypatch):
    from app.api import ai_audio, ai_receipts

    categories = [SimpleNamespace(id="cat-1", name="Comida")]
    accounts = [SimpleNamespace(id="acc-1", name="Cuenta", account_type="checking")]
    db = _ai_context_db(categories, accounts)
    fake_response = SimpleNamespace(text=json.dumps({
        "transactions": [{
            "amount": 12,
            "description": "Compra",
            "transaction_type": "expense",
            "date": "2026-09-23",
        }],
        "raw_transcript": "Juan Perez juan@example.com",
    }))
    fake_client = SimpleNamespace(models=SimpleNamespace(generate_content=lambda **_kwargs: fake_response))
    monkeypatch.setattr(ai_audio, "get_gemini_key", lambda _db: "key")
    monkeypatch.setattr(ai_audio, "create_gemini_client", lambda _key: fake_client)
    monkeypatch.setattr(ai_audio, "with_gemini_retry_async", _run_inline)

    parsed = anyio.run(
        ai_audio.document_to_transactions,
        {"document_base64": base64.b64encode(b"file").decode(), "document_type": "image/jpeg"},
        db,
    )
    assert parsed.transactions[0].description == "Compra"
    assert "[REDACTED_EMAIL]" in parsed.raw_transcript

    for payload, status in (
        ({}, 400),
        ({"document_base64": "%%%"}, 400),
        ({"document_base64": "eA==", "document_type": "text/plain"}, 400),
    ):
        with pytest.raises(HTTPException) as error:
            anyio.run(ai_audio.document_to_transactions, payload, db)
        assert error.value.status_code == status

    monkeypatch.setattr(ai_audio, "MAX_DOCUMENT_BASE64_CHARS", 3)
    with pytest.raises(HTTPException) as error:
        anyio.run(ai_audio.document_to_transactions, {"document_base64": "abcd"}, db)
    assert error.value.status_code == 413

    monkeypatch.setattr(ai_audio, "MAX_DOCUMENT_BASE64_CHARS", 100)
    monkeypatch.setattr(ai_audio, "MAX_DOCUMENT_BYTES", 1)
    with pytest.raises(HTTPException) as error:
        anyio.run(ai_audio.document_to_transactions, {"document_base64": "eHg="}, db)
    assert error.value.status_code == 413

    batch_db = MagicMock()
    batch_db.query.return_value.all.return_value = categories
    batch_response = SimpleNamespace(text=json.dumps({"mapping": {"Compra": "cat-1", "Otro": "missing"}}))
    monkeypatch.setattr(ai_audio, "create_gemini_client", lambda _key: SimpleNamespace(
        models=SimpleNamespace(generate_content=lambda **_kwargs: batch_response)
    ))
    batch = anyio.run(
        ai_audio.batch_category_mapping,
        ai_audio.BatchCategoryMappingRequest(descriptions=["Compra", "Otro"]),
        batch_db,
    )
    assert batch.mapping == {"Compra": "cat-1"}

    batch_db.query.return_value.all.return_value = []
    with pytest.raises(HTTPException) as error:
        anyio.run(
            ai_audio.batch_category_mapping,
            ai_audio.BatchCategoryMappingRequest(descriptions=["Compra"]),
            batch_db,
        )
    assert error.value.status_code == 404

    monkeypatch.setattr(ai_receipts, "get_gemini_key", lambda _db: "key")
    monkeypatch.setattr(ai_receipts, "create_gemini_client", lambda _key: fake_client)
    monkeypatch.setattr(ai_receipts, "with_gemini_retry_async", _run_inline)
    audio = ai_receipts.AudioToTxnRequest(audio_base64=base64.b64encode(b"audio").decode(), audio_format="wav")
    result = anyio.run(ai_receipts.audio_to_txns, audio, MagicMock())
    assert result["transactions"][0]["transaction_type"] == "expense"

    with pytest.raises(HTTPException) as error:
        anyio.run(ai_receipts.audio_to_txns, ai_receipts.AudioToTxnRequest(audio_base64="%%%"), MagicMock())
    assert error.value.status_code == 400

    monkeypatch.setattr(ai_receipts, "MAX_AUDIO_BYTES", 1)
    with pytest.raises(HTTPException) as error:
        anyio.run(ai_receipts.audio_to_txns, audio, MagicMock())
    assert error.value.status_code == 413

    monkeypatch.setattr(ai_receipts, "MAX_AUDIO_BYTES", 12 * 1024 * 1024)
    receipt = UploadFile(file=io.BytesIO(b"receipt"), filename="receipt.jpg")
    parsed_receipt = anyio.run(ai_receipts.parse_receipt, receipt, MagicMock())
    assert parsed_receipt["transactions"][0]["description"] == "Compra"

    monkeypatch.setattr(ai_receipts, "MAX_RECEIPT_BYTES", 1)
    oversized_receipt = UploadFile(file=io.BytesIO(b"receipt"), filename="receipt.jpg")
    with pytest.raises(HTTPException) as error:
        anyio.run(ai_receipts.parse_receipt, oversized_receipt, MagicMock())
    assert error.value.status_code == 413


def test_config_sensitive_values_are_masked_and_prepared(monkeypatch):
    from app.api import config as config_api
    from app.models.config import Config

    sensitive = Config(key="gemini_api_key", value="secret", is_public=False)
    sensitive.id = "config-1"
    public = Config(key="currency", value="USD", is_public=True)
    public.id = "config-2"
    assert config_api._config_response(sensitive)["value"] == config_api.MASKED_CONFIG_VALUE
    assert config_api._config_response(public)["value"] == "USD"
    assert config_api._prepare_config_value("currency", "USD") == "USD"
    assert config_api._prepare_config_value("gemini_api_key", None) is None
    assert config_api._prepare_config_value("gemini_api_key", config_api.MASKED_CONFIG_VALUE) is None
    with pytest.raises(HTTPException):
        config_api._prepare_config_value("gemini_api_key", " ")
    monkeypatch.setattr(config_api, "encrypt_gemini_key", lambda value: f"encrypted:{value}")
    assert config_api._prepare_config_value("gemini_api_key", "secret") == "encrypted:secret"

    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    db.refresh.side_effect = lambda item: setattr(item, "id", "new-config")
    created = config_api.create_config(config_api.ConfigCreate(key="gemini_api_key", value="secret"), db)
    assert created["value"] == config_api.MASKED_CONFIG_VALUE
    assert created["is_public"] is False

    existing = Config(key="gemini_api_key", value="encrypted:old", is_public=False)
    existing.id = "existing"
    db.query.return_value.filter.return_value.first.return_value = existing
    updated = config_api.update_config("gemini_api_key", config_api.ConfigUpdate(value=config_api.MASKED_CONFIG_VALUE), db)
    assert updated["value"] == config_api.MASKED_CONFIG_VALUE
    assert existing.value == "encrypted:old"


def test_intelligence_import_boundaries_and_success_paths(monkeypatch, tmp_path):
    from app.api import intelligence

    monkeypatch.setattr(intelligence, "UPLOAD_DIR", str(tmp_path))
    account = SimpleNamespace(bank_name="Banco de prueba")
    log = SimpleNamespace(id="log-1", status="pending", metadata_json=None, error_message=None)
    db = MagicMock()
    db.query.return_value.filter.return_value.first.side_effect = [None, account, log]
    db.refresh.side_effect = lambda item: setattr(item, "id", "log-1")

    class StatementService:
        def __init__(self, _db):
            pass

        async def parse_statement(self, *_args, **_kwargs):
            return {"transactions": []}

    monkeypatch.setattr(intelligence, "StatementIntelligenceService", StatementService)
    upload = UploadFile(file=io.BytesIO(b"statement"), filename="statement.pdf")
    result = anyio.run(intelligence.upload_statement, "account-1", upload, db)
    assert result["import_log_id"] == "log-1"
    assert result["parsed_data"] == {"transactions": []}
    assert not list(tmp_path.iterdir())

    monkeypatch.setattr(intelligence, "MAX_IMPORT_FILE_BYTES", 1)
    with pytest.raises(HTTPException) as error:
        anyio.run(
            intelligence.upload_statement,
            "account-1",
            UploadFile(file=io.BytesIO(b"xx"), filename="large.pdf"),
            MagicMock(),
        )
    assert error.value.status_code == 413

    duplicate_db = MagicMock()
    duplicate_db.query.return_value.filter.return_value.first.return_value = SimpleNamespace(status="processed")
    monkeypatch.setattr(intelligence, "MAX_IMPORT_FILE_BYTES", 12 * 1024 * 1024)
    with pytest.raises(HTTPException) as error:
        anyio.run(
            intelligence.upload_statement,
            "account-1",
            UploadFile(file=io.BytesIO(b"statement"), filename="statement.pdf"),
            duplicate_db,
        )
    assert error.value.status_code == 400

    account_log = SimpleNamespace(id="account-log", status="pending", metadata_json=None, error_message=None)
    account_db = MagicMock()
    account_db.query.return_value.filter.return_value.first.side_effect = [None, account, account_log]
    account_db.refresh.side_effect = lambda item: setattr(item, "id", "account-log")

    class AccountService:
        def __init__(self, _db):
            pass

        async def parse_account_document(self, *_args, **_kwargs):
            return {"transactions": [{"description": "Compra"}]}

    monkeypatch.setattr(intelligence, "AccountIntelligenceService", AccountService)
    account_result = anyio.run(
        intelligence.parse_account_document,
        "account-1",
        UploadFile(file=io.BytesIO(b"account"), filename="account.pdf"),
        account_db,
    )
    assert account_result["import_log_id"] == "account-log"

    finalize_db = MagicMock()
    monkeypatch.setattr(intelligence, "finalize_account_import", lambda *_args: 3)
    response = anyio.run(
        intelligence.confirm_account_import,
        "account-log",
        intelligence.ConfirmAccountImportPayload(confirmed_transactions=[]),
        MagicMock(),
        finalize_db,
    )
    assert response["imported_count"] == 3

    health_db = MagicMock()
    health_db.query.return_value.filter.return_value.count.return_value = 2
    assert anyio.run(intelligence.check_snapshot_health, health_db) == {
        "stale_snapshots": 2,
        "needs_healing": True,
    }


def test_account_and_statement_ai_fallback_paths(monkeypatch):
    from app.services import account_intelligence, statement_intelligence

    account_service = account_intelligence.AccountIntelligenceService(MagicMock())
    failing_client = SimpleNamespace(models=SimpleNamespace(
        generate_content=lambda **_kwargs: (_ for _ in ()).throw(RuntimeError("fatal"))
    ))
    with pytest.raises(ValueError, match="IA no disponible"):
        anyio.run(account_service._parse_with_ai, failing_client, b"csv", "file.csv", None)

    statement_service = statement_intelligence.StatementIntelligenceService(MagicMock())
    with pytest.raises(ValueError, match="IA no disponible"):
        anyio.run(
            statement_service._request_parsed_data,
            failing_client,
            b"file",
            "text/plain",
            "system",
            "prompt",
        )

    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = SimpleNamespace(value="key")
    db.query.return_value.all.return_value = [SimpleNamespace(id="cat", name="Comida")]
    account_service = account_intelligence.AccountIntelligenceService(db)
    monkeypatch.setattr(account_intelligence, "create_gemini_client", lambda _key: failing_client)
    monkeypatch.setattr(account_intelligence, "get_configured_gemini_key", lambda _db: "key")
    monkeypatch.setattr(account_intelligence, "local_extract_transactions", lambda *_args: {
        "transactions": [{"date": "2026-09-23", "description": "Compra", "amount_cents": 100, "transaction_type": "expense"}]
    })
    monkeypatch.setattr("app.services.categorizer.categorize_batch", lambda *_args: {})
    db.query.return_value.filter.return_value.all.return_value = []
    result = anyio.run(account_service.parse_account_document, b"file", "account.csv", "account-1")
    assert result["transactions"][0]["description"] == "Compra"


def test_sentinel_score_fallback_and_gemini_report(monkeypatch):
    from app.services import sentinel_service

    context = {
        "liquidez_neta": 100,
        "deuda_tarjetas": 150,
        "iva_proyectado_mes": 10,
        "retenciones_proyectadas": 5,
        "runway_meses": 1,
        "anomalias_detectadas": ["Compra inusual"],
        "alarmas_ritmo_gasto": [{"category": "Comida"}],
    }
    assert sentinel_service.SentinelService._calculate_health_score(context) == 5
    fallback = sentinel_service.SentinelService.__new__(sentinel_service.SentinelService)._generate_heuristic_fallback(
        context, "offline"
    )
    assert fallback["analysis_source"] == "heuristic"
    assert fallback["alarmas_ritmo_gasto"] == context["alarmas_ritmo_gasto"]
    assert fallback["top_concerns"]

    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = []
    monkeypatch.setattr(sentinel_service, "detect_anomalies", lambda _db: [])
    monkeypatch.setattr(sentinel_service, "get_financial_projection", lambda _db, months: {
        "runway_months": 8,
        "timeline": [{"projected_balance": 1000}],
    })
    monkeypatch.setattr(sentinel_service, "_build_liquidity_summary", lambda _db: {"net_liquid": 1000})
    monkeypatch.setattr(sentinel_service, "_build_credit_card_summary", lambda _db, _now: {"pending_amount": 0})
    monkeypatch.setattr("app.services.insights_builders._build_goals_summary", lambda _db: {"overall_progress_pct": 50})
    monkeypatch.setattr("app.services.insights_builders._build_debt_share_summary", lambda _db, _now: {"total_pending_debt_shares": 0})
    monkeypatch.setattr("app.services.insights_builders._build_subscription_summary", lambda _db, _now: {"upcoming_in_30_days": []})
    monkeypatch.setattr("app.services.insights_builders._build_reminder_summary", lambda _db, _now: {"upcoming_count": 0, "total_amount": 0})
    monkeypatch.setattr("app.services.snapshot_service.SnapshotService.get_historical_trends", lambda _db, limit: [])
    monkeypatch.setattr("app.services.ai_assistant_tools.get_fiscal_summary", lambda _db: {"iva_projected": 0, "retencion_projected": 0})
    service = sentinel_service.SentinelService(db, None)
    offline_report = anyio.run(service.generate_health_report)
    assert offline_report["analysis_source"] == "heuristic"

    ai_response = SimpleNamespace(text=json.dumps({
        "health_score": 1,
        "status_summary": "Todo estable",
        "top_concerns": [],
        "recommended_action": "Continuar",
        "warnings": [{"level": "success", "message": "Bien"}],
    }))
    monkeypatch.setattr(sentinel_service, "create_gemini_client", lambda _key: SimpleNamespace(
        models=SimpleNamespace(generate_content=lambda **_kwargs: ai_response)
    ))
    monkeypatch.setattr(sentinel_service, "with_gemini_retry_async", _run_inline)
    service = sentinel_service.SentinelService(db, "key")
    ai_report = anyio.run(service.generate_health_report, "professional")
    assert ai_report["analysis_source"] == "gemini"
    assert ai_report["health_score"] == 100


def test_what_if_success_and_fallback_paths(monkeypatch):
    from app.api import ai_whatif

    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = SimpleNamespace(value="professional")
    monkeypatch.setattr(ai_whatif, "get_gemini_key", lambda _db: "key")
    response = SimpleNamespace(text=json.dumps({
        "scenario_title": "Ahorro",
        "summary": "Resumen",
        "one_time_impact": 10,
        "monthly_impact_change": 20,
        "impact_type": "saving",
        "risk_score": 2,
        "optimization_tip": "Continúa",
        "projection": [],
        "key_assumptions": ["Constante"],
    }))
    monkeypatch.setattr(ai_whatif, "create_gemini_client", lambda _key: SimpleNamespace(
        models=SimpleNamespace(generate_content=lambda **_kwargs: response)
    ))
    monkeypatch.setattr(ai_whatif, "with_gemini_retry_async", _run_inline)
    request = ai_whatif.WhatIfScenarioRequest(
        user_prompt="Ahorrar",
        avg_monthly_spend=100,
        current_net_worth=1000,
        transactions=[],
        monthly_income=100,
        fixed_expenses=50,
        total_debt=0,
        monthly_debt_payment=0,
        monthly_cash_flow=50,
    )
    result = anyio.run(ai_whatif.simulate_what_if, request, db)
    assert result.scenario_title == "Ahorro"

    async def fail_retry(*_args, **_kwargs):
        raise RuntimeError("offline")

    monkeypatch.setattr(ai_whatif, "with_gemini_retry_async", fail_retry)
    fallback = anyio.run(ai_whatif.simulate_what_if, request, db)
    assert len(fallback.projection) == 12

