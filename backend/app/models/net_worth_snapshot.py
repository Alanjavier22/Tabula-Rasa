import uuid
from sqlalchemy import Boolean, Column, Integer, String, DateTime
from datetime import datetime, timezone
import sys
import os
import json
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from database import Base


class NetWorthSnapshot(Base):
    __tablename__ = "net_worth_snapshots"

    id = Column(String(36), primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    month = Column(Integer, nullable=False, index=True)
    year = Column(Integer, nullable=False, index=True)
    total_assets = Column(Integer, nullable=False)
    total_liabilities = Column(Integer, nullable=False)
    net_worth = Column(Integer, nullable=False)
    snapshot_date = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, index=True)
    metadata_json = Column(String, nullable=True)  # JSON string with account details at snapshot time
    is_stale = Column(Boolean, default=False, nullable=False, index=True)  # Flag for auto-healing
    is_locked = Column(Boolean, default=False, nullable=False, index=True) # User-locked month (Manual override protection)

    is_deleted = Column(Boolean, default=False, server_default="0", nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
