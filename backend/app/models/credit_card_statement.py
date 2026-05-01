import uuid
from sqlalchemy import Column, Boolean, Integer, String, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import enum
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from database import Base


class StatementStatus(str, enum.Enum):
    PENDING = "pending"
    PARTIAL = "partial"
    PAID = "paid"


class CreditCardStatement(Base):
    __tablename__ = "credit_card_statements"

    id = Column(String(36), primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    account_id = Column(String(36), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    statement_balance = Column(Integer, nullable=False)
    user_share = Column(Integer, nullable=False)
    payment_due_date = Column(DateTime, nullable=True, index=True)
    cut_off_date = Column(DateTime, nullable=True)
    amount_paid = Column(Integer, default=0)
    status = Column(SQLEnum(StatementStatus), default=StatementStatus.PENDING, index=True)
    month = Column(Integer, nullable=False, index=True)
    year = Column(Integer, nullable=False, index=True)
    notes = Column(String, nullable=True)
    is_deleted = Column(Boolean, default=False, server_default="0", nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    version = Column(Integer, default=1, nullable=False)  # FASE 7: OCC versioning para resolución de conflictos

    # Relationships
    account = relationship("Account", backref="statements")
    debt_shares = relationship("DebtShare", back_populates="statement", cascade="all, delete-orphan")
