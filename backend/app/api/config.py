from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from database import get_db
from app.models.config import Config
from pydantic import BaseModel

router = APIRouter(prefix="/config", tags=["config"], redirect_slashes=False)


class ConfigBase(BaseModel):
    key: str
    value: Optional[str] = None
    value_type: Optional[str] = "string"
    description: Optional[str] = None
    is_public: Optional[bool] = False


class ConfigCreate(ConfigBase):
    pass


class ConfigUpdate(BaseModel):
    value: Optional[str] = None
    value_type: Optional[str] = None
    description: Optional[str] = None
    is_public: Optional[bool] = None


class ConfigResponse(BaseModel):
    id: str
    key: str
    value: Optional[str] = None
    value_type: str
    description: Optional[str] = None
    is_public: bool

    class Config:
        from_attributes = True


@router.post("/", response_model=ConfigResponse)
def create_config(config: ConfigCreate, db: Session = Depends(get_db)):
    # Check if key already exists
    existing = db.query(Config).filter(Config.key == config.key).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Config with key '{config.key}' already exists")
    
    db_config = Config(**config.dict())
    db.add(db_config)
    db.commit()
    db.refresh(db_config)
    return db_config


@router.get("/", response_model=List[ConfigResponse])
def get_configs(
    skip: int = 0,
    limit: int = 100,
    is_public: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Config)
    if is_public is not None:
        query = query.filter(Config.is_public == is_public)
    configs = query.offset(skip).limit(limit).all()
    return configs


@router.get("/{config_key}", response_model=ConfigResponse)
def get_config(config_key: str, db: Session = Depends(get_db)):
    config = db.query(Config).filter(Config.key == config_key).first()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")
    return config


@router.put("/{config_key}", response_model=ConfigResponse)
def update_config(
    config_key: str,
    config: ConfigUpdate,
    db: Session = Depends(get_db)
):
    db_config = db.query(Config).filter(Config.key == config_key).first()
    if not db_config:
        raise HTTPException(status_code=404, detail="Config not found")
    
    update_data = config.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_config, key, value)
    
    db.commit()
    db.refresh(db_config)
    return db_config


@router.delete("/{config_key}")
def delete_config(config_key: str, db: Session = Depends(get_db)):
    db_config = db.query(Config).filter(Config.key == config_key).first()
    if not db_config:
        raise HTTPException(status_code=404, detail="Config not found")
    
    db.delete(db_config)
    db.commit()
    return {"message": "Config deleted successfully"}


# --- FASE 3.5: Google Drive Configuration Endpoints ---

class GoogleDriveCredentials(BaseModel):
    client_id: str
    client_secret: str
    refresh_token: str


class GoogleDriveStatus(BaseModel):
    is_configured: bool
    has_client_id: bool
    has_client_secret: bool
    has_refresh_token: bool


@router.get("/drive/status", response_model=GoogleDriveStatus)
def get_google_drive_status(db: Session = Depends(get_db)):
    """
    Check if Google Drive OAuth credentials are configured.
    SECURITY: Does NOT return actual token values - only status flags.
    """
    client_id_config = db.query(Config).filter(Config.key == "GOOGLE_DRIVE_CLIENT_ID").first()
    client_secret_config = db.query(Config).filter(Config.key == "GOOGLE_DRIVE_CLIENT_SECRET").first()
    refresh_token_config = db.query(Config).filter(Config.key == "GOOGLE_DRIVE_REFRESH_TOKEN").first()
    
    return GoogleDriveStatus(
        is_configured=bool(
            client_id_config and client_id_config.value and
            client_secret_config and client_secret_config.value and
            refresh_token_config and refresh_token_config.value
        ),
        has_client_id=bool(client_id_config and client_id_config.value),
        has_client_secret=bool(client_secret_config and client_secret_config.value),
        has_refresh_token=bool(refresh_token_config and refresh_token_config.value)
    )


@router.post("/drive")
def set_google_drive_credentials(credentials: GoogleDriveCredentials, db: Session = Depends(get_db)):
    """Save Google Drive OAuth credentials to database."""
    # Client ID
    client_id_config = db.query(Config).filter(Config.key == "GOOGLE_DRIVE_CLIENT_ID").first()
    if client_id_config:
        client_id_config.value = credentials.client_id
        client_id_config.updated_at = datetime.now()
    else:
        client_id_config = Config(
            key="GOOGLE_DRIVE_CLIENT_ID",
            value=credentials.client_id,
            value_type="string",
            description="Google Drive OAuth Client ID",
            is_public=False
        )
        db.add(client_id_config)
    
    # Client Secret
    client_secret_config = db.query(Config).filter(Config.key == "GOOGLE_DRIVE_CLIENT_SECRET").first()
    if client_secret_config:
        client_secret_config.value = credentials.client_secret
        client_secret_config.updated_at = datetime.now()
    else:
        client_secret_config = Config(
            key="GOOGLE_DRIVE_CLIENT_SECRET",
            value=credentials.client_secret,
            value_type="string",
            description="Google Drive OAuth Client Secret",
            is_public=False
        )
        db.add(client_secret_config)
    
    # Refresh Token
    refresh_token_config = db.query(Config).filter(Config.key == "GOOGLE_DRIVE_REFRESH_TOKEN").first()
    if refresh_token_config:
        refresh_token_config.value = credentials.refresh_token
        refresh_token_config.updated_at = datetime.now()
    else:
        refresh_token_config = Config(
            key="GOOGLE_DRIVE_REFRESH_TOKEN",
            value=credentials.refresh_token,
            value_type="string",
            description="Google Drive OAuth Refresh Token",
            is_public=False
        )
        db.add(refresh_token_config)
    
    db.commit()
    return {"message": "Google Drive credentials saved successfully"}
