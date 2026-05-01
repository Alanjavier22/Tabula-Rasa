import os
import shutil
from datetime import datetime
from pathlib import Path
from sqlalchemy.orm import Session
from database import SessionLocal, _DB_PATH


def create_physical_backup() -> str:
    """
    Create a physical copy of finance.db with timestamp before migration.
    
    Returns:
        Path to the backup file
        
    Raises:
        IOError: If backup fails
    """
    if not os.path.exists(_DB_PATH):
        raise IOError(f"Database file not found: {_DB_PATH}")
    
    # Create backup directory if it doesn't exist
    backend_dir = os.path.dirname(_DB_PATH)
    backup_dir = os.path.join(backend_dir, "backups")
    os.makedirs(backup_dir, exist_ok=True)
    
    # Generate timestamped backup filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_filename = f"finance_backup_{timestamp}.db"
    backup_path = os.path.join(backup_dir, backup_filename)
    
    # Copy database file (physical snapshot)
    try:
        shutil.copy2(_DB_PATH, backup_path)
        print(f"✅ Backup created: {backup_path}")
        return backup_path
    except Exception as e:
        raise IOError(f"Failed to create backup: {e}")


def set_maintenance_lock(db: Session, locked: bool) -> None:
    """
    Set the SYSTEM_MAINTENANCE_LOCK in config table.
    
    Args:
        db: Database session
        locked: True to enable lock, False to disable
    """
    from app.models.config import Config
    
    config = db.query(Config).filter(Config.key == "SYSTEM_MAINTENANCE_LOCK").first()
    
    if config:
        config.value = "true" if locked else "false"
        config.updated_at = datetime.now()
    else:
        config = Config(
            key="SYSTEM_MAINTENANCE_LOCK",
            value="true" if locked else "false",
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        db.add(config)
    
    db.commit()
    status = "LOCKED" if locked else "UNLOCKED"
    print(f"🔒 System maintenance: {status}")


def is_maintenance_locked(db: Session) -> bool:
    """
    Check if system is under maintenance lock.
    
    Args:
        db: Database session
        
    Returns:
        True if locked, False otherwise
    """
    from app.models.config import Config
    
    config = db.query(Config).filter(Config.key == "SYSTEM_MAINTENANCE_LOCK").first()
    
    if not config:
        return False
    
    return config.value.lower() == "true"


def prepare_for_migration(db: Session) -> str:
    """
    Prepare system for migration: create backup + set lock.
    
    Args:
        db: Database session
        
    Returns:
        Path to the backup file
        
    Raises:
        IOError: If backup fails
    """
    # 1. Create physical backup
    backup_path = create_physical_backup()
    
    # 2. Set maintenance lock
    set_maintenance_lock(db, locked=True)
    
    return backup_path


def complete_migration(db: Session) -> None:
    """
    Complete migration: remove maintenance lock.
    
    Args:
        db: Database session
    """
    set_maintenance_lock(db, locked=False)
    print("✅ Migration completed, system unlocked")


def rollback_to_backup(backup_path: str, db: Session) -> None:
    """
    Rollback to backup: restore DB file + unlock system.
    
    Args:
        backup_path: Path to backup file
        db: Database session
    """
    if not os.path.exists(backup_path):
        raise IOError(f"Backup file not found: {backup_path}")
    
    # Close all connections first (important for SQLite)
    db.close()
    
    # Restore backup
    try:
        shutil.copy2(backup_path, _DB_PATH)
        print(f"✅ Database restored from: {backup_path}")
    except Exception as e:
        raise IOError(f"Failed to restore backup: {e}")
    
    # Unlock system
    db = SessionLocal()
    set_maintenance_lock(db, locked=False)
    db.close()


def list_backups() -> list[str]:
    """
    List all available backup files.
    
    Returns:
        List of backup file paths
    """
    backend_dir = os.path.dirname(_DB_PATH)
    backup_dir = os.path.join(backend_dir, "backups")
    
    if not os.path.exists(backup_dir):
        return []
    
    backups = []
    for filename in sorted(os.listdir(backup_dir)):
        if filename.startswith("finance_backup_") and filename.endswith(".db"):
            backups.append(os.path.join(backup_dir, filename))
    
    return backups
