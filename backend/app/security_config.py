import os

# Shared by main.py (secret bootstrap), app/api/auth.py (token issuance) and
# middleware/security.py (token verification) so the three can never drift
# out of sync the way auth.py and middleware/security.py used to.
DEFAULT_JWT_SECRET = "super-secret-local-finance-key-change-in-production"
JWT_SECRET = os.getenv("JWT_SECRET", DEFAULT_JWT_SECRET)
ALGORITHM = "HS256"

# Fernet key used by app/utils/crypto.py to encrypt secrets at rest (e.g. the
# Google Drive refresh token). Bootstrapped by main.py's ensure_encryption_key(),
# same pattern as JWT_SECRET above.
ENCRYPTION_KEY = os.getenv("CONFIG_ENCRYPTION_KEY")

# httpOnly session cookie holding the device JWT (replaces the old
# Authorization/X-Tabula-Auth headers sourced from localStorage).
AUTH_COOKIE_NAME = "tabula_session"


def get_allowed_origins(lan_ip: str) -> list[str]:
    """Single source of truth for the frontend origins allowed to talk to this
    API, shared by CORSMiddleware (main.py) and SecurityMiddleware's Origin
    check (middleware/security.py) so the two lists can't drift apart."""
    return [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://localhost:5173",
        "https://127.0.0.1:5173",
        f"http://{lan_ip}:5173",
        f"https://{lan_ip}:5173",
    ]
