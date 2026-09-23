"""
Cubre el cifrado en reposo del GOOGLE_DRIVE_REFRESH_TOKEN (antes en texto
plano en la tabla Config). La pieza crítica es el fallback transparente:
las instalaciones existentes tienen el valor en claro en su finance.db real
y deben seguir funcionando sin re-autenticar Google Drive.
"""
import pytest
from cryptography.fernet import Fernet

from app import security_config


@pytest.fixture(autouse=True)
def encryption_key(monkeypatch):
    monkeypatch.setattr(security_config, "ENCRYPTION_KEY", Fernet.generate_key().decode())


def test_encrypt_decrypt_roundtrip():
    from app.utils.crypto import encrypt_value, decrypt_value

    plaintext = "1//0gAbCdEfGhIjKlMnOpQrStUvWxYz-refresh-token"
    ciphertext = encrypt_value(plaintext)

    assert ciphertext != plaintext
    assert decrypt_value(ciphertext) == plaintext


def test_decrypt_value_returns_legacy_plaintext_unchanged():
    from app.utils.crypto import decrypt_value

    legacy_plaintext = "1//0legacy-refresh-token-stored-before-encryption"
    assert decrypt_value(legacy_plaintext) == legacy_plaintext


def test_decrypt_value_with_status_flags_legacy_plaintext():
    from app.utils.crypto import decrypt_value_with_status, encrypt_value

    legacy_plaintext = "legacy-value"
    value, was_encrypted = decrypt_value_with_status(legacy_plaintext)
    assert value == legacy_plaintext
    assert was_encrypted is False

    encrypted = encrypt_value("some-secret")
    value, was_encrypted = decrypt_value_with_status(encrypted)
    assert value == "some-secret"
    assert was_encrypted is True


def test_get_google_drive_credentials_self_heals_legacy_plaintext_token(monkeypatch, db_session):
    from app.models.config import Config
    from app.utils.crypto import decrypt_value_with_status
    import app.utils.backup_gdrive as backup_module

    monkeypatch.setattr(backup_module, "SessionLocal", lambda: db_session)
    # SessionLocal-returned session gets closed by the function under test;
    # keep it usable across the assertions that follow by no-op'ing close().
    monkeypatch.setattr(db_session, "close", lambda: None)

    db_session.add_all([
        Config(key="GOOGLE_DRIVE_CLIENT_ID", value="client-id"),
        Config(key="GOOGLE_DRIVE_CLIENT_SECRET", value="client-secret"),
        Config(key="GOOGLE_DRIVE_REFRESH_TOKEN", value="legacy-plaintext-refresh-token"),
    ])
    db_session.commit()

    result = backup_module.get_google_drive_credentials()
    assert result == ("client-id", "client-secret", "legacy-plaintext-refresh-token")

    stored = db_session.query(Config).filter(Config.key == "GOOGLE_DRIVE_REFRESH_TOKEN").first()
    _, was_encrypted = decrypt_value_with_status(stored.value)
    assert was_encrypted is True  # self-healed: ahora queda cifrado en la DB


def test_gemini_config_is_encrypted_masked_and_resolved(db_session):
    from app.api import config as config_api
    from app.models.config import Config
    from app.services.gemini_gateway import get_configured_gemini_key

    response = config_api.create_config(
        config_api.ConfigCreate(key="gemini_api_key", value="  gemini-test-key  "),
        db_session,
    )

    stored = db_session.query(Config).filter(Config.key == "gemini_api_key").first()
    assert stored.value != "gemini-test-key"
    assert stored.is_public is False
    assert response["value"] == "********"
    assert get_configured_gemini_key(db_session) == "gemini-test-key"

    updated = config_api.update_config(
        "gemini_api_key",
        config_api.ConfigUpdate(value="new-gemini-key"),
        db_session,
    )
    assert updated["value"] == "********"
    assert get_configured_gemini_key(db_session) == "new-gemini-key"

    config_api.update_config(
        "gemini_api_key",
        config_api.ConfigUpdate(value="********"),
        db_session,
    )
    assert get_configured_gemini_key(db_session) == "new-gemini-key"
