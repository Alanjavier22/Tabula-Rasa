import os
import random
import socket
import string
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel
import jwt
from sqlalchemy.orm import Session
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from database import get_db
from app.models.device import PairedDevice

router = APIRouter()

# --- Configuración JWT ---
JWT_SECRET = os.getenv("JWT_SECRET", "super-secret-local-finance-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 365 # 1 year

# --- Almacenamiento Temporal de Pines (En Memoria) ---
# Estructura: { "123456": {"expires_at": datetime, "used": False} }
pairing_sessions = {}

# --- Schemas ---
class PairRequest(BaseModel):
    pin: str
    device_name: str

class PairResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

class PairGenerateResponse(BaseModel):
    pin: str
    expires_in_seconds: int
    qr_url: str

# --- LAN IP Helper ---

def get_local_ip() -> str:
    """
    Detecta la IP LAN de la máquina host de forma robusta.
    Abre un socket UDP hacia una IP externa (no envía datos reales)
    para que el SO elija la interfaz de red correcta.
    Funciona sin acceso a internet (el socket no necesita conectividad real).
    Fallback: 127.0.0.1
    """
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.1)
        # No se envía tráfico real; solo fuerza al SO a resolver la interfaz
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


# --- Auth Dependency ---
security = HTTPBearer()

def get_current_device(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        device_id: str = payload.get("sub")
        if device_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Could not validate credentials")
        
    device = db.query(PairedDevice).filter(PairedDevice.id == device_id).first()
    if not device:
        raise HTTPException(status_code=401, detail="Device not found")
    if not device.is_active:
        raise HTTPException(status_code=401, detail="Device has been deactivated")
    if device.is_deleted:
        raise HTTPException(status_code=401, detail="Device has been deleted")
        
    # Update last_sync
    device.last_sync = datetime.now(timezone.utc)
    db.commit()
    
    return device


# --- Endpoints ---

@router.get("/cert/download")
def download_cert(req: Request):
    """
    Endpoint para descargar el certificado raíz (CA) e instalarlo en el móvil.
    Detecta si es Android o iOS para sugerir la extensión correcta.
    """
    user_agent = req.headers.get("user-agent", "").lower()
    is_android = "android" in user_agent
    
    # iOS prefiere .pem o .cer, Android prefiere .crt
    filename = "finance-local-ca.crt" if is_android else "finance-local-ca.pem"
    
    # Ruta al CA generado por ssl_setup.py
    cert_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "certs", "ca.pem")
    
    if not os.path.exists(cert_path):
        raise HTTPException(status_code=404, detail="CA Certificate not found. Run ssl_setup.py first.")
        
    return FileResponse(
        cert_path, 
        media_type="application/x-x509-ca-cert", 
        filename=filename
    )


@router.post("/pair/generate", response_model=PairGenerateResponse)
def generate_pairing_code():
    """Genera un PIN de 6 dígitos válido por 5 minutos."""
    # Limpiar sesiones expiradas
    now = datetime.now(timezone.utc)
    expired = [pin for pin, data in pairing_sessions.items() if data["expires_at"] < now]
    for pin in expired:
        del pairing_sessions[pin]
        
    pin = ''.join(random.choices(string.digits, k=6))
    expires_at = now + timedelta(minutes=5)
    
    pairing_sessions[pin] = {
        "expires_at": expires_at,
        "used": False
    }
    
    # Construir URL que el QR contendrá (apunta al frontend en la LAN)
    lan_ip = get_local_ip()
    api_url = f"http://{lan_ip}:8000"
    frontend_url = f"http://{lan_ip}:5173"
    qr_url = f"{frontend_url}/?{urlencode({'apiUrl': api_url, 'pin': pin})}"

    return {"pin": pin, "expires_in_seconds": 300, "qr_url": qr_url}


@router.post("/pair/consume", response_model=PairResponse)
def consume_pairing_code(req: PairRequest, db: Session = Depends(get_db)):
    """El móvil envía el PIN y recibe el JWT si es válido."""
    now = datetime.now(timezone.utc)
    session = pairing_sessions.get(req.pin)
    
    if not session:
        raise HTTPException(status_code=400, detail="Invalid or expired PIN")
    if session["used"]:
        raise HTTPException(status_code=400, detail="PIN already used")
    if session["expires_at"] < now:
        del pairing_sessions[req.pin]
        raise HTTPException(status_code=400, detail="PIN expired")
        
    # Marcar como usado
    session["used"] = True
    
    # Registrar el dispositivo en BD
    new_device = PairedDevice(
        device_name=req.device_name,
        is_active=True,
        last_sync=now
    )
    db.add(new_device)
    db.commit()
    db.refresh(new_device)
    
    # Generar JWT
    expire = now + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    to_encode = {
        "sub": new_device.id,
        "exp": expire,
        "iat": now,
        "name": req.device_name
    }
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=ALGORITHM)
    
    return {"access_token": encoded_jwt, "token_type": "bearer"}

@router.post("/pair/localhost", response_model=PairResponse)
def pair_localhost(request: Request, db: Session = Depends(get_db)):
    """
    Auto-vinculación exclusiva para la máquina host.
    Solo acepta peticiones desde 127.0.0.1 o ::1 (loopback).
    Retorna un JWT válido usando "Host-PC" como device_name.
    Es idempotente: reutiliza el dispositivo Host-PC si ya existe.
    """
    client_ip = request.client.host if request.client else None

    if client_ip not in ("127.0.0.1", "::1"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Forbidden: only loopback access allowed (got {client_ip})",
        )

    now = datetime.now(timezone.utc)

    # Reutilizar dispositivo Host-PC existente (evitar duplicados)
    device = (
        db.query(PairedDevice)
        .filter(
            PairedDevice.device_name == "Host-PC",
            PairedDevice.is_deleted == False,
        )
        .first()
    )

    if device:
        device.is_active = True
        device.last_sync = now
        db.commit()
        db.refresh(device)
    else:
        device = PairedDevice(
            device_name="Host-PC",
            is_active=True,
            last_sync=now,
        )
        db.add(device)
        db.commit()
        db.refresh(device)

    # Generar JWT estándar
    expire = now + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    to_encode = {
        "sub": device.id,
        "exp": expire,
        "iat": now,
        "name": "Host-PC",
    }
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=ALGORITHM)

    return {"access_token": encoded_jwt, "token_type": "bearer"}


@router.get("/pair/status")
def get_pairing_status(pin: str):
    """El frontend hace polling para ver si el PIN fue consumido."""
    session = pairing_sessions.get(pin)
    if not session:
        raise HTTPException(status_code=404, detail="PIN no existe o expirado")
    
    return {"used": session["used"], "expires_at": session["expires_at"]}
