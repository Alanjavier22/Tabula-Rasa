from sqlalchemy import create_engine, event, pool
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

# Database file path — ABSOLUTE para ser consistente sin importar el CWD del launcher.
# Esto evita que existan múltiples finance.db (uno por cada cwd desde el que se inicie el server).
_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
_DB_PATH = os.path.join(_BACKEND_DIR, "finance.db")
DATABASE_URL = f"sqlite:///{_DB_PATH}"

# Create engine with concurrency optimizations
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False, "timeout": 30.0},
    poolclass=pool.QueuePool,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True
)

# Enable foreign keys in SQLite
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_conn, connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA busy_timeout=30000")
    # FASE 7: Integrity check on connection
    cursor.execute("PRAGMA integrity_check")
    cursor.close()

# FASE 7: Auto-increment version on UPDATE for conflict resolution (FULL OCC)
from sqlalchemy import event
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
    """Auto-increment version field on UPDATE for conflict resolution (FULL OCC)"""
    if hasattr(target, 'version'):
        target.version += 1

# Create SessionLocal class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create Base class for models
Base = declarative_base()

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
