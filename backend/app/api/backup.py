"""
Backup API endpoints for manual backup operations and Google Drive management.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List, Any, cast
from database import get_db
from app.api.auth import get_current_device
from app.utils.backup import (
    create_external_backup,
    list_external_backups,
    restore_from_google_drive,
    get_current_db_timestamp,
    parse_backup_timestamp,
    list_pre_restore_backups,
    delete_pre_restore_backup,
    rollback_to_pre_restore,
    get_google_drive_credentials
)
from fastapi.responses import HTMLResponse
import logging
import os
import requests
from urllib.parse import urlencode

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/backup",
    tags=["Backup"]
)


class ManualBackupResponse(BaseModel):
    success: bool
    message: str
    backup_path: Optional[str] = None


class BackupFile(BaseModel):
    id: str
    name: str
    createdTime: str
    size: Optional[str] = None
    is_older_than_current: Optional[bool] = None
    age_hours: Optional[float] = None


class BackupsListResponse(BaseModel):
    success: bool
    backups: List[BackupFile]
    message: str


class RestoreRequest(BaseModel):
    backup_id: Optional[str] = None  # Optional since it can come from URL
    confirmed: bool = False  # Require explicit confirmation to prevent accidental restores
    create_pre_restore_backup: bool = True  # Create backup of current DB before restoring


class RestoreResponse(BaseModel):
    success: bool
    message: str
    pre_restore_backup_path: Optional[str] = None
    backup_age_hours: Optional[float] = None
    needs_restart: bool = False


class PreRestoreBackup(BaseModel):
    path: str
    filename: str
    timestamp: str
    size_mb: float


class PreRestoreListResponse(BaseModel):
    success: bool
    backups: List[PreRestoreBackup]
    message: str


class DeletePreRestoreRequest(BaseModel):
    backup_path: str


class RollbackRequest(BaseModel):
    backup_path: str


@router.post("/manual", dependencies=[Depends(get_current_device)], response_model=ManualBackupResponse)
def create_manual_backup(db: Session = Depends(get_db)):
    """
    Trigger a manual backup to Google Drive.
    This creates a physical backup and uploads it to Google Drive immediately.
    """
    try:
        logger.info("[BACKUP_API] Manual backup requested")
        backup_path = create_external_backup()
        
        if backup_path:
            return ManualBackupResponse(
                success=True,
                message="Backup creado y subido a Google Drive exitosamente",
                backup_path=backup_path
            )
        else:
            return ManualBackupResponse(
                success=False,
                message="Backup falló. Verifica que las credenciales de Google Drive estén configuradas."
            )
    except Exception as e:
        logger.error(f"[BACKUP_API] Error creating manual backup: {e}")
        raise HTTPException(status_code=500, detail=f"Error al crear backup: {str(e)}")


@router.get("/list", dependencies=[Depends(get_current_device)], response_model=BackupsListResponse)
def list_google_drive_backups(db: Session = Depends(get_db)):
    """
    List all available backups from Google Drive.
    Returns metadata for each backup file sorted by creation time (newest first).
    Includes comparison with current database to warn if backup is older.
    """
    try:
        logger.info("[BACKUP_API] Listing Google Drive backups")
        backups = list_external_backups()

        current_db_timestamp = get_current_db_timestamp()

        backup_files = []
        for b in backups:
            backup_name = b.get('name', '')
            backup_created_time = b.get('createdTime', '')
            is_older = False
            age_hours = None

            # Parse backup timestamp and compare with current DB
            backup_timestamp = parse_backup_timestamp(backup_name)
            if backup_timestamp and current_db_timestamp:
                time_diff = current_db_timestamp - backup_timestamp
                age_hours = time_diff.total_seconds() / 3600
                is_older = age_hours > 0

            backup_files.append(BackupFile(
                id=b.get('id', ''),
                name=backup_name,
                createdTime=backup_created_time,
                size=b.get('size'),
                is_older_than_current=is_older,
                age_hours=age_hours
            ))

        return BackupsListResponse(
            success=True,
            backups=backup_files,
            message=f"{len(backup_files)} backups encontrados"
        )
    except Exception as e:
        logger.error(f"[BACKUP_API] Error listing backups: {e}")
        raise HTTPException(status_code=500, detail=f"Error al listar backups: {str(e)}")


@router.post("/restore/{backup_id}", dependencies=[Depends(get_current_device)], response_model=RestoreResponse)
def restore_from_drive(backup_id: str, request: Optional[RestoreRequest] = None, db: Session = Depends(get_db)):
    """
    Restore database from a specific Google Drive backup with safety validations.

    Safety features:
    - Requires explicit confirmation (confirmed=True) to prevent accidental restores
    - Creates automatic pre-restore backup of current database
    - Compares timestamps and warns if backup is older than current DB
    - Returns path to pre-restore backup for rollback capability

    Note: After successful restore, the server needs to be restarted for changes to take effect.
    """
    try:
        # If request body is provided, use it; otherwise create default
        if request is None:
            request = RestoreRequest(backup_id=backup_id, confirmed=False, create_pre_restore_backup=True)
        else:
            request.backup_id = backup_id

        logger.info(f"[BACKUP_API] Restore requested for backup_id: {request.backup_id}")

        # Safety check: Require explicit confirmation
        if not request.confirmed:
            return RestoreResponse(
                success=False,
                message="Debes confirmar explícitamente la restauración estableciendo confirmed=true. "
                       "Esto previene restauraciones accidentales que podrían causar pérdida de datos.",
                needs_restart=False
            )

        # Perform restore with pre-restore backup
        result = restore_from_google_drive(
            backup_id=cast(str, request.backup_id),
            create_pre_restore_backup=request.create_pre_restore_backup
        )

        if result["success"]:
            return RestoreResponse(
                success=True,
                message=f"Base de datos restaurada exitosamente. {result['message']}. "
                       f"Backup pre-restauración guardado en: {result['pre_restore_backup_path']}. "
                       "Por favor reinicia el servidor para que los cambios surtan efecto.",
                pre_restore_backup_path=result.get("pre_restore_backup_path"),
                backup_age_hours=result.get("backup_age_hours"),
                needs_restart=True
            )
        else:
            return RestoreResponse(
                success=False,
                message=result["message"],
                needs_restart=False
            )

    except Exception as e:
        logger.error(f"[BACKUP_API] Error restoring backup: {e}")
        raise HTTPException(status_code=500, detail=f"Error al restaurar backup: {str(e)}")


@router.get("/pre-restore/list", dependencies=[Depends(get_current_device)], response_model=PreRestoreListResponse)
def list_pre_restore_backups_endpoint(db: Session = Depends(get_db)):
    """
    List all local pre-restore backup files.
    These are backups created automatically before restoring from Google Drive.
    Users can delete these manually after confirming a successful restore.
    """
    try:
        logger.info("[BACKUP_API] Listing pre-restore backups")
        backups = list_pre_restore_backups()

        pre_restore_backups = [
            PreRestoreBackup(
                path=b["path"],
                filename=b["filename"],
                timestamp=b["timestamp"].strftime("%Y-%m-%d %H:%M:%S"),
                size_mb=b["size_mb"]
            )
            for b in backups
        ]

        return PreRestoreListResponse(
            success=True,
            backups=pre_restore_backups,
            message=f"{len(pre_restore_backups)} backups pre-restauración encontrados"
        )
    except Exception as e:
        logger.error(f"[BACKUP_API] Error listing pre-restore backups: {e}")
        raise HTTPException(status_code=500, detail=f"Error al listar backups pre-restauración: {str(e)}")


@router.post("/pre-restore/delete", dependencies=[Depends(get_current_device)])
def delete_pre_restore_backup_endpoint(request: DeletePreRestoreRequest, db: Session = Depends(get_db)):
    """
    Delete a specific pre-restore backup file.
    Use this after confirming that a restore was successful to clean up temporary backups.
    """
    try:
        logger.info(f"[BACKUP_API] Delete pre-restore backup requested: {request.backup_path}")
        result = delete_pre_restore_backup(request.backup_path)

        if result["success"]:
            return ManualBackupResponse(
                success=True,
                message=result["message"]
            )
        else:
            raise HTTPException(status_code=400, detail=result["message"])

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[BACKUP_API] Error deleting pre-restore backup: {e}")
        raise HTTPException(status_code=500, detail=f"Error al eliminar backup pre-restauración: {str(e)}")


@router.post("/pre-restore/rollback", dependencies=[Depends(get_current_device)], response_model=RestoreResponse)
def rollback_to_pre_restore_endpoint(request: RollbackRequest, db: Session = Depends(get_db)):
    """
    Rollback to a pre-restore backup (reverts a previous restore operation).
    After successful rollback, the pre-restore backup is automatically deleted.

    Use this if a restore from Google Drive caused issues and you want to revert.
    """
    try:
        logger.info(f"[BACKUP_API] Rollback to pre-restore requested: {request.backup_path}")
        result = rollback_to_pre_restore(request.backup_path)

        if result["success"]:
            return RestoreResponse(
                success=True,
                message=result["message"],
                needs_restart=result.get("needs_restart", False)
            )
        else:
            raise HTTPException(status_code=400, detail=result["message"])

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[BACKUP_API] Error during rollback: {e}")
        raise HTTPException(status_code=500, detail=f"Error durante rollback: {str(e)}")


@router.get("/google/auth-url", dependencies=[Depends(get_current_device)])
def get_google_auth_url(db: Session = Depends(get_db)):
    """
    Generates the Google OAuth2 authorization URL manually to avoid PKCE issues.
    """
    from app.models.config import Config
    
    client_id_cfg = db.query(Config).filter(Config.key == "GOOGLE_DRIVE_CLIENT_ID").first()
    
    if not client_id_cfg:
        raise HTTPException(status_code=400, detail="Client ID debe estar configurado primero.")
    
    redirect_uri = "http://localhost:8001/backup/google/callback"
    
    params = {
        "client_id": client_id_cfg.value,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "https://www.googleapis.com/auth/drive",
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true"
    }
    
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    return {"auth_url": auth_url}


@router.get("/google/callback")
def google_oauth_callback(code: str, db: Session = Depends(get_db)):
    """
    Callback for Google OAuth2. Exchanges authorization code for tokens manually.
    """
    from app.models.config import Config
    
    client_id_cfg = db.query(Config).filter(Config.key == "GOOGLE_DRIVE_CLIENT_ID").first()
    client_secret_cfg = db.query(Config).filter(Config.key == "GOOGLE_DRIVE_CLIENT_SECRET").first()
    
    if not client_id_cfg or not client_secret_cfg:
        return HTMLResponse(content="Error: Client ID o Client Secret no configurados.")

    redirect_uri = "http://localhost:8001/backup/google/callback"
    
    try:
        token_url = "https://oauth2.googleapis.com/token"
        data = {
            "code": code,
            "client_id": client_id_cfg.value,
            "client_secret": client_secret_cfg.value,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code"
        }
        
        response = requests.post(token_url, data=data)
        tokens = response.json()
        
        if "error" in tokens:
            logger.error(f"[GOOGLE_AUTH] Error from Google: {tokens}")
            return HTMLResponse(content=f"Error de Google: {tokens.get('error_description', tokens['error'])}")
            
        refresh_token = tokens.get("refresh_token")
        
        if not refresh_token:
            return HTMLResponse(content="""
                <html>
                    <body style="font-family: sans-serif; text-align: center; padding-top: 50px; background: #1a1a2e; color: white;">
                        <h2 style="color: #f9ca24;">Atención</h2>
                        <p>No se recibió un nuevo Refresh Token. Esto sucede si ya habías autorizado antes.</p>
                        <p>Google solo envía el Refresh Token la primera vez o si usas 'prompt=consent'.</p>
                        <button onclick="window.close()" style="padding: 10px 20px; background: #4ecca3; border: none; border-radius: 5px; color: #1a1a2e; cursor: pointer;">Cerrar ventana</button>
                    </body>
                </html>
            """)

        # Save Refresh Token to DB
        token_cfg = db.query(Config).filter(Config.key == "GOOGLE_DRIVE_REFRESH_TOKEN").first()
        if not token_cfg:
            token_cfg = Config(key="GOOGLE_DRIVE_REFRESH_TOKEN", value=refresh_token, value_type="string", is_public=False)
            db.add(token_cfg)
        else:
            token_cfg.value = refresh_token
        
        db.commit()
        
        return HTMLResponse(content="""
            <html>
                <body style="font-family: sans-serif; text-align: center; padding-top: 50px; background: #1a1a2e; color: white;">
                    <h2 style="color: #4ecca3;">¡Autorización Exitosa!</h2>
                    <p>El Refresh Token ha sido guardado correctamente en la base de datos.</p>
                    <p>Ya puedes cerrar esta ventana y regresar al Dashboard.</p>
                    <button onclick="window.close()" style="padding: 10px 20px; background: #4ecca3; border: none; border-radius: 5px; color: #1a1a2e; cursor: pointer;">Cerrar ventana</button>
                </body>
            </html>
        """)
    except Exception as e:
        logger.error(f"[GOOGLE_AUTH] Error: {str(e)}")
        return HTMLResponse(content=f"Error interno: {str(e)}")
