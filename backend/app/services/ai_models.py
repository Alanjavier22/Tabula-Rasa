import os

# CENTRALIZED AI MODEL ROUTER CONFIGURATION
# Defines which model to use for each class of intelligence in the project.
# Supports overriding via environment variables for testing or flexibility.

# All tasks use gemini-3.1-flash-lite as the unified model.
# It supports function calling, vision/multimodal, and fast text classification.

# 1. AGENTIC / CHAT ORCHESTER
# Specialized in tool utilization (Function Calling) and dynamic planning.
AGENT_MODEL = os.getenv("AGENT_MODEL", "gemini-3.1-flash-lite")

# 2. REASONING / DEEP ANALYTICS
# Specialized in deep financial audit, executive health scores, net worth analysis.
REASONING_MODEL = os.getenv("REASONING_MODEL", "gemini-3.1-flash-lite")

# 3. MULTIMODAL / VISION / AUDIO
# Specialized in fast OCR receipt reading, PDF parsing, and audio processing.
MULTIMODAL_MODEL = os.getenv("MULTIMODAL_MODEL", "gemini-3.1-flash-lite")

# 4. HIGH FREQUENCY / LITE
# Specialized in batch categorization and fast text classification.
LITE_MODEL = os.getenv("LITE_MODEL", "gemini-3.1-flash-lite")

# 5. EMBEDDING / SEMANTIC SIMILARITY
# Specialized in generating vector embeddings for duplicate detection,
# categorization pattern matching, and anomaly grouping.
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "gemini-embedding-2")
EMBEDDING_DIMENSIONS = int(os.getenv("EMBEDDING_DIMENSIONS", "768"))
