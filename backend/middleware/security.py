from fastapi import Request, HTTPException, status
from app.security_config import get_allowed_origins

# Origins allowed to talk to this API - shares the list main.py's CORS
# middleware uses (app/security_config.get_allowed_origins) so the two can't
# drift apart. "client_ip is loopback" alone is NOT a safe trust boundary: any
# page open in the same browser (e.g. a malicious site in another tab) can
# also fire a fetch() to https://127.0.0.1:8001/... and the OS will happily
# route it, so the server sees the exact same loopback IP as the real
# frontend. The Origin header is the only signal that actually distinguishes
# "our frontend" from "any other open tab" - browsers set it on every
# cross-origin request and JS cannot spoof it. Requests with no Origin header
# (curl, native tooling on the same machine) are left alone since they aren't
# the browser-CSRF vector.
ALLOWED_ORIGINS = set(get_allowed_origins())

class SecurityMiddleware:
    """
    Middleware to enforce local-only access while multi-device pairing is
    disabled. The local Host-PC session still uses the JWT cookie below the
    middleware layer.
    """

    # Public/bootstrap endpoints exempt from the local-only check.
    # NOTE: these still go through the Origin check below - it runs first and
    # applies to every path, including these.
    EXEMPT_PATHS = [
        "/",
        "/health",
        "/auth/pair/localhost",
        "/auth/logout",
        "/docs",
        "/openapi.json",
    ]

    async def __call__(self, request: Request, call_next):
        # Reject any browser request whose Origin isn't our own frontend, before
        # any IP-based trust decision is made (closes the CSRF-via-loopback gap
        # described above for every path, exempt or not).
        origin = request.headers.get("origin")
        if origin is not None and origin not in ALLOWED_ORIGINS:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Origin not allowed"
            )

        client_ip = request.client.host if request.client else "unknown"
        path = request.url.path

        # Exempt public endpoints
        if path in self.EXEMPT_PATHS:
            return await call_next(request)

        # The application is intentionally local-only for now. The old
        # multi-device pairing flow has been removed, so LAN requests must not
        # reach the financial API even if an old device cookie still exists.
        if client_ip not in ("127.0.0.1", "::1", "localhost"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Acceso remoto deshabilitado: abre Tabula Rasa en la máquina host"
            )
        
        response = await call_next(request)
        
        # Security Hardening Headers
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        
        return response
