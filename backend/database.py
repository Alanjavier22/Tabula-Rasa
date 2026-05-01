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
    cursor.execute("PRAGMA integrity_check")
    cursor.close()

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
