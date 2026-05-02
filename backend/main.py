import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import logging
from logging.handlers import RotatingFileHandler

# FASE 5: Configure rotating file handler for logs (10MB max, 5 backups)
def setup_logging():
    """Configure logging with rotation to prevent unlimited log growth."""
    log_dir = os.path.dirname(os.path.abspath(__file__))
    log_file = os.path.join(log_dir, 'backend.log')
    
    # Create formatter
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Setup rotating file handler (10MB max, 5 backups)
    file_handler = RotatingFileHandler(
        log_file,
        maxBytes=10 * 1024 * 1024,  # 10MB
        backupCount=5,
        encoding='utf-8'
    )
    file_handler.setFormatter(formatter)
    file_handler.setLevel(logging.INFO)
    
    # Setup console handler
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    console_handler.setLevel(logging.INFO)
    
    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    root_logger.addHandler(file_handler)
    root_logger.addHandler(console_handler)
    
    return root_logger

# Initialize logging
logger = setup_logging()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
from sqlalchemy import event
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

# Import models explicitly to register them with Base (fixes circular import)
from app.models.transaction import Transaction
from app.models.account import Account
from app.models.asset import Asset
from app.models.iou import IOU
from app.models.category import Category
from app.models.budget import Budget
from app.models.reminder import Reminder
from app.models.subscription import Subscription
from app.models.credit_card_statement import CreditCardStatement
from app.models.debt_share import DebtShare
from app.models.authorized_device import AuthorizedDevice

# Register event listeners for auto-increment version on UPDATE (OCC conflict resolution)
@event.listens_for(Transaction, 'before_update')
@event.listens_for(Account, 'before_update')
@event.listens_for(Asset, 'before_update')
@event.listens_for(IOU, 'before_update')
@event.listens_for(Category, 'before_update')
@event.listens_for(Budget, 'before_update')
@event.listens_for(Reminder, 'before_update')
@event.listens_for(Subscription, 'before_update')
@event.listens_for(CreditCardStatement, 'before_update')
@event.listens_for(DebtShare, 'before_update')
def increment_version(mapper, connection, target):
    """Auto-increment version field on UPDATE for conflict resolution (OCC)"""
    if hasattr(target, 'version'):
        target.version += 1

from app.api import transactions, categories, accounts, budgets, goals, reminders, statements, metrics, csv_import, config, subscriptions, transaction_splits, ious, net_worth_snapshots, ai_assistant, auth, ai
from middleware.security import SecurityMiddleware
from init_db import init_db

# Schema bootstrap: idempotent create_all + optional Big Bang via DB_RESET=1.
# Set environment variable DB_RESET=1 to drop and recreate all tables (DEV ONLY).
init_db()

