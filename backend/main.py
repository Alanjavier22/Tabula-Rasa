import sys
import os
import signal
import asyncio
from typing import Any, cast
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

def ensure_jwt_secret():
    import secrets
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    jwt_secret = os.getenv("JWT_SECRET")
    default_secret = "super-secret-local-finance-key-change-in-production"
    
    if not jwt_secret or jwt_secret == default_secret:
        new_secret = secrets.token_hex(32)
        os.environ["JWT_SECRET"] = new_secret
        
        lines = []
        if os.path.exists(env_path):
            with open(env_path, "r", encoding="utf-8") as f:
                lines = f.readlines()
        
        updated = False
        new_lines = []
        for line in lines:
            if line.strip().startswith("JWT_SECRET="):
                new_lines.append(f"JWT_SECRET={new_secret}\n")
                updated = True
            else:
                new_lines.append(line)
        
        if not updated:
            if new_lines and not new_lines[-1].endswith("\n"):
                new_lines.append("\n")
            new_lines.append(f"JWT_SECRET={new_secret}\n")
            
        with open(env_path, "w", encoding="utf-8") as f:
            f.writelines(new_lines)

ensure_jwt_secret()

import logging
from logging.handlers import RotatingFileHandler
from contextlib import asynccontextmanager

class NetworkErrorFilter(logging.Filter):
    """Filter to downgrade network-related errors to warnings."""
    
    def filter(self, record):
        # Downgrade ConnectionResetError to warning
        if record.levelno >= logging.ERROR:
            if 'ConnectionResetError' in record.getMessage() or 'WinError 10054' in record.getMessage():
                record.levelno = logging.WARNING
                record.levelname = 'WARNING'
                record.msg = f"[NETWORK-RECOVERABLE] {record.msg}"
        return True

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
    file_handler.addFilter(NetworkErrorFilter())
    
    # Setup console handler
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    console_handler.setLevel(logging.INFO)
    console_handler.addFilter(NetworkErrorFilter())
    
    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    root_logger.addHandler(file_handler)
    root_logger.addHandler(console_handler)
    
    # Suppress noisy asyncio connection-reset errors on Windows (WinError 10054)
    logging.getLogger("asyncio").setLevel(logging.CRITICAL)
    logging.getLogger("googleapiclient.discovery_cache").setLevel(logging.ERROR)
    
    return root_logger

# Initialize logging
logger = setup_logging()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base, SessionLocal
from sqlalchemy import event

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Application starting up...")
    
    # FASE 3: Autonomous Snapshot Reconciliation
    try:
        from app.services.autonomous_snapshot import AutonomousSnapshotService
        from database import SessionLocal
        db = SessionLocal()
        AutonomousSnapshotService.run_reconciliation(db)
        db.close()
        logger.info("Autonomous snapshot reconciliation completed")
    except Exception as e:
        logger.error(f"[STARTUP] Error in autonomous snapshot: {e}")
        
    yield
    # Shutdown
    logger.info("Application shutting down gracefully...")
    try:
        # Close database connections
        engine.dispose()
        logger.info("Database connections closed")
        
        # Cancel all pending asyncio tasks
        tasks = [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]
        for task in tasks:
            task.cancel()
        logger.info(f"Cancelled {len(tasks)} pending tasks")
        
        # Wait a moment for tasks to cancel
        try:
            await asyncio.sleep(0.5)
        except asyncio.CancelledError:
            pass
        
        logger.info("Graceful shutdown complete")
    except Exception as e:
        logger.error(f"Error during graceful shutdown: {e}")

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
from app.models.deferred_payment import DeferredPayment


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
@event.listens_for(DeferredPayment, 'before_update')

def increment_version(mapper, connection, target):
    """Auto-increment version field on UPDATE for conflict resolution (OCC)"""
    if hasattr(target, 'version'):
        target.version += 1

from app.api import transactions, categories, accounts, budgets, goals, reminders, statements, metrics, config, subscriptions, transaction_splits, ious, net_worth_snapshots, ai_assistant, auth, ai, ai_vision, ai_goals, alerts, fiscal, backup, ai_insights, ai_audio, ai_sentinel, ai_audit, intelligence, export, deferred, maintenance

from middleware.security import SecurityMiddleware
from init_db import init_db

# Schema bootstrap: idempotent create_all + optional Big Bang via DB_RESET=1.
# Set environment variable DB_RESET=1 to drop and recreate all tables (DEV ONLY).
init_db()

app = FastAPI(title="Personal Finance API", version="1.0.0", lifespan=lifespan)

# Security middleware for local handshake
security_middleware = SecurityMiddleware()
app.middleware("http")(security_middleware)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://localhost:5173",
        "https://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(transactions.router)
app.include_router(categories.router)
app.include_router(accounts.router)
app.include_router(budgets.router)
app.include_router(goals.router)
app.include_router(reminders.router)
app.include_router(statements.router)
app.include_router(metrics.router)

app.include_router(config.router)
app.include_router(subscriptions.router)
app.include_router(transaction_splits.router)
app.include_router(ious.router)
app.include_router(net_worth_snapshots.router)
app.include_router(ai.router)
app.include_router(ai_assistant.router)
app.include_router(ai_vision.router)
app.include_router(ai_goals.router)
app.include_router(ai_sentinel.router)
app.include_router(ai_audit.router)
app.include_router(ai_insights.router)
app.include_router(ai_audio.router)
app.include_router(auth.router)
app.include_router(alerts.router)
app.include_router(backup.router)
app.include_router(fiscal.router)
app.include_router(intelligence.router)
app.include_router(export.router)
app.include_router(deferred.router)
app.include_router(maintenance.router)


@app.get("/")
def read_root():
    return {"message": "Personal Finance API", "status": "running"}

@app.get("/health")
def health_check():
    """Health check endpoint - verifies database and system resources."""
    try:
        from database import SessionLocal
        from sqlalchemy import text
        import psutil
        
        db = SessionLocal()
        try:
            # Execute PRAGMA integrity_check on SQLite
            res = db.execute(text("PRAGMA integrity_check;")).fetchone()
            integrity_result = res[0] if res else "unknown"
            
            # Check if integrity is OK
            if integrity_result != "ok":
                return {
                    "status": "unhealthy",
                    "integrity_check": integrity_result,
                    "error": "Database integrity check failed"
                }, 500
            
            # Check WAL mode
            res_wal = db.execute(text("PRAGMA journal_mode;")).fetchone()
            journal_mode = res_wal[0] if res_wal else "unknown"
            
            # Check system memory usage
            memory = psutil.virtual_memory()
            memory_percent = memory.percent
            memory_status = "healthy" if memory_percent < 90 else "warning" if memory_percent < 95 else "critical"
            
            # Check disk usage
            disk = psutil.disk_usage('/')
            disk_percent = disk.percent
            disk_status = "healthy" if disk_percent < 90 else "warning" if disk_percent < 95 else "critical"
            
            # Overall status
            overall_status = "healthy"
            if memory_status == "critical" or disk_status == "critical":
                overall_status = "unhealthy"
            elif memory_status == "warning" or disk_status == "warning":
                overall_status = "degraded"
            
            return {
                "status": overall_status,
                "database": {
                    "integrity_check": integrity_result,
                    "journal_mode": journal_mode,
                    "status": "healthy"
                },
                "system": {
                    "memory_usage_percent": memory_percent,
                    "memory_status": memory_status,
                    "disk_usage_percent": disk_percent,
                    "disk_status": disk_status
                }
            }
        finally:
            db.close()
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
# Force reload: 1
