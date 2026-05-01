import uuid
from sqlalchemy import Column, String, Boolean, DateTime
from datetime import datetime, timezone
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from database import Base

class PairedDevice(Base):
    __tablename__ = "paired_devices"

    id = Column(String(36), primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    device_name = Column(String, nullable=False)
    last_sync = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    
    is_deleted = Column(Boolean, default=False, server_default="0", nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
