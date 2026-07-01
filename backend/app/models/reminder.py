import uuid
from sqlalchemy import Column, Boolean, Integer, String, DateTime, Enum as SQLEnum
from datetime import datetime, timezone
import enum
from database import Base


class ReminderFrequency(str, enum.Enum):
    ONCE = "once"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    YEARLY = "yearly"


class ReminderStatus(str, enum.Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    SKIPPED = "skipped"


class Reminder(Base):
    __tablename__ = "reminders"

    id = Column(String(36), primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    amount = Column(Integer, nullable=True)
    due_date = Column(DateTime, nullable=False)
    frequency = Column(SQLEnum(ReminderFrequency), default=ReminderFrequency.ONCE)
    status = Column(SQLEnum(ReminderStatus), default=ReminderStatus.PENDING)
    description = Column(String, nullable=True)
    category_id = Column(String(36), nullable=True)
    is_active = Column(Boolean, default=True)
    is_deleted = Column(Boolean, default=False, server_default="0", nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    version = Column(Integer, default=1, nullable=False)  # FASE 7: OCC versioning para resolución de conflictos
