from fastapi import Request, HTTPException, status
from sqlalchemy.orm import Session
from database import SessionLocal
from app.models.authorized_device import AuthorizedDevice


class SecurityMiddleware:
    """
    Middleware to enforce local handshake security.
    Blocks external IP requests without valid X-Tabula-Auth header.
    FASE 7: Added protocol version validation to prevent SHA-256 seed collisions.
    """
    
    # Current protocol version (increment when SHA-256 seed logic changes)
    CURRENT_PROTOCOL_VERSION = 1
    
    # Endpoints exempt from security check (public endpoints)
    EXEMPT_PATHS = [
        "/",
        "/health",
        "/auth/pair/generate",
        "/auth/pair/consume",
        "/auth/pair/status",
        "/auth/pair/localhost",
        "/auth/cert/download",
        "/handshake/generate",
        "/handshake/validate",
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
        
        # External IP requires X-Tabula-Auth header
        auth_header = request.headers.get("X-Tabula-Auth")
        if not auth_header:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="External access requires X-Tabula-Auth header"
            )
        
        # FASE 7: Parse protocol version from header (format: key:version)
        # Fallback to version 1 if not specified (backward compatibility)
        client_key = auth_header
        client_version = self.CURRENT_PROTOCOL_VERSION
        
        if ":" in auth_header:
            parts = auth_header.split(":", 1)
            client_key = parts[0]
            try:
                client_version = int(parts[1])
            except (ValueError, IndexError):
                client_version = 1  # Default to version 1 if invalid
        
        # Validate api_key_local against database
        db: Session = SessionLocal()
        try:
            api_key_hash = AuthorizedDevice.hash_api_key(client_key)
            device = db.query(AuthorizedDevice).filter(
                AuthorizedDevice.api_key_hash == api_key_hash,
                AuthorizedDevice.is_active == True,
                AuthorizedDevice.is_deleted == False
            ).first()
            
            if not device:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Invalid or unauthorized device"
                )
            
            # FASE 7: Validate protocol version
            # Reject if client version < current version (forces re-pairing)
            if client_version < self.CURRENT_PROTOCOL_VERSION:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Protocol version mismatch. Client version: {client_version}, Server version: {self.CURRENT_PROTOCOL_VERSION}. Please re-pair your device."
                )
            
            # Update device protocol_version if newer (upgrade)
            if client_version > device.protocol_version:
                device.protocol_version = client_version
                db.commit()
                
        finally:
            db.close()
        
        return await call_next(request)
