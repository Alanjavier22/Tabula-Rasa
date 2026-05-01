import uuid
import random
import string
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from database import get_db
from app.models.authorized_device import AuthorizedDevice

router = APIRouter()

# --- In-Memory Cache for Handshake Sessions ---
# Structure: { "token_uuid": {"pin": "123456", "expires_at": datetime, "used": False} }
handshake_cache = {}

# --- Pydantic v2 Schemas ---
class HandshakeGenerateResponse(BaseModel):
    token: str = Field(..., description="UUIDv4 token for tracking")
    pin: str = Field(..., description="6-digit PIN for validation")
    expires_in_seconds: int = Field(..., description="TTL in seconds")

class HandshakeValidateRequest(BaseModel):
    pin: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")
    device_name: str = Field(..., min_length=1, max_length=100)

class HandshakeValidateResponse(BaseModel):
    api_key_local: str = Field(..., description="Persistent API key for device")
    device_id: str = Field(..., description="Device UUID")

# --- Helper Functions ---
def generate_pin() -> str:
    """Generate 6-digit PIN."""
    return ''.join(random.choices(string.digits, k=6))

def cleanup_expired_sessions():
    """Remove expired sessions from cache."""
    now = datetime.now(timezone.utc)
    expired_tokens = [
        token for token, data in handshake_cache.items()
        if data["expires_at"] < now
    ]
    for token in expired_tokens:
        del handshake_cache[token]

# --- Endpoints ---
@router.post("/generate", response_model=HandshakeGenerateResponse)
def generate_handshake():
    """
    Generate a new handshake session.
    Returns UUIDv4 token + 6-digit PIN valid for 5 minutes.
    """
    cleanup_expired_sessions()
    
    token = str(uuid.uuid4())
    pin = generate_pin()
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=300)
    
    handshake_cache[token] = {
        "pin": pin,
        "expires_at": expires_at,
        "used": False
    }
    
    return {
        "token": token,
        "pin": pin,
        "expires_in_seconds": 300
    }

@router.post("/validate", response_model=HandshakeValidateResponse)
def validate_handshake(req: HandshakeValidateRequest, db: Session = Depends(get_db)):
    """
    Validate PIN and return persistent API key.
    Mobile device sends PIN to receive api_key_local.
    """
    cleanup_expired_sessions()
    
    now = datetime.now(timezone.utc)
    
    # Find session with matching PIN
    session = None
    session_token = None
    for token, data in handshake_cache.items():
        if data["pin"] == req.pin and not data["used"] and data["expires_at"] >= now:
            session = data
            session_token = token
            break
    
    if not session:
        raise HTTPException(status_code=400, detail="Invalid or expired PIN")
    
    # Mark as used
    session["used"] = True
    
    # Generate persistent api_key_local (UUIDv4)
    api_key_local = str(uuid.uuid4())
    api_key_hash = AuthorizedDevice.hash_api_key(api_key_local)
    
    # Create authorized device record
    new_device = AuthorizedDevice(
        device_name=req.device_name,
        api_key_hash=api_key_hash,
        is_active=True
    )
    db.add(new_device)
    db.commit()
    db.refresh(new_device)
    
    return {
        "api_key_local": api_key_local,
        "device_id": new_device.id
    }
