import os
import time
import asyncio
import logging
from typing import Callable

from google.genai import errors

logger = logging.getLogger(__name__)

DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite"

# CENTRALIZED AI MODEL ROUTER CONFIGURATION
# Defines which model to use for each class of intelligence in the project.
# Supports overriding via environment variables for testing or flexibility.

# 1. AGENTIC / CHAT ORCHESTER
# Specialized in tool utilization (Function Calling) and dynamic planning.
# Default: gemini-3.1-flash-lite (Falls back from antigravity due to free tier quota)
AGENT_MODEL = os.getenv("AGENT_MODEL", DEFAULT_GEMINI_MODEL)

# 2. REASONING / DEEP ANALYTICS
# Specialized in deep financial audit, executive health scores, net worth analysis.
# Default: gemini-3.5-flash-lite (mismo cumplimiento que 3.1, ~3x más rápido; 15 RPM sobran para el volumen actual)
REASONING_MODEL = os.getenv("REASONING_MODEL", "gemini-3.5-flash-lite")

# 3. MULTIMODAL / VISION / AUDIO
# Specialized in fast OCR receipt reading, PDF parsing, and audio processing.
# Default: gemini-3.1-flash-lite
MULTIMODAL_MODEL = os.getenv("MULTIMODAL_MODEL", DEFAULT_GEMINI_MODEL)

# 4. HIGH FREQUENCY / LITE
# Specialized in batch categorization and fast text classification.
# Default: gemini-3.1-flash-lite
LITE_MODEL = os.getenv("LITE_MODEL", DEFAULT_GEMINI_MODEL)


def with_gemini_retry[T](fn: Callable[[], T], max_retries: int = 5) -> T:
    """Retry transient Gemini failures with bounded exponential backoff."""
    for attempt in range(max_retries):
        try:
            return fn()
        except Exception as e:
            transient = is_transient_gemini_error(e)
            if not transient or attempt == max_retries - 1:
                raise
            wait_time = min(30, 2 ** attempt)
            logger.warning(
                "[Gemini] Error transitorio (%s). Reintentando en %ss... (%s/%s)",
                _gemini_error_code(e),
                wait_time,
                attempt + 1,
                max_retries,
            )
            time.sleep(wait_time)
    raise RuntimeError("unreachable")


async def with_gemini_retry_async[T](fn: Callable[[], T], max_retries: int = 5) -> T:
    """Async counterpart that keeps Gemini network calls off the event loop."""
    for attempt in range(max_retries):
        try:
            return await asyncio.to_thread(fn)
        except Exception as e:
            transient = is_transient_gemini_error(e)
            if not transient or attempt == max_retries - 1:
                raise
            wait_time = min(30, 2 ** attempt)
            logger.warning(
                "[Gemini] Error transitorio (%s). Reintentando en %ss... (%s/%s)",
                _gemini_error_code(e),
                wait_time,
                attempt + 1,
                max_retries,
            )
            await asyncio.sleep(wait_time)
    raise RuntimeError("unreachable")


def _gemini_error_code(error: Exception) -> object:
    return getattr(error, "code", None) or getattr(error, "status", None) or str(error)


def is_transient_gemini_error(error: Exception) -> bool:
    """Classify SDK/API errors without depending on message wording alone."""
    code = getattr(error, "code", None)
    if code in {408, 429, 500, 502, 503, 504}:
        return True
    if isinstance(error, errors.ServerError):
        return True
    if isinstance(error, (TimeoutError, asyncio.TimeoutError)):
        return True
    message = str(error).upper()
    return (
        "UNAVAILABLE" in message
        or "DEADLINE" in message
        or "TIMEOUT" in message
        or " 503" in f" {message}"
        or " 429" in f" {message}"
        or "BUSY" in message
        or "RESOURCE_EXHAUSTED" in message
    )