app = FastAPI(title="Personal Finance API", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Expandir CORS para admitir IPs locales dinámicas en desarrollo
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security middleware for local handshake
security_middleware = SecurityMiddleware()
app.middleware("http")(security_middleware)

# Include routers
app.include_router(transactions.router)
app.include_router(categories.router)
app.include_router(accounts.router)
app.include_router(budgets.router)
app.include_router(goals.router)
app.include_router(reminders.router)
app.include_router(statements.router)
app.include_router(metrics.router)
app.include_router(csv_import.router)
app.include_router(config.router)
app.include_router(subscriptions.router)
app.include_router(transaction_splits.router)
app.include_router(ious.router)
app.include_router(net_worth_snapshots.router)
app.include_router(ai_assistant.router)
app.include_router(ai.router)
app.include_router(auth.router, prefix="/auth", tags=["Auth"])

# FASE 3: Configure background scheduler for daily external backups
scheduler = BackgroundScheduler()

def scheduled_external_backup():
    """
    Scheduled task to create external backup of the database.
    Runs daily at the time specified in BACKUP_SCHEDULE environment variable.
    Default: Daily at 2:00 AM
    """
    try:
        from app.utils.backup import create_external_backup
        logger.info("[SCHEDULED_BACKUP] Starting scheduled external backup...")
        backup_path = create_external_backup()
        if backup_path:
            logger.info(f"[SCHEDULED_BACKUP] External backup completed successfully: {backup_path}")
        else:
            logger.warning("[SCHEDULED_BACKUP] External backup skipped (path not configured or failed)")
    except Exception as e:
        logger.error(f"[SCHEDULED_BACKUP] Error during scheduled backup: {e}")

# Parse backup schedule from environment variable (default: 0 2 * * * = daily at 2:00 AM)
import os
from dotenv import load_dotenv
load_dotenv()

backup_schedule = os.getenv('BACKUP_SCHEDULE', '0 2 * * *')
schedule_parts = backup_schedule.split()

# Validate schedule format (5 parts: minute hour day month day_of_week)
if len(schedule_parts) == 5:
    try:
        # Use CronTrigger.from_crontab() to handle wildcard (*) characters properly
        scheduler.add_job(
            scheduled_external_backup,
            trigger=CronTrigger.from_crontab(backup_schedule),
            id='external_backup',
            name='Daily External Database Backup',
            replace_existing=True
        )
        logger.info(f"[SCHEDULED_BACKUP] Scheduled daily external backup at: {backup_schedule}")
    except Exception as e:
        logger.warning(f"[SCHEDULED_BACKUP] Invalid BACKUP_SCHEDULE format: {backup_schedule}. Error: {e}")
else:
    logger.warning(f"[SCHEDULED_BACKUP] Invalid BACKUP_SCHEDULE format: {backup_schedule}. Expected 5 parts (minute hour day month day_of_week)")

# Start the scheduler
scheduler.start()
logger.info("[SCHEDULED_BACKUP] Background scheduler started")

@app.get("/")
def read_root():
    return {"message": "Personal Finance API", "status": "running"}

@app.get("/health")
def health_check():
    try:
        # Execute PRAGMA integrity_check on SQLite
        from database import SessionLocal
        db = SessionLocal()
        result = db.execute("PRAGMA integrity_check;")
        integrity_result = result.fetchone()[0]
        db.close()
        
        # Check if integrity is OK
        if integrity_result != "ok":
            return {
                "status": "unhealthy",
                "integrity_check": integrity_result,
                "error": "Database integrity check failed"
            }, 500
        
        # Check WAL mode
        result = db.execute("PRAGMA journal_mode;")
        journal_mode = result.fetchone()[0]
        
        return {
            "status": "healthy",
            "integrity_check": integrity_result,
            "journal_mode": journal_mode
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e)
        }, 500

if __name__ == "__main__":
    import uvicorn
    import ssl_setup
    
    # FASE 8: Check if TLS certificates exist, generate if needed
    cert_dir = os.path.dirname(os.path.abspath(__file__))
    cert_path = os.path.join(cert_dir, "cert.pem")
    key_path = os.path.join(cert_dir, "key.pem")
    
    if not os.path.exists(cert_path) or not os.path.exists(key_path):
        logger.info("[FASE-8] TLS certificates not found, generating...")
        from scripts.generate_certs import generate_self_signed_cert
        generate_self_signed_cert()
    
    # 1. Asegurar CA y certificados para IP local
    local_ip = ssl_setup.ensure_certs()
    print(f"\n=======================================================")
    print(f"Servidor Local-First Iniciado: https://{local_ip}:8001")
    print(f"Descarga CA en el movil: https://{local_ip}:8001/auth/cert/download")
    print(f"=======================================================\n")
    
    # 2. Iniciar Uvicorn con SSL (FASE 8: Use generated certificates)
    uvicorn.run(
        "main:app", 
        host="0.0.0.0", 
        port=8001,
        ssl_keyfile=key_path,
        ssl_certfile=cert_path,
        reload=True
    )
