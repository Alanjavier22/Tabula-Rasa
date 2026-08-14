import os
import time
import logging
from typing import Callable, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")

# CENTRALIZED AI MODEL ROUTER CONFIGURATION
# Defines which model to use for each class of intelligence in the project.
# Supports overriding via environment variables for testing or flexibility.

# 1. AGENTIC / CHAT ORCHESTER
# Specialized in tool utilization (Function Calling) and dynamic planning.
# Default: gemini-3.1-flash-lite (Falls back from antigravity due to free tier quota)
AGENT_MODEL = os.getenv("AGENT_MODEL", "gemini-3.1-flash-lite")

# 2. REASONING / DEEP ANALYTICS
# Specialized in deep financial audit, executive health scores, net worth analysis.
# Default: gemini-3.5-flash-lite (mismo cumplimiento que 3.1, ~3x más rápido; 15 RPM sobran para el volumen actual)
REASONING_MODEL = os.getenv("REASONING_MODEL", "gemini-3.5-flash-lite")

# 3. MULTIMODAL / VISION / AUDIO
# Specialized in fast OCR receipt reading, PDF parsing, and audio processing.
# Default: gemini-3.1-flash-lite
MULTIMODAL_MODEL = os.getenv("MULTIMODAL_MODEL", "gemini-3.1-flash-lite")

# 4. HIGH FREQUENCY / LITE
# Specialized in batch categorization and fast text classification.
# Default: gemini-3.1-flash-lite
LITE_MODEL = os.getenv("LITE_MODEL", "gemini-3.1-flash-lite")


def with_gemini_retry(fn: Callable[[], T], max_retries: int = 5) -> T:
    """Reintenta con backoff ante 503/UNAVAILABLE transitorios de Gemini."""
    for attempt in range(max_retries):
        try:
            return fn()
        except Exception as e:
            transient = "503" in str(e) or "UNAVAILABLE" in str(e)
            if not transient or attempt == max_retries - 1:
                raise
            wait_time = (attempt + 2) * 4  # 8s, 12s, 16s, 20s...
            logger.warning(f"[Gemini] 503/UNAVAILABLE transitorio. Reintentando en {wait_time}s... ({attempt + 1}/{max_retries})")
            time.sleep(wait_time)
    raise RuntimeError("unreachable")
