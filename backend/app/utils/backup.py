import os
import shutil
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional
from sqlalchemy.orm import Session
from database import SessionLocal, _DB_PATH

# Configure logging for backup operations
backup_logger = logging.getLogger(__name__)

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

BACKUP_ROTATION_COUNT = int(os.getenv('BACKUP_ROTATION_COUNT', '30'))

# Google Drive API imports
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload


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


def get_google_drive_credentials() -> Optional[tuple[str, str, str]]:
    """
    Retrieve Google Drive OAuth credentials from database.
    
    Returns:
        Tuple of (client_id, client_secret, refresh_token) if all are configured, None otherwise
    """
    try:
        db = SessionLocal()
        from app.models.config import Config
        
        client_id_config = db.query(Config).filter(Config.key == "GOOGLE_DRIVE_CLIENT_ID").first()
        client_secret_config = db.query(Config).filter(Config.key == "GOOGLE_DRIVE_CLIENT_SECRET").first()
        refresh_token_config = db.query(Config).filter(Config.key == "GOOGLE_DRIVE_REFRESH_TOKEN").first()
        
        if not client_id_config or not client_secret_config or not refresh_token_config:
            backup_logger.warning("[GOOGLE_DRIVE] Google Drive credentials not fully configured in database.")
            return None
        
        client_id = client_id_config.value
        client_secret = client_secret_config.value
        refresh_token = refresh_token_config.value
        
        if not client_id or not client_secret or not refresh_token:
            backup_logger.warning("[GOOGLE_DRIVE] Google Drive credentials contain empty values.")
            return None
        
        return (client_id, client_secret, refresh_token)
    except Exception as e:
        backup_logger.error(f"[GOOGLE_DRIVE] Error retrieving credentials from database: {e}")
        return None
    finally:
        if 'db' in locals():
            db.close()


def get_or_create_drive_folder(drive_service) -> Optional[str]:
    """
    Get or create the 'tabula_rasa_backup' folder in Google Drive.
    
    Args:
        drive_service: Authenticated Google Drive service instance
        
    Returns:
        Folder ID if successful, None otherwise
    """
    try:
        # Search for existing folder
        results = drive_service.files().list(
            q="name='tabula_rasa_backup' and mimeType='application/vnd.google-apps.folder'",
            spaces='drive',
            fields='files(id, name)'
        ).execute()
        
        items = results.get('files', [])
        
        if items:
            backup_logger.info(f"[GOOGLE_DRIVE] Found existing backup folder: {items[0]['id']}")
            return items[0]['id']
        
        # Create new folder
        folder_metadata = {
            'name': 'tabula_rasa_backup',
            'mimeType': 'application/vnd.google-apps.folder'
        }
        
        folder = drive_service.files().create(
            body=folder_metadata,
            fields='id'
        ).execute()
        
        backup_logger.info(f"[GOOGLE_DRIVE] Created new backup folder: {folder.get('id')}")
        return folder.get('id')
        
    except Exception as e:
        backup_logger.error(f"[GOOGLE_DRIVE] Error getting/creating backup folder: {e}")
        return None


