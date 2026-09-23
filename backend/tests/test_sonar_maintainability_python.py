import asyncio
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.api.ai_audio import sanitize_pii
from app.api import transactions
from app.models.account import Account, AccountType
from app.services import insights_builders, sentinel_service
from app.services.debt_consolidator import DebtConsolidatorService
from app.services.snapshot_service import SnapshotService
from app.utils import backup_local as backup
from app.services.categorizer import _extract_beneficiary_key


def test_sanitize_pii_covers_ssn_and_address_patterns():
    sanitized = sanitize_pii("SSN 123-45-6789 y dirección 123 Main Street")

    assert "123-45-6789" not in sanitized
    assert "[REDACTED_SSN]" in sanitized
    assert "[REDACTED_ADDRESS]" in sanitized


def test_rollback_logs_success_after_deleting_pre_restore_backup(monkeypatch, tmp_path):
    backup_path = tmp_path / "pre_restore_backup_test.db"
    backup_path.write_bytes(b"backup")
    monkeypatch.setattr(
        backup,
        "restore_from_backup",
        lambda _path, create_pre_restore_backup: {"success": True},
    )
    monkeypatch.setattr(
        backup,
        "delete_pre_restore_backup",
        lambda _path: {"success": True},
    )

    result = backup.rollback_to_pre_restore(str(backup_path))

    assert result["success"] is True
    assert result["needs_restart"] is True


def test_extract_beneficiary_key_removes_trailing_transaction_code():
    result = _extract_beneficiary_key(
        "DLC UBER RIDES SA009MDSK1ENNP"
    )

    assert result == "DLC UBER RIDES"


def test_extract_beneficiary_key_removes_code_with_more_than_three_digits():
    result = _extract_beneficiary_key("SUPERMARKET AB1234XYZ")

    assert result == "SUPERMARKET"


def test_debt_status_builds_latest_statement_summary_without_statement(db_session):
    account = Account(
        name="Tarjeta de prueba",
        account_type=AccountType.CREDIT_CARD,
        balance=0,
        payment_day=5,
    )
    db_session.add(account)
    db_session.commit()
    db_session.refresh(account)

    result = DebtConsolidatorService(db_session).get_account_debt_status(str(account.id))

    assert result["total_debt"] == 0
    assert result["latest_statement"]["id"] is None
    assert result["latest_statement"]["month"] is None
    assert result["latest_statement"]["year"] is None
    assert result["latest_statement"]["due_date"]


def _configured_sentinel_service(monkeypatch):
    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = []
    monkeypatch.setattr(sentinel_service, "detect_anomalies", lambda _db: [])
    monkeypatch.setattr(
        sentinel_service,
        "get_financial_projection",
        lambda _db, months: {
            "runway_months": 6,
            "timeline": [{"projected_balance": 0}],
        },
    )
    monkeypatch.setattr(
        sentinel_service,
        "_build_liquidity_summary",
        lambda _db: {"net_liquid": 0},
    )
    monkeypatch.setattr(
        sentinel_service,
        "_build_credit_card_summary",
        lambda _db, _now: {"pending_amount": 0},
    )
    monkeypatch.setattr(
        insights_builders,
        "_build_goals_summary",
        lambda _db: {"overall_progress_pct": 0},
    )
    monkeypatch.setattr(
        insights_builders,
        "_build_debt_share_summary",
        lambda _db, _now: {"total_pending_debt_shares": 0},
    )
    monkeypatch.setattr(
        insights_builders,
        "_build_subscription_summary",
        lambda _db, _now: {"upcoming_in_30_days": 0},
    )
    monkeypatch.setattr(
        insights_builders,
        "_build_reminder_summary",
        lambda _db, _now: {"upcoming_count": 0, "total_amount": 0},
    )
    monkeypatch.setattr(SnapshotService, "get_historical_trends", lambda *_args, **_kwargs: [])
    monkeypatch.setattr(
        "app.services.ai_assistant_tools.get_fiscal_summary",
        lambda _db: {"iva_projected": 0, "retencion_projected": 0},
    )

    service = object.__new__(sentinel_service.SentinelService)
    service.db = db
    service.client = SimpleNamespace(
        models=SimpleNamespace(generate_content=lambda **_kwargs: None)
    )
    return service


def test_sentinel_fallback_handles_non_transient_ai_error(monkeypatch):
    service = _configured_sentinel_service(monkeypatch)

    def fail_generate_content(**_kwargs):
        raise RuntimeError("fatal")

    service.client.models.generate_content = fail_generate_content
    result = asyncio.run(service.generate_health_report())

    assert result["ai_error"] == "Servicio IA no disponible"


def test_sentinel_fallback_handles_empty_retry_loop(monkeypatch):
    service = _configured_sentinel_service(monkeypatch)
    monkeypatch.setattr(sentinel_service, "range", lambda _count: [], raising=False)

    result = asyncio.run(service.generate_health_report())

    assert result["ai_error"] == "Servicio IA no disponible"


def test_sentinel_fallback_handles_outer_error(monkeypatch):
    service = _configured_sentinel_service(monkeypatch)

    def fail_range(_count):
        raise ValueError("outer failure")

    monkeypatch.setattr(sentinel_service, "range", fail_range, raising=False)
    result = asyncio.run(service.generate_health_report())

    assert result["ai_error"] == "Servicio IA no disponible"


def test_sentinel_score_is_deterministic_and_includes_burn_rate_risk():
    context = {
        "liquidez_neta": 100,
        "deuda_tarjetas": 0,
        "iva_proyectado_mes": 0,
        "retenciones_proyectadas": 0,
        "runway_meses": 6,
        "anomalias_detectadas": [],
        "alarmas_ritmo_gasto": [{"category": "Comida"}],
    }

    assert sentinel_service.SentinelService._calculate_health_score(context) == 90


def test_sentinel_fallback_exposes_source_and_burn_alarms():
    service = object.__new__(sentinel_service.SentinelService)
    context = {
        "liquidez_neta": 100,
        "deuda_tarjetas": 0,
        "iva_proyectado_mes": 0,
        "retenciones_proyectadas": 0,
        "runway_meses": 6,
        "anomalias_detectadas": [],
        "alarmas_ritmo_gasto": [{
            "category": "Comida",
            "spent": 120,
            "expected": 100,
            "remaining": 0,
            "pacing_status": "over",
        }],
    }

    result = service._generate_heuristic_fallback(context, "Gemini no configurado")

    assert result["analysis_source"] == "heuristic"
    assert result["alarmas_ritmo_gasto"][0]["category"] == "Comida"
    assert result["health_score"] == 90


def test_cleanup_duplicates_unpacks_duplicate_count_without_using_it(monkeypatch):
    db = MagicMock()
    duplicate_query = MagicMock()
    duplicate_query.filter.return_value.group_by.return_value.having.return_value.all.return_value = [
        (100, "2026-09-01", "account-id", "expense", 2)
    ]
    matching_query = MagicMock()
    matching_query.filter.return_value.order_by.return_value.all.return_value = [
        SimpleNamespace()
    ]
    db.query.side_effect = [duplicate_query, matching_query]

    result = transactions.cleanup_duplicate_transactions(db)

    assert result["success"] is True
    assert result["deleted_count"] == 0
