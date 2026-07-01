import uuid
from sqlalchemy import Column, Boolean, Integer, String, ForeignKey, DateTime, Enum as SQLEnum
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from database import Base
import enum


class IOUType(str, enum.Enum):
    I_OWE = "i_owe"
    THEY_OWE = "they_owe"


class IOUStatus(str, enum.Enum):
    PENDING = "pending"
    SETTLED = "settled"


class IOU(Base):
    __tablename__ = "ious"

    id = Column(String(36), primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    person_name = Column(String, nullable=False)
    amount = Column(Integer, nullable=False)
    iou_type = Column(SQLEnum(IOUType), nullable=False, index=True)
    status = Column(SQLEnum(IOUStatus), nullable=False, index=True, default=IOUStatus.PENDING)
    transaction_id = Column(String(36), ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True, index=True)
    description = Column(String, nullable=True)
    due_date = Column(DateTime, nullable=True)
    is_deleted = Column(Boolean, default=False, server_default="0", nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    version = Column(Integer, default=1, nullable=False)  # FASE 7: Versioning para resolución de conflictos (auto-increment via onupdate)

    # Relationships
    transaction = relationship("Transaction")
