import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine
from app.models import *
from app.api import transactions, categories, accounts, budgets, goals, reminders, statements, metrics, csv_import, config, ai_insights, subscriptions, ai_audio, transaction_splits, ious, net_worth_snapshots, ai_assistant, auth, sync
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
app.include_router(ai_insights.router)
app.include_router(subscriptions.router)
app.include_router(ai_audio.router)
app.include_router(transaction_splits.router)
app.include_router(ious.router)
app.include_router(net_worth_snapshots.router)
app.include_router(ai_assistant.router)
app.include_router(auth.router, prefix="/auth", tags=["Auth"])
app.include_router(sync.router)

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
    
    # 1. Asegurar CA y certificados para IP local
    local_ip = ssl_setup.ensure_certs()
    print(f"\n=======================================================")
    print(f"Servidor Local-First Iniciado: https://{local_ip}:8001")
    print(f"Descarga CA en el movil: https://{local_ip}:8001/auth/cert/download")
    print(f"=======================================================\n")
    
    # 2. Iniciar Uvicorn con SSL
    uvicorn.run(
        "main:app", 
        host="0.0.0.0", 
        port=8001,
        ssl_keyfile="certs/server.key",
        ssl_certfile="certs/server.pem",
        reload=True
    )
