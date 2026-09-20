from typing import Any, cast
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from pydantic import BaseModel
import jwt
from sqlalchemy.orm import Session
from database import get_db
from app.models.device import PairedDevice
from app.security_config import JWT_SECRET, ALGORITHM, AUTH_COOKIE_NAME

router = APIRouter(prefix="/auth", tags=["Auth"])

ACCESS_TOKEN_EXPIRE_DAYS = 365 # 1 year

# --- Schemas ---
class PairResponse(BaseModel):
    paired: bool = True
    device_name: str

# --- Auth Dependency ---

def validate_device_token(token: str, db: Session, status_code: int = 401) -> PairedDevice:
    """Decodifica y valida un JWT de dispositivo, devolviendo el PairedDevice
    activo correspondiente. Compartida por get_current_device (cookie, capa
    FastAPI) y SecurityMiddleware (capa ASGI, valida acceso no-loopback) para
    no mantener la misma lógica JWT duplicada en dos archivos."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        device_id: str = payload.get("sub")
        if device_id is None:
            raise HTTPException(status_code=status_code, detail="Invalid token")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status_code, detail="Token has expired")
    except jwt.PyJWTError:
        raise HTTPException(status_code=status_code, detail="Could not validate credentials")

    device = db.query(PairedDevice).filter(PairedDevice.id == device_id).first()
    if not device:
        raise HTTPException(status_code=status_code, detail="Device not found")
    if not device.is_active:
        raise HTTPException(status_code=status_code, detail="Device has been deactivated")
    if device.is_deleted:
        raise HTTPException(status_code=status_code, detail="Device has been deleted")

    return device


def set_auth_cookie(response: Response, request: Request, token: str):
    """Setea la cookie de sesión httpOnly. `secure` se deriva del esquema real
    del request (no se hardcodea) porque hoy conviven flujos http/https según
    cómo se accede al backend."""
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token,
        max_age=ACCESS_TOKEN_EXPIRE_DAYS * 86400,
        httponly=True,
        secure=(request.url.scheme == "https"),
        samesite="lax",
        path="/",
    )


def get_current_device(request: Request, db: Session = Depends(get_db)):
    token = request.cookies.get(AUTH_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    device = validate_device_token(token, db)

    # Update last_sync
    device.last_sync = cast(Any, datetime.now(timezone.utc))
    db.commit()

    return device


# --- Endpoints ---

@router.post("/pair/localhost", response_model=PairResponse)
def pair_localhost(request: Request, response: Response, db: Session = Depends(get_db)):
    """
    Auto-vinculación exclusiva para la máquina host.
    Solo acepta peticiones desde 127.0.0.1 o ::1 (loopback).
    Setea la cookie de sesión usando "Host-PC" como device_name.
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
        device.is_active = cast(Any, True)
        device.last_sync = cast(Any, now)
        db.commit()
        db.refresh(device)
    else:
        device = PairedDevice(
            device_name="Host-PC",
            is_active=cast(Any, True),
            last_sync=cast(Any, now),
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

    set_auth_cookie(response, request, encoded_jwt)
    return {"paired": True, "device_name": "Host-PC"}


@router.get("/me")
def get_current_session(device: PairedDevice = Depends(get_current_device)):
    """El frontend usa esto para saber si hay una sesión activa (reemplaza el
    chequeo directo de localStorage que existía antes de la cookie httpOnly)."""
    return {"device_id": device.id, "device_name": device.device_name}


@router.post("/logout")
def logout(response: Response):
    """Borra la cookie de sesión. No requiere una cookie válida, para que
    funcione incluso si ya expiró."""
    response.delete_cookie(AUTH_COOKIE_NAME, path="/")
    return {"message": "Logged out"}
