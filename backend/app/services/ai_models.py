import os

# CENTRALIZED AI MODEL ROUTER CONFIGURATION
# Defines which model to use for each class of intelligence in the project.
# Supports overriding via environment variables for testing or flexibility.

# 1. AGENTIC / CHAT ORCHESTER
# Specialized in tool utilization (Function Calling) and dynamic planning.
# Default: gemini-3.5-flash (Falls back from antigravity due to free tier quota)
AGENT_MODEL = os.getenv("AGENT_MODEL", "gemini-3.5-flash")

# 2. REASONING / DEEP ANALYTICS
# Specialized in deep financial audit, executive health scores, net worth analysis.
# Default: gemini-3.5-flash (Falls back from gemini-3.1-pro due to free tier quota)
REASONING_MODEL = os.getenv("REASONING_MODEL", "gemini-3.5-flash")

# 3. MULTIMODAL / VISION / AUDIO
# Specialized in fast OCR receipt reading, PDF parsing, and audio processing.
# Default: gemini-3.5-flash
MULTIMODAL_MODEL = os.getenv("MULTIMODAL_MODEL", "gemini-3.5-flash")

# 4. HIGH FREQUENCY / LITE
# Specialized in batch categorization and fast text classification.
# Default: gemini-3.1-flash-lite
LITE_MODEL = os.getenv("LITE_MODEL", "gemini-3.1-flash-lite")
