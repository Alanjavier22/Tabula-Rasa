import uuid
import hashlib
from sqlalchemy import Column, String, Boolean, DateTime, Integer
from datetime import datetime, timezone
from database import Base


class AuthorizedDevice(Base):
    """
    Table for storing authorized devices for local handshake security.
    Stores SHA-256 hash of api_key_local for security.
    FASE 7: Added protocol_version for handshake versioning.
    """
    __tablename__ = "authorized_devices"

    id = Column(String(36), primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    device_name = Column(String(100), nullable=False)
    api_key_hash = Column(String(64), unique=True, nullable=False, index=True)  # SHA-256 hash
    protocol_version = Column(Integer, default=1, nullable=False)  # FASE 7: Protocol version for handshake
    is_active = Column(Boolean, default=True, nullable=False)
    
    is_deleted = Column(Boolean, default=False, server_default="0", nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    @staticmethod
    def hash_api_key(api_key: str) -> str:
        """Generate SHA-256 hash of api_key_local."""
        return hashlib.sha256(api_key.encode()).hexdigest()
