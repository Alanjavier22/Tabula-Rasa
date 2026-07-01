import uuid
from sqlalchemy import Column, Boolean, Integer, String, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import enum
from database import Base


class DebtShareStatus(str, enum.Enum):
    PENDING = "pending"
    RECEIVED = "received"
    PAID_TO_CARD = "paid_to_card"


class DebtShare(Base):
    __tablename__ = "debt_shares"

    id = Column(String(36), primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    statement_id = Column(String(36), ForeignKey("credit_card_statements.id", ondelete="CASCADE"), nullable=False)
    person_name = Column(String, nullable=False)
    amount = Column(Integer, nullable=False)
    description = Column(String, nullable=True)
    status = Column(SQLEnum(DebtShareStatus), default=DebtShareStatus.PENDING)
    is_deleted = Column(Boolean, default=False, server_default="0", nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    version = Column(Integer, default=1, nullable=False)  # FASE 7: OCC versioning para resolución de conflictos

    # Relationships
    statement = relationship("CreditCardStatement", back_populates="debt_shares")
