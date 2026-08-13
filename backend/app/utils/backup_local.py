import os
import shutil
import logging
from datetime import datetime
from typing import Optional, Any, cast
from sqlalchemy.orm import Session
from database import SessionLocal, _DB_PATH, engine
from sqlalchemy import text

backup_logger = logging.getLogger(__name__)


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
