from datetime import datetime, timezone
from sqlalchemy import create_engine, event, inspect, pool
from sqlalchemy.orm import declarative_base, sessionmaker, Mapper
from sqlalchemy.orm.attributes import set_committed_value
from sqlalchemy.types import DateTime as SQLDateTime
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
    cursor.close()

# SQLite no tiene tipo de dato con zona horaria: todo DateTime se guarda y se lee
# naive, aunque se haya escrito con datetime.now(timezone.utc). Este listener global
# (aplica a TODOS los modelos vía propagate=True, sin tocar cada Column) adjunta
# tzinfo=UTC a cualquier datetime naive apenas se carga desde la DB, para que Pydantic
# lo serialice con offset explícito ("+00:00") en vez de un ISO string ambiguo que el
# frontend interpretaba como hora local. set_committed_value evita marcar el atributo
# como modificado (no dispara onupdate ni un UPDATE espurio en el próximo commit).
@event.listens_for(Mapper, "load")
def _coerce_utc_datetimes(target, context):
    mapper = inspect(target).mapper
    for attr in mapper.column_attrs:
        column = attr.columns[0]
        if isinstance(column.type, SQLDateTime):
            value = target.__dict__.get(attr.key)
            if isinstance(value, datetime) and value.tzinfo is None:
                set_committed_value(target, attr.key, value.replace(tzinfo=timezone.utc))

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
