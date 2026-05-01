import uuid
from sqlalchemy import Column, Boolean, Integer, String, DateTime, Enum as SQLEnum
from datetime import datetime, timezone
import enum
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from database import Base


class GoalStatus(str, enum.Enum):
    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class Goal(Base):
    __tablename__ = "goals"

    id = Column(String(36), primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    target_amount = Column(Integer, nullable=False)
    current_amount = Column(Integer, default=0)
    target_date = Column(DateTime, nullable=True)
    status = Column(SQLEnum(GoalStatus), default=GoalStatus.ACTIVE)
    description = Column(String, nullable=True)
    is_deleted = Column(Boolean, default=False, server_default="0", nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
