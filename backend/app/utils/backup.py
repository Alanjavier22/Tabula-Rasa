import os
import shutil
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional, Any, cast
from sqlalchemy.orm import Session
from database import SessionLocal, _DB_PATH, engine
from sqlalchemy import text

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
import googleapiclient.http

def checkpoint_db():
    """
    Force a WAL checkpoint to flush all changes from -wal file to the main .db file.
    This ensures the .db file is consistent for physical file copy backups.
    """
    try:
        with engine.connect() as conn:
            conn.execute(text("PRAGMA wal_checkpoint(TRUNCATE)"))
            backup_logger.info("[DATABASE] WAL checkpoint (TRUNCATE) completed successfully")
    except Exception as e:
        backup_logger.warning(f"[DATABASE] WAL checkpoint failed: {e}. Backup might be slightly inconsistent.")


def _rotate_files_with_pattern(directory: str, prefix: str, suffix: str, keep_count: int) -> None:
    """Helper to rotate files matching prefix and suffix, keeping keep_count most recent."""
    files = []
    for filename in os.listdir(directory):
        if filename.startswith(prefix) and filename.endswith(suffix):
            filepath = os.path.join(directory, filename)
            try:
                # Extract timestamp
                timestamp_str = filename.replace(prefix, "").replace(suffix, "")
                timestamp = datetime.strptime(timestamp_str, "%Y%m%d_%H%M%S")
                files.append((filepath, timestamp))
            except ValueError:
                # Fallback to mtime if timestamp format is different
                try:
                    mtime = os.path.getmtime(filepath)
                    timestamp = datetime.fromtimestamp(mtime)
                    files.append((filepath, timestamp))
                except Exception:
                    pass
    
    # Sort files by timestamp (newest first)
    files.sort(key=lambda x: x[1], reverse=True)
    
    # Remove files beyond keep_count
    if len(files) > keep_count:
        for filepath, _ in files[keep_count:]:
            try:
                os.remove(filepath)
                backup_logger.info(f"[LOCAL_BACKUP] Cleaned up old local backup: {filepath}")
            except Exception as e:
                backup_logger.warning(f"[LOCAL_BACKUP] Failed to remove old backup {filepath}: {e}")

def rotate_local_backups(keep_count: int = 2) -> None:
    """
    Clean up old local backups, keeping only the most recent ones.
    Rotates both tabula_rasa_backup_*.sqlite3 and finance_backup_*.db files.
    """
    try:
        backend_dir = os.path.dirname(_DB_PATH)
        local_backup_dir = os.path.join(backend_dir, "backups")
        
        if not os.path.exists(local_backup_dir):
            return
        
        # 1. Rotate tabula_rasa_backup_*.sqlite3
        _rotate_files_with_pattern(local_backup_dir, "tabula_rasa_backup_", ".sqlite3", keep_count)
        
        # 2. Rotate finance_backup_*.db (keep 5 local physical backups)
        _rotate_files_with_pattern(local_backup_dir, "finance_backup_", ".db", 5)
    except Exception as e:
        backup_logger.warning(f"[LOCAL_BACKUP] Failed to clean up local backups: {e}")


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
    
    # Step 0: Force checkpoint to ensure .db file is up-to-date
    checkpoint_db()
    
    # Copy database file (physical snapshot)
    try:
        shutil.copy2(_DB_PATH, backup_path)
        backup_logger.info(f"✅ Backup created: {backup_path}")
        # Automatically rotate backups to keep directory clean
        rotate_local_backups()
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
        config.value = cast(Any, "true" if locked else "false")
        config.updated_at = cast(Any, datetime.now())
    else:
        config = Config(
            key="SYSTEM_MAINTENANCE_LOCK",
            value=cast(Any, "true" if locked else "false"),
            created_at=cast(Any, datetime.now()),
            updated_at=cast(Any, datetime.now())
        )
        db.add(config)
    
    db.commit()
    status = "LOCKED" if locked else "UNLOCKED"
    backup_logger.info(f"[MAINTENANCE] System maintenance: {status}")


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
    backup_logger.info("[MAINTENANCE] Migration completed, system unlocked")


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
        backup_logger.info(f"[MAINTENANCE] Database restored from: {backup_path}")
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
    db = None
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
        
        return (str(client_id), str(client_secret), str(refresh_token))
    except Exception as e:
        backup_logger.error(f"[GOOGLE_DRIVE] Error retrieving credentials from database: {e}")
        return None
    finally:
        if db is not None:
            db.close()


