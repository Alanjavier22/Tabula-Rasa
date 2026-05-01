from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
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
