import anyio
import base64
import io

import pytest
from fastapi import UploadFile

from app.api import backup, intelligence
from app.models.account import Account, AccountType
from app.services import statement_intelligence
from app.services.statement_intelligence import StatementIntelligenceService


def test_backup_log_values_are_encoded_and_endpoints_log_safely(monkeypatch):
    untrusted_path = "pre_restore_backup_2026\nforged-entry.db"

    encoded = backup._safe_log_value(untrusted_path)
    assert encoded == base64.b64encode(untrusted_path.encode("utf-8")).decode("ascii")
    assert "\n" not in encoded

    restore_response = backup.restore_from_drive(
        "backup\nforged-id",
        backup.RestoreRequest(confirmed=False),
        None,
    )
    assert restore_response.success is False

    monkeypatch.setattr(
        backup,
        "delete_pre_restore_backup",
        lambda _path: {"success": False, "message": "backup inválido"},
    )
    with pytest.raises(backup.HTTPException) as delete_error:
        backup.delete_pre_restore_backup_endpoint(
            backup.DeletePreRestoreRequest(backup_path=untrusted_path),
            None,
        )
    assert delete_error.value.status_code == 400

    monkeypatch.setattr(
        backup,
        "rollback_to_pre_restore",
        lambda _path: {"success": False, "message": "rollback inválido"},
    )
    with pytest.raises(backup.HTTPException) as rollback_error:
        backup.rollback_to_pre_restore_endpoint(
            backup.RollbackRequest(backup_path=untrusted_path),
            None,
        )
    assert rollback_error.value.status_code == 400


def test_upload_statement_writes_uploaded_file_asynchronously(db_session, monkeypatch, tmp_path):
    account = Account(name="Tarjeta de prueba", account_type=AccountType.CREDIT_CARD, balance=0)
    db_session.add(account)
    db_session.commit()
    db_session.refresh(account)

    async def fake_parse_statement(self, file_path, account_id, expected_bank_name=None):
        assert file_path.endswith(".pdf")
        assert account_id == account.id
        assert expected_bank_name is None
        return {"transactions": [], "source": "test"}

    monkeypatch.setattr(
        intelligence,
        "UPLOAD_DIR",
        str(tmp_path),
    )
    monkeypatch.setattr(
        intelligence.StatementIntelligenceService,
        "parse_statement",
        fake_parse_statement,
    )

    async def invoke_upload():
        upload = UploadFile(file=io.BytesIO(b"statement contents"), filename="statement.pdf")
        return await intelligence.upload_statement(str(account.id), upload, db_session)

    result = anyio.run(invoke_upload)

    assert result["parsed_data"] == {"transactions": [], "source": "test"}
    assert list(tmp_path.iterdir()) == []


def test_parse_statement_reads_file_asynchronously(db_session, monkeypatch, tmp_path):
    statement_path = tmp_path / "statement.pdf"
    statement_path.write_bytes(b"statement contents")

    class FakeResponse:
        text = '{"transactions": [], "total_new_consumos_cents": 0, "total_pagos_cents": 0}'

    class FakeModels:
        def generate_content(self, **_kwargs):
            return FakeResponse()

    class FakeClient:
        models = FakeModels()

    monkeypatch.setattr(StatementIntelligenceService, "_get_api_key", lambda _self: "test-key")
    monkeypatch.setattr(statement_intelligence.genai, "Client", lambda **_kwargs: FakeClient())
    monkeypatch.setattr("app.services.categorizer.categorize_batch", lambda _items, _db: {})

    service = StatementIntelligenceService(db_session=db_session)
    result = anyio.run(service.parse_statement, str(statement_path), "account-1")

    assert result["transactions"] == []
    assert result["audit"]["consumos_match"] is True
    assert result["audit"]["pagos_match"] is True
