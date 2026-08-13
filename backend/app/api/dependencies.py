from fastapi import HTTPException, Depends
from sqlalchemy.orm import Session
from database import get_db


def check_maintenance_lock(db: Session = Depends(get_db)) -> None:
    """
    Check if system is under maintenance lock.
    Returns 503 Service Unavailable if locked.
    
    This should be used as a dependency in all write endpoints (POST/PUT/DELETE)
    except migration endpoints.
    """
    from app.utils.backup_local import is_maintenance_locked
    
    if is_maintenance_locked(db):
        raise HTTPException(
            status_code=503,
            detail="System under maintenance. Migration in progress. Write operations are temporarily disabled."
        )


def bypass_maintenance_lock() -> None:
    """
    Bypass maintenance lock check.
    Use this only for migration endpoints.
    """
    pass