def create_external_backup() -> Optional[str]:
    """
    Create a physical database dump and upload it to Google Drive.
    This function implements fail-soft validation with robust error handling:
    - Network failures are logged but don't crash the scheduler
    - Token refresh failures are logged but don't crash the scheduler
    - API errors are logged but don't crash the scheduler
    
    Returns:
        Path to the local backup file if successful, None otherwise
    """
    # Fail-soft: Check if Google Drive credentials are configured
    credentials = get_google_drive_credentials()
    if not credentials:
        backup_logger.warning("[GOOGLE_DRIVE] Google Drive credentials not set. Skipping cloud backup.")
        return None
    
    client_id, client_secret, refresh_token = credentials
    local_backup_path = None
    
    try:
        # Step 1: Create physical backup of the database
        backup_logger.info("[GOOGLE_DRIVE] Starting external backup process...")
        
        # Generate timestamped backup filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_filename = f"tabula_rasa_backup_{timestamp}.sqlite3"
        
        # Create local backup file in backend/backups directory
        backend_dir = os.path.dirname(_DB_PATH)
        local_backup_dir = os.path.join(backend_dir, "backups")
        os.makedirs(local_backup_dir, exist_ok=True)
        local_backup_path = os.path.join(local_backup_dir, backup_filename)
        
        # Copy database file locally
        shutil.copy2(_DB_PATH, local_backup_path)
        backup_logger.info(f"[GOOGLE_DRIVE] Local backup created: {local_backup_path}")
        
        # Step 2: Authenticate with Google Drive API with robust error handling
        try:
            creds = Credentials(
                token=None,
                refresh_token=refresh_token,
                token_uri="https://oauth2.googleapis.com/token",
                client_id=client_id,
                client_secret=client_secret,
                scopes=["https://www.googleapis.com/auth/drive.file"]
            )
            
            # Refresh the access token with network error handling
            from google.auth.transport.requests import Request
            try:
                creds.refresh(Request())
                backup_logger.info("[GOOGLE_DRIVE] Access token refreshed successfully")
            except Exception as refresh_error:
                backup_logger.error(f"[GOOGLE_DRIVE] Failed to refresh access token: {refresh_error}")
                backup_logger.error("[GOOGLE_DRIVE] Token may be expired or invalid. Please re-authenticate.")
                # Clean up local backup and return None (fail-soft)
                if local_backup_path and os.path.exists(local_backup_path):
                    os.remove(local_backup_path)
                return None
            
            # Build Drive service
            drive_service = build('drive', 'v3', credentials=creds)
            backup_logger.info("[GOOGLE_DRIVE] Authenticated with Google Drive API")
            
        except Exception as auth_error:
            backup_logger.error(f"[GOOGLE_DRIVE] Authentication failed: {auth_error}")
            # Clean up local backup and return None (fail-soft)
            if local_backup_path and os.path.exists(local_backup_path):
                os.remove(local_backup_path)
            return None
        
        # Step 3: Get or create backup folder
        folder_id = get_or_create_drive_folder(drive_service)
        if not folder_id:
            backup_logger.error("[GOOGLE_DRIVE] Failed to get/create backup folder")
            # Clean up local backup and return None (fail-soft)
            if local_backup_path and os.path.exists(local_backup_path):
                os.remove(local_backup_path)
            return None
        
        # Step 4: Upload file to Google Drive with network error handling
        try:
            file_metadata = {
                'name': backup_filename,
                'parents': [folder_id]
            }
            
            media = MediaFileUpload(local_backup_path, resumable=True)
            
            file = drive_service.files().create(
                body=file_metadata,
                media_body=media,
                fields='id'
            ).execute()
            
            backup_logger.info(f"[GOOGLE_DRIVE] Backup uploaded to Google Drive: {file.get('id')}")
            
        except Exception as upload_error:
            backup_logger.error(f"[GOOGLE_DRIVE] Failed to upload backup to Google Drive: {upload_error}")
            # Clean up local backup and return None (fail-soft)
            if local_backup_path and os.path.exists(local_backup_path):
                os.remove(local_backup_path)
            return None
        
        # Step 5: Rotate old backups (keep last BACKUP_ROTATION_COUNT)
        try:
            rotate_google_drive_backups(drive_service, folder_id)
        except Exception as rotation_error:
            backup_logger.warning(f"[GOOGLE_DRIVE] Backup rotation failed (non-critical): {rotation_error}")
            # Continue with cleanup even if rotation fails
        
        # Clean up local backup file
        try:
            os.remove(local_backup_path)
            backup_logger.info(f"[GOOGLE_DRIVE] Cleaned up local backup: {local_backup_path}")
        except Exception as cleanup_error:
            backup_logger.warning(f"[GOOGLE_DRIVE] Failed to clean up local backup: {cleanup_error}")
        
        return local_backup_path
        
    except Exception as e:
        backup_logger.error(f"[GOOGLE_DRIVE] CRITICAL ERROR during backup process: {e}")
        backup_logger.error("[GOOGLE_DRIVE] Backup process failed but scheduler continues (fail-soft)")
        # Clean up local backup if it exists
        if local_backup_path and os.path.exists(local_backup_path):
            try:
                os.remove(local_backup_path)
            except:
                pass
        return None


