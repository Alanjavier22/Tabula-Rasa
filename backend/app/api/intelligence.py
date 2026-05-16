from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
import os
import uuid
import hashlib
import json
from typing import List, Dict, Optional, Any, cast
from pydantic import BaseModel
from database import get_db
from app.api.auth import get_current_device
from app.models.import_log import ImportLog
from app.models.account import Account
from app.services.statement_intelligence import StatementIntelligenceService
from app.services.account_intelligence import AccountIntelligenceService
from app.services.snapshot_service import recalculate_stale_snapshots

router = APIRouter(
    prefix="/intelligence", 
    tags=["intelligence"], 
    dependencies=[Depends(get_current_device)]
)

UPLOAD_DIR = "temp_uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/import-statement/{account_id}")
async def upload_statement(
    account_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    # 1. Calcular Hash para evitar duplicados
    content = await file.read()
    file_hash = hashlib.sha256(content).hexdigest()
    
    existing_log = db.query(ImportLog).filter(ImportLog.file_hash == file_hash).first()
    if existing_log and existing_log.status == 'processed':
        raise HTTPException(status_code=400, detail="Este estado de cuenta ya ha sido procesado previamente.")

    # 2. Guardar temporalmente
    file_ext = os.path.splitext(cast(str, file.filename))[1]
    temp_filename = f"{uuid.uuid4()}{file_ext}"
    temp_path = os.path.join(UPLOAD_DIR, temp_filename)
    
    with open(temp_path, "wb") as f:
        f.write(content)

    # 3. Crear Log de Importación
    if not existing_log:
        new_log = ImportLog(
            file_hash=file_hash,
            filename=file.filename,
            account_id=account_id,
            status='pending'
        )
        db.add(new_log)
        db.commit()
        db.refresh(new_log)
        log_id = new_log.id
    else:
        log_id = existing_log.id

    # 4. Procesar con IA
    try:
        account = db.query(Account).filter(Account.id == account_id).first()
        expected_bank = cast(Optional[str], account.bank_name) if account else None
        
        service = StatementIntelligenceService(db)
        parsed_data = await service.parse_statement(temp_path, account_id, expected_bank_name=expected_bank)
        
        # Guardamos metadatos en el log
        log = db.query(ImportLog).filter(ImportLog.id == log_id).first()
        if log:
            log.metadata_json = cast(Any, json.dumps(parsed_data))
        db.commit()

        return {
            "import_log_id": log_id,
            "parsed_data": parsed_data
        }
    except Exception as e:
        log = db.query(ImportLog).filter(ImportLog.id == log_id).first()
        if log:
            log.status = cast(Any, 'error')
            log.error_message = cast(Any, str(e))
        db.commit()
        raise HTTPException(status_code=500, detail=f"Error al procesar con IA: {str(e)}")
    finally:
        # Limpieza: Eliminamos el archivo temporal tras el procesamiento inicial
        if os.path.exists(temp_path):
            os.remove(temp_path)

class ConfirmImportPayload(BaseModel):
    confirmed_transactions: List[Dict]
    statement_metadata: Optional[Dict] = None

@router.post("/confirm-import/{import_log_id}")
async def confirm_import(
    import_log_id: str,
    payload: ConfirmImportPayload,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    service = StatementIntelligenceService(db)
    try:
        count = service.finalize_import(import_log_id, payload.confirmed_transactions, payload.statement_metadata)
        
        # Ejecutamos la sanación de snapshots en segundo plano para no bloquear la UI
        background_tasks.add_task(recalculate_stale_snapshots, db)
        
        return {"status": "success", "imported_count": count, "message": "Snapshots marcados para sanación automática."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/parse-account/{account_id}")
async def parse_account_document(
    account_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    content = await file.read()
    file_hash = hashlib.sha256(content).hexdigest()
    
    existing_log = db.query(ImportLog).filter(ImportLog.file_hash == file_hash).first()
    if existing_log and existing_log.status == 'processed':
        raise HTTPException(status_code=400, detail="Este documento ya ha sido procesado previamente.")

    if not existing_log:
        new_log = ImportLog(
            file_hash=file_hash,
            filename=file.filename,
            account_id=account_id,
            status='pending'
        )
        db.add(new_log)
        db.commit()
        db.refresh(new_log)
        log_id = new_log.id
    else:
        log_id = existing_log.id

    try:
        account = db.query(Account).filter(Account.id == account_id).first()
        expected_bank = cast(Optional[str], account.bank_name) if account else None
        
        service = AccountIntelligenceService(db)
        parsed_data = await service.parse_account_document(content, cast(str, file.filename), account_id, expected_bank_name=expected_bank)
        
        log = db.query(ImportLog).filter(ImportLog.id == log_id).first()
        if log: log.metadata_json = cast(Any, json.dumps(parsed_data))
        db.commit()

        return {
            "import_log_id": log_id,
            "parsed_data": parsed_data
        }
    except Exception as e:
        log = db.query(ImportLog).filter(ImportLog.id == log_id).first()
        if log:
            log.status = cast(Any, 'error')
            log.error_message = cast(Any, str(e))
        db.commit()
        raise HTTPException(status_code=500, detail=f"Error al procesar con IA: {str(e)}")

class ConfirmAccountImportPayload(BaseModel):
    confirmed_transactions: List[Dict]

@router.post("/confirm-account-import/{import_log_id}")
async def confirm_account_import(
    import_log_id: str,
    payload: ConfirmAccountImportPayload,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    service = AccountIntelligenceService(db)
    try:
        count = service.finalize_import(import_log_id, payload.confirmed_transactions)
        background_tasks.add_task(recalculate_stale_snapshots, db)
        return {"status": "success", "imported_count": count, "message": "Movimientos importados correctamente."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/snapshot-health")
async def check_snapshot_health(db: Session = Depends(get_db)):
    from app.models.net_worth_snapshot import NetWorthSnapshot
    stale_count = db.query(NetWorthSnapshot).filter(NetWorthSnapshot.is_stale == True).count()
    return {"stale_snapshots": stale_count, "needs_healing": stale_count > 0}
