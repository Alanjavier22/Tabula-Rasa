import os
import shutil
import logging
from datetime import datetime
from typing import Optional, Any, cast
from database import SessionLocal, _DB_PATH
from dotenv import load_dotenv
load_dotenv()

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
import googleapiclient.http

from app.utils.backup_local import checkpoint_db, rotate_local_backups, restore_from_backup

backup_logger = logging.getLogger(__name__)

BACKUP_ROTATION_COUNT = int(os.getenv('BACKUP_ROTATION_COUNT', '30'))


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
        raw_refresh_token = refresh_token_config.value

        if not client_id or not client_secret or not raw_refresh_token:
            backup_logger.warning("[GOOGLE_DRIVE] Google Drive credentials contain empty values.")
            return None

        from app.utils.crypto import decrypt_value_with_status, encrypt_value
        refresh_token, was_encrypted = decrypt_value_with_status(str(raw_refresh_token))
        if not was_encrypted:
            # Valor legacy en texto plano (instalación previa a este cambio):
            # se re-escribe cifrado para que la próxima lectura ya lo encuentre así.
            refresh_token_config.value = encrypt_value(refresh_token)
            db.commit()

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
