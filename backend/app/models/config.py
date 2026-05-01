import uuid
from sqlalchemy import Column, Boolean, String, Text, DateTime
from datetime import datetime, timezone
from database import Base


class Config(Base):
    __tablename__ = "config"

    id = Column(String(36), primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    key = Column(String, unique=True, nullable=False, index=True)
    value = Column(Text, nullable=True)
    value_type = Column(String, default="string")  # string, number, boolean, json
    description = Column(String, nullable=True)
    is_public = Column(Boolean, default=False)  # Whether config can be accessed by frontend

    is_deleted = Column(Boolean, default=False, server_default="0", nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
