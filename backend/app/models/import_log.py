import uuid
from sqlalchemy import Column, String, DateTime, JSON, Boolean, ForeignKey
from datetime import datetime, timezone
from database import Base

class ImportLog(Base):
    __tablename__ = "import_logs"

    id = Column(String(36), primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    file_hash = Column(String(64), unique=True, index=True, nullable=False)
    filename = Column(String, nullable=False)
    account_id = Column(String(36), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    status = Column(String, default="pending", nullable=False) # pending, processed, error, human_review
    metadata_json = Column(String, nullable=True) # Datos extraídos originalmente por la IA
    error_message = Column(String, nullable=True)
    
    is_deleted = Column(Boolean, default=False, server_default="0", nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