def test_google_drive_connection() -> dict:
    """
    Perform a real authentication test with Google Drive API.
    Attempts to refresh the access token and build the service.
    
    Returns:
        Dict with success status and descriptive message.
    """
    credentials = get_google_drive_credentials()
    if not credentials:
        return {"success": False, "message": "Credenciales no encontradas en la base de datos."}
    
    client_id, client_secret, refresh_token = credentials
    
    try:
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request
        from googleapiclient.discovery import build
        
        creds = Credentials(
            token=None,
            refresh_token=refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=client_id,
            client_secret=client_secret,
            scopes=["https://www.googleapis.com/auth/drive"]
        )
        
        # Real handshake: Refresh the token
        creds.refresh(Request())
        
        # Optional: Try to list a file to be 100% sure
        drive_service = cast(Any, build('drive', 'v3', credentials=creds))
        drive_service.about().get(fields="user").execute()
        
        return {"success": True, "message": "Conexión con Google Drive exitosa."}
        
    except Exception as e:
        error_msg = str(e)
        if "invalid_grant" in error_msg:
            return {"success": False, "message": "Token de actualización (Refresh Token) inválido o expirado."}
        elif "invalid_client" in error_msg:
            return {"success": False, "message": "Client ID o Client Secret incorrectos."}
        return {"success": False, "message": f"Error de conexión: {error_msg}"}


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
        ds = cast(Any, drive_service)
        results = ds.files().list(
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
        
        # Step 0: Force checkpoint to ensure .db file is up-to-date
        checkpoint_db()
        
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
                scopes=["https://www.googleapis.com/auth/drive"]
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
            drive_service = cast(Any, build('drive', 'v3', credentials=creds))
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
            ds = cast(Any, drive_service)
            file = ds.files().create(
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
        
        # Step 5: No rotation in Google Drive - keep all backups in cloud
        # Users can manage/delete backups manually from Google Drive if needed
        
        # Clean up old local backups (keep only 2 most recent)
        try:
            rotate_local_backups(keep_count=2)
        except Exception as cleanup_error:
            backup_logger.warning(f"[GOOGLE_DRIVE] Failed to clean up local backups: {cleanup_error}")
        
        return local_backup_path
        
    except Exception as e:
        backup_logger.error(f"[GOOGLE_DRIVE] CRITICAL ERROR during backup process: {e}")
        backup_logger.error("[GOOGLE_DRIVE] Backup process failed but scheduler continues (fail-soft)")
        # Clean up local backup if it exists
        if local_backup_path and os.path.exists(local_backup_path):
            try:
                os.remove(local_backup_path)
            except OSError as cleanup_err:
                backup_logger.warning(f"[GOOGLE_DRIVE] Failed to remove temporary local backup file: {cleanup_err}")
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
        ds = cast(Any, drive_service)
        results = ds.files().list(
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
                ds = cast(Any, drive_service)
                ds.files().delete(fileId=file_id).execute()
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
            scopes=["https://www.googleapis.com/auth/drive"]
        )

        # Refresh the access token
        from google.auth.transport.requests import Request
        creds.refresh(Request())

        # Build Drive service
        drive_service = cast(Any, build('drive', 'v3', credentials=creds))

        # Get backup folder
        folder_id = get_or_create_drive_folder(drive_service)
        if not folder_id:
            backup_logger.error("[GOOGLE_DRIVE] Failed to get backup folder")
            return []

        # List backup files in the folder
        ds = cast(Any, drive_service)
        results = ds.files().list(
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


def download_backup_from_drive(backup_id: str) -> Optional[str]:
    """
    Download a specific backup file from Google Drive to local temp directory.

    Args:
        backup_id: Google Drive file ID of the backup

    Returns:
        Local path to downloaded backup file if successful, None otherwise
    """
    credentials = get_google_drive_credentials()
    if not credentials:
        backup_logger.error("[GOOGLE_DRIVE] Google Drive credentials not set. Cannot download backup.")
        return None

    client_id, client_secret, refresh_token = credentials

    try:
        # Authenticate with Google Drive API
        creds = Credentials(
            token=None,
            refresh_token=refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=client_id,
            client_secret=client_secret,
            scopes=["https://www.googleapis.com/auth/drive"]
        )

        # Refresh the access token
        from google.auth.transport.requests import Request
        creds.refresh(Request())

        # Build Drive service
        drive_service = cast(Any, build('drive', 'v3', credentials=creds))
        ds = cast(Any, drive_service)

        # Get file metadata
        file_metadata = ds.files().get(
            fileId=backup_id,
            fields='name, createdTime, size'
        ).execute()

        backup_filename = file_metadata.get('name')
        backup_logger.info(f"[GOOGLE_DRIVE] Downloading backup: {backup_filename}")

        # Create temp directory for download
        backend_dir = os.path.dirname(_DB_PATH)
        temp_dir = os.path.join(backend_dir, "temp_restore")
        os.makedirs(temp_dir, exist_ok=True)
        download_path = os.path.join(temp_dir, backup_filename)

        # Download file
        request = ds.files().get_media(fileId=backup_id)
        with open(download_path, 'wb') as f:
            downloader = googleapiclient.http.MediaIoBaseDownload(f, request)
            done = False
            while done is False:
                status, done = downloader.next_chunk()
                if status:
                    backup_logger.info(f"[GOOGLE_DRIVE] Download progress: {int(status.progress() * 100)}%")

        backup_logger.info(f"[GOOGLE_DRIVE] Backup downloaded to: {download_path}")
        return download_path

    except Exception as e:
        backup_logger.error(f"[GOOGLE_DRIVE] Error downloading backup: {e}")
        return None


def get_current_db_timestamp() -> Optional[datetime]:
    """
    Get the modification timestamp of the current database file.

    Returns:
        Datetime object of file modification time, None if file doesn't exist
    """
    if not os.path.exists(_DB_PATH):
        return None
    return datetime.fromtimestamp(os.path.getmtime(_DB_PATH))


def parse_backup_timestamp(backup_filename: str) -> Optional[datetime]:
    """
    Parse timestamp from backup filename.

    Args:
        backup_filename: Filename like "tabula_rasa_backup_20260505_213000.sqlite3"

    Returns:
        Datetime object if parsing successful, None otherwise
    """
    try:
        # Extract timestamp from filename
        timestamp_str = backup_filename.replace("tabula_rasa_backup_", "").replace(".sqlite3", "")
        return datetime.strptime(timestamp_str, "%Y%m%d_%H%M%S")
    except ValueError:
        return None


def restore_from_backup(backup_path: str, create_pre_restore_backup: bool = True) -> dict:
    """
    Restore database from a local backup file with safety validations.

    Args:
        backup_path: Path to the backup file to restore
        create_pre_restore_backup: If True, creates a backup of current DB before restoring

    Returns:
        Dict with success status, message, and pre_restore_backup_path if created
    """
    if not os.path.exists(backup_path):
        return {
            "success": False,
            "message": f"Archivo de backup no encontrado: {backup_path}"
        }

    pre_restore_backup_path = None

    try:
        # Step 0: Force checkpoint to empty WAL file before restoration
        # This ensures that even if we can't delete the WAL file (due to locks),
        # it will be empty and won't override the restored database upon restart.
        checkpoint_db()

        # Step 1: Create pre-restore backup of current database
        if create_pre_restore_backup:
            backup_logger.info("[RESTORE] Creating pre-restore backup of current database...")
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_filename = f"pre_restore_backup_{timestamp}.db"
            backend_dir = os.path.dirname(_DB_PATH)
            local_backup_dir = os.path.join(backend_dir, "backups")
            os.makedirs(local_backup_dir, exist_ok=True)
            pre_restore_backup_path = os.path.join(local_backup_dir, backup_filename)
            shutil.copy2(_DB_PATH, pre_restore_backup_path)
            backup_logger.info(f"[RESTORE] Pre-restore backup created: {pre_restore_backup_path}")

        # Step 2: Compare timestamps to warn if backup is older
        backup_timestamp = parse_backup_timestamp(os.path.basename(backup_path))
        if not backup_timestamp:
             backup_timestamp = datetime.fromtimestamp(os.path.getmtime(backup_path))
        
        current_timestamp = get_current_db_timestamp()

        time_diff_hours = 0
        if current_timestamp:
            time_diff = current_timestamp - backup_timestamp
            time_diff_hours = time_diff.total_seconds() / 3600
            backup_logger.warning(f"[RESTORE] Backup is {time_diff_hours:.1f} hours old")

        # Step 3: Close all database connections
        backup_logger.info("[RESTORE] Closing database connections and disposing engine...")
        engine.dispose() # Close connections in the pool

        # Step 4: Delete WAL and SHM files of the CURRENT database
        # This is CRITICAL to prevent SQLite from "recovering" old state from the WAL file
        # over the newly restored database file.
        wal_path = f"{_DB_PATH}-wal"
        shm_path = f"{_DB_PATH}-shm"
        for extra_file in [wal_path, shm_path]:
            if os.path.exists(extra_file):
                try:
                    os.remove(extra_file)
                    backup_logger.info(f"[RESTORE] Deleted auxiliary file: {extra_file}")
                except Exception as e:
                    backup_logger.warning(f"[RESTORE] Could not delete {extra_file}: {e}. This might cause consistency issues.")

        # Step 5: Restore backup
        backup_logger.info(f"[RESTORE] Restoring from backup: {backup_path}")
        shutil.copy2(backup_path, _DB_PATH)
        backup_logger.info("[RESTORE] Database restored successfully")

        return {
            "success": True,
            "message": "Base de datos restaurada exitosamente. Se eliminaron los archivos temporales de caché (WAL/SHM).",
            "pre_restore_backup_path": pre_restore_backup_path,
            "backup_age_hours": time_diff_hours
        }

    except Exception as e:
        backup_logger.error(f"[RESTORE] Error during restore: {e}")
        return {
            "success": False,
            "message": f"Error al restaurar backup: {str(e)}",
            "pre_restore_backup_path": pre_restore_backup_path
        }


def restore_from_google_drive(backup_id: str, create_pre_restore_backup: bool = True) -> dict:
    """
    Restore database from a Google Drive backup with safety validations.

    Args:
        backup_id: Google Drive file ID of the backup
        create_pre_restore_backup: If True, creates a backup of current DB before restoring

    Returns:
        Dict with success status, message, and pre_restore_backup_path if created
    """
    backup_logger.info(f"[RESTORE] Starting restore from Google Drive backup: {backup_id}")

    # Step 1: Download backup from Google Drive
    download_path = download_backup_from_drive(backup_id)
    if not download_path:
        return {
            "success": False,
            "message": "Error al descargar backup de Google Drive. Verifica tus credenciales."
        }

    # Step 2: Restore from downloaded backup
    result = restore_from_backup(download_path, create_pre_restore_backup)

    # Step 3: Clean up downloaded file
    if os.path.exists(download_path):
        try:
            os.remove(download_path)
            backup_logger.info(f"[RESTORE] Cleaned up downloaded backup: {download_path}")
        except Exception as e:
            backup_logger.warning(f"[RESTORE] Failed to cleanup downloaded file: {e}")

    return result


def list_pre_restore_backups() -> list[dict]:
    """
    List all pre-restore backup files in the local backups directory.

    Returns:
        List of pre-restore backup metadata (path, timestamp, size_bytes) sorted by timestamp (newest first)
    """
    backend_dir = os.path.dirname(_DB_PATH)
    local_backup_dir = os.path.join(backend_dir, "backups")

    if not os.path.exists(local_backup_dir):
        return []

    backups = []
    for filename in os.listdir(local_backup_dir):
        if filename.startswith("pre_restore_backup_") and filename.endswith(".db"):
            filepath = os.path.join(local_backup_dir, filename)
            try:
                # Extract timestamp from filename
                timestamp_str = filename.replace("pre_restore_backup_", "").replace(".db", "")
                timestamp = datetime.strptime(timestamp_str, "%Y%m%d_%H%M%S")
                size_bytes = os.path.getsize(filepath)

                backups.append({
                    "path": filepath,
                    "filename": filename,
                    "timestamp": timestamp,
                    "size_bytes": size_bytes,
                    "size_mb": round(size_bytes / (1024 * 1024), 2)
                })
            except ValueError:
                # Skip files with invalid timestamp format
                continue

    # Sort by timestamp (newest first)
    backups.sort(key=lambda x: x["timestamp"], reverse=True)

    return backups


def delete_pre_restore_backup(backup_path: str) -> dict:
    """
    Delete a specific pre-restore backup file.

    Args:
        backup_path: Path to the pre-restore backup file to delete

    Returns:
        Dict with success status and message
    """
    if not os.path.exists(backup_path):
        return {
            "success": False,
            "message": f"Archivo de backup no encontrado: {backup_path}"
        }

    # Safety check: only allow deleting files that start with "pre_restore_backup_"
    filename = os.path.basename(backup_path)
    if not filename.startswith("pre_restore_backup_"):
        return {
            "success": False,
            "message": "Solo se pueden eliminar archivos de backup pre-restauración (que empiezan con 'pre_restore_backup_')"
        }

    try:
        os.remove(backup_path)
        backup_logger.info(f"[PRE_RESTORE] Deleted pre-restore backup: {backup_path}")
        return {
            "success": True,
            "message": f"Backup pre-restauración eliminado: {filename}"
        }
    except Exception as e:
        backup_logger.error(f"[PRE_RESTORE] Error deleting backup: {e}")
        return {
            "success": False,
            "message": f"Error al eliminar backup: {str(e)}"
        }


def rollback_to_pre_restore(backup_path: str) -> dict:
    """
    Rollback to a pre-restore backup and then delete the backup file.

    Args:
        backup_path: Path to the pre-restore backup file

    Returns:
        Dict with success status and message
    """
    if not os.path.exists(backup_path):
        return {
            "success": False,
            "message": f"Archivo de backup no encontrado: {backup_path}"
        }

    # Safety check: only allow rolling back to files that start with "pre_restore_backup_"
    filename = os.path.basename(backup_path)
    if not filename.startswith("pre_restore_backup_"):
        return {
            "success": False,
            "message": "Solo se puede hacer rollback desde archivos de backup pre-restauración (que empiezan con 'pre_restore_backup_')"
        }

    try:
        backup_logger.info(f"[ROLLBACK] Starting rollback to: {backup_path}")

        # Restore from the pre-restore backup (without creating another pre-restore backup)
        result = restore_from_backup(backup_path, create_pre_restore_backup=False)

        if result["success"]:
            # Delete the pre-restore backup after successful rollback
            delete_result = delete_pre_restore_backup(backup_path)
            if delete_result["success"]:
                backup_logger.info(f"[ROLLBACK] Pre-restore backup deleted after successful rollback")
                return {
                    "success": True,
                    "message": "Rollback exitoso. Base de datos restaurada al estado anterior y backup pre-restauración eliminado.",
                    "needs_restart": True
                }
            else:
                backup_logger.warning(f"[ROLLBACK] Rollback successful but failed to delete pre-restore backup: {delete_result['message']}")
                return {
                    "success": True,
                    "message": f"Rollback exitoso pero no se pudo eliminar el backup pre-restauración: {delete_result['message']}",
                    "needs_restart": True
                }
        else:
            return {
                "success": False,
                "message": f"Error durante rollback: {result['message']}",
                "needs_restart": False
            }

    except Exception as e:
        backup_logger.error(f"[ROLLBACK] Error during rollback: {e}")
        return {
            "success": False,
            "message": f"Error durante rollback: {str(e)}",
            "needs_restart": False
        }