def rotate_google_drive_backups(drive_service, folder_id: str) -> None:
    """
    Rotate Google Drive backups to keep only the last BACKUP_ROTATION_COUNT backups.
    Deletes oldest backups if the count exceeds the limit.
    This function implements fail-soft: if any error occurs, it logs a warning
    but does not raise an exception.
    
    Args:
        drive_service: Authenticated Google Drive service instance
        folder_id: ID of the backup folder in Google Drive
    """
    try:
        # List all backup files in the folder
        results = drive_service.files().list(
            q=f"'{folder_id}' in parents and name contains 'tabula_rasa_backup_'",
            spaces='drive',
            fields='files(id, name, createdTime)',
            orderBy='createdTime'
        ).execute()
        
        files = results.get('files', [])
        
        # Check if we need to rotate
        if len(files) <= BACKUP_ROTATION_COUNT:
            backup_logger.info(f"[GOOGLE_DRIVE] No rotation needed: {len(files)} backups (limit: {BACKUP_ROTATION_COUNT})")
            return
        
        # Delete oldest backups
        backups_to_delete = len(files) - BACKUP_ROTATION_COUNT
        backup_logger.info(f"[GOOGLE_DRIVE] Rotating backups: deleting {backups_to_delete} oldest backup(s)")
        
        for i in range(backups_to_delete):
            file_id = files[i]['id']
            file_name = files[i]['name']
            try:
                drive_service.files().delete(fileId=file_id).execute()
                backup_logger.info(f"[GOOGLE_DRIVE] Deleted old backup: {file_name} (ID: {file_id})")
            except Exception as e:
                backup_logger.warning(f"[GOOGLE_DRIVE] Failed to delete old backup {file_name}: {e}")
                
    except Exception as e:
        backup_logger.warning(f"[GOOGLE_DRIVE] Error during backup rotation: {e}")


def rotate_external_backups() -> None:
    """
    Legacy function for local directory backups (deprecated in FASE 3.5).
    Kept for backward compatibility.
    """
    backup_logger.warning("[EXTERNAL_BACKUP] Local directory backup rotation is deprecated. Use Google Drive API instead.")


def list_external_backups() -> list[dict]:
    """
    List all external backup files from Google Drive.
    
    Returns:
        List of backup file metadata (id, name, createdTime) sorted by creation time (newest first)
    """
    # Fail-soft: Check if Google Drive credentials are configured
    credentials = get_google_drive_credentials()
    if not credentials:
        backup_logger.warning("[GOOGLE_DRIVE] Google Drive credentials not set. Cannot list backups.")
        return []
    
    client_id, client_secret, refresh_token = credentials
    
    try:
        # Authenticate with Google Drive API
        creds = Credentials(
            token=None,
            refresh_token=refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=client_id,
            client_secret=client_secret,
            scopes=["https://www.googleapis.com/auth/drive.file"]
        )
        
        # Refresh the access token
        from google.auth.transport.requests import Request
        creds.refresh(Request())
        
        # Build Drive service
        drive_service = build('drive', 'v3', credentials=creds)
        
        # Get backup folder
        folder_id = get_or_create_drive_folder(drive_service)
        if not folder_id:
            backup_logger.error("[GOOGLE_DRIVE] Failed to get backup folder")
            return []
        
        # List backup files in the folder
        results = drive_service.files().list(
            q=f"'{folder_id}' in parents and name contains 'tabula_rasa_backup_'",
            spaces='drive',
            fields='files(id, name, createdTime, size)',
            orderBy='createdTime desc'
        ).execute()
        
        files = results.get('files', [])
        backup_logger.info(f"[GOOGLE_DRIVE] Found {len(files)} backup files")
        
        return files
        
    except Exception as e:
        backup_logger.error(f"[GOOGLE_DRIVE] Error listing external backups: {e}")
        return []
