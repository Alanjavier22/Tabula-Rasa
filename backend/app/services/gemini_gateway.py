"""Shared Gemini configuration and client construction helpers.

Keeping these concerns in one module prevents individual AI endpoints from
drifting in key resolution, secret handling, and HTTP timeout configuration.
"""

import os
import logging
from typing import Optional

from google import genai
from google.genai import types
from sqlalchemy.orm import Session

from app import security_config
from app.models.config import Config
from app.utils.crypto import decrypt_value, encrypt_value


GEMINI_CONFIG_KEY = "gemini_api_key"
DEFAULT_TIMEOUT_MS = 120_000
MAX_TIMEOUT_MS = 300_000
logger = logging.getLogger(__name__)


def get_configured_gemini_key(db: Session) -> Optional[str]:
    """Return the configured key, decrypting new and legacy values alike."""
    config_entry = db.query(Config).filter(Config.key == GEMINI_CONFIG_KEY).first()
    if config_entry and config_entry.value:
        stored_value = str(config_entry.value)
        # Keep old plaintext test/development records readable when the
        # encryption key is not configured. Production bootstrapping requires
        # CONFIG_ENCRYPTION_KEY before the app starts, so encrypted records are
        # always decrypted in the real application path.
        if not security_config.ENCRYPTION_KEY:
            return stored_value
        return decrypt_value(stored_value)

    env_key = os.getenv("GEMINI_API_KEY")
    return env_key.strip() if env_key and env_key.strip() else None


def encrypt_gemini_key(api_key: str) -> str:
    """Encrypt a Gemini key before persisting it in the config table."""
    return encrypt_value(api_key.strip())


def create_gemini_client(api_key: str, client_cls=genai.Client) -> genai.Client:
    """Create a client with a bounded request timeout for every endpoint."""
    try:
        timeout_ms = int(os.getenv("GEMINI_TIMEOUT_MS", str(DEFAULT_TIMEOUT_MS)))
    except (TypeError, ValueError):
        logger.warning("Invalid GEMINI_TIMEOUT_MS; using the default timeout")
        timeout_ms = DEFAULT_TIMEOUT_MS
    if timeout_ms <= 0:
        logger.warning("GEMINI_TIMEOUT_MS must be positive; using the default timeout")
        timeout_ms = DEFAULT_TIMEOUT_MS
    timeout_ms = min(timeout_ms, MAX_TIMEOUT_MS)
    return client_cls(
        api_key=api_key,
        http_options=types.HttpOptions(timeout=timeout_ms),
    )
