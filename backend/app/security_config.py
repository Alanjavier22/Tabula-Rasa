import os

# Shared by main.py (secret bootstrap), app/api/auth.py (token issuance) and
# middleware/security.py (token verification) so the three can never drift
# out of sync the way auth.py and middleware/security.py used to.
DEFAULT_JWT_SECRET = "super-secret-local-finance-key-change-in-production"
JWT_SECRET = os.getenv("JWT_SECRET", DEFAULT_JWT_SECRET)
ALGORITHM = "HS256"
