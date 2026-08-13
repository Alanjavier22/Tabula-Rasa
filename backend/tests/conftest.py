import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base
import app.models  # noqa: F401 - registers every model on Base.metadata


@pytest.fixture()
def db_session():
    """Isolated in-memory SQLite DB per test - never touches the real finance.db.

    StaticPool forces every connection (including the one TestClient's ASGI
    worker thread opens for `client`) onto the same single SQLite connection -
    without it, SQLAlchemy's default per-thread pool for `:memory:` hands that
    worker thread a brand new, schema-less database.
    """
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def fake_device(db_session):
    """A paired device standing in for the authenticated caller of `client`."""
    from app.models.device import PairedDevice

    device = PairedDevice(device_name="Test-Device", is_active=True)
    db_session.add(device)
    db_session.commit()
    db_session.refresh(device)
    return device


@pytest.fixture()
def client(db_session, fake_device, monkeypatch):
    """TestClient wired to the isolated db_session, with auth pre-satisfied.

    `init_db.init_db` (the schema-bootstrap called at module scope by main.py)
    is neutralized *before* main.py is imported for the first time in the test
    process - main.py does `from init_db import init_db`, so patching it here
    means main.py binds the no-op instead of the real one and never touches
    the real finance.db.
    """
    monkeypatch.setattr("init_db.init_db", lambda: None)

    from main import app
    from database import get_db
    from app.api.auth import get_current_device
    from fastapi.testclient import TestClient

    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_current_device] = lambda: fake_device
    # SecurityMiddleware runs as raw ASGI middleware, outside dependency_overrides
    # reach - it gates non-loopback IPs behind a real cookie/device check against
    # the *real* SessionLocal. Spoofing the client IP as loopback here (Starlette's
    # TestClient defaults to "testclient", which isn't) makes it take the same
    # trusted-host bypass the real local frontend gets.
    # Not using `with TestClient(...) as c:` on purpose: main.py's lifespan
    # shutdown hook cancels every pending asyncio task, which races with
    # TestClient's own internal tasks and raises CancelledError at teardown.
    # The app doesn't depend on startup-created state for request handling,
    # so skipping the lifespan trigger entirely sidesteps that crash.
    c = TestClient(app, client=("127.0.0.1", 12345))
    yield c
    app.dependency_overrides.clear()
