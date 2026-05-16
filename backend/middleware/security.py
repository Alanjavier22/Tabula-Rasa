import jwt
from fastapi import Request, HTTPException, status
from sqlalchemy.orm import Session
from database import SessionLocal
from app.models.device import PairedDevice
import os
from datetime import datetime, timezone
from typing import cast, Any

# JWT Config (Must match auth.py)
JWT_SECRET = os.getenv("JWT_SECRET", "super-secret-local-finance-key-change-in-production")
ALGORITHM = "HS256"

class SecurityMiddleware:
    """
    Middleware to enforce local handshake security using JWT.
    Blocks external IP requests without a valid JWT from a PairedDevice.
    """
    
    # Endpoints exempt from security check (public endpoints)
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
