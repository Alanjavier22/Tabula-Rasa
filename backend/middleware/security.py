import jwt
from fastapi import Request, HTTPException, status
from sqlalchemy.orm import Session
from database import SessionLocal
from app.models.device import PairedDevice
from app.api.auth import get_local_ip
from app.security_config import JWT_SECRET, ALGORITHM
from datetime import datetime, timezone
from typing import cast, Any

# Origins allowed to talk to this API - must track main.py's CORS allow_origins.
# "client_ip is loopback" alone is NOT a safe trust boundary: any page open in
# the same browser (e.g. a malicious site in another tab) can also fire a
# fetch() to https://127.0.0.1:8001/... and the OS will happily route it, so
# the server sees the exact same loopback IP as the real frontend. The Origin
# header is the only signal that actually distinguishes "our frontend" from
# "any other open tab" - browsers set it on every cross-origin request and JS
# cannot spoof it. Requests with no Origin header (curl, native tooling on the
# same machine) are left alone since they aren't the browser-CSRF vector.
ALLOWED_ORIGINS = {
    "http://localhost:5173", "https://localhost:5173",
    "http://127.0.0.1:5173", "https://127.0.0.1:5173",
    f"http://{get_local_ip()}:5173", f"https://{get_local_ip()}:5173",
}

class SecurityMiddleware:
    """
    Middleware to enforce local handshake security using JWT.
    Blocks external IP requests without a valid JWT from a PairedDevice.
    """

    # Endpoints exempt from the JWT/device check (public/bootstrap endpoints).
    # NOTE: these still go through the Origin check below - it runs first and
    # applies to every path, including these.
    EXEMPT_PATHS = [
        "/",
        "/health",
        "/auth/pair/generate",
        "/auth/pair/consume",
        "/auth/pair/status",
        "/auth/pair/localhost",
        "/auth/cert/download",
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
        if any(path.startswith(exempt) for exempt in self.EXEMPT_PATHS):
            return await call_next(request)

        # Allow loopback (localhost) without auth
        if client_ip in ("127.0.0.1", "::1", "localhost"):
            return await call_next(request)
        
        # External IP requires X-Tabula-Auth header (containing the JWT)
        auth_header = request.headers.get("X-Tabula-Auth")
        if not auth_header:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="External access requires X-Tabula-Auth header"
            )
        
        # Validate JWT and Device Status
        db: Session = SessionLocal()
        try:
            # 1. Decode JWT
            try:
                payload = jwt.decode(auth_header, JWT_SECRET, algorithms=[ALGORITHM])
                device_id = payload.get("sub")
                if not device_id:
                    raise HTTPException(status_code=403, detail="Invalid token payload")
            except Exception:
                raise HTTPException(status_code=403, detail="Invalid or expired security token")

            # 2. Check Device in DB
            device = db.query(PairedDevice).filter(
                PairedDevice.id == device_id,
                PairedDevice.is_active == True,
                PairedDevice.is_deleted == False
            ).first()
            
            if not device:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Device unauthorized or revoked"
                )
            
            # Update last_sync
            device.last_sync = cast(Any, datetime.now(timezone.utc))
            db.commit()
                
        finally:
            db.close()
        
        response = await call_next(request)
        
        # Security Hardening Headers
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        
        return response
