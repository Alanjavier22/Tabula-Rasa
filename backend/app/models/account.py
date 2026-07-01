import uuid
from sqlalchemy import Column, Boolean, Integer, String, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import enum
from database import Base


class AccountType(str, enum.Enum):
    CHECKING = "checking"
    SAVINGS = "savings"
    CREDIT_CARD = "credit_card"
    INVESTMENT = "investment"
    CASH = "cash"


class Account(Base):
    __tablename__ = "accounts"

    id = Column(String(36), primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    account_type = Column(SQLEnum(AccountType, values_callable=lambda x: [e.value for e in x]), nullable=False, index=True)
    balance = Column(Integer, default=0)
    currency = Column(String, default="USD")
    credit_limit = Column(Integer, nullable=True)  # Credit limit for credit cards (in cents)
    description = Column(String, nullable=True)
    bank_name = Column(String, nullable=True)
    linked_account_id = Column(String(36), ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True, index=True)
    is_active = Column(Integer, default=1, index=True)
    statement_day = Column(Integer, nullable=True)  # Day of month for credit card statement cut-off (1-31)
    payment_day = Column(Integer, nullable=True)  # Day of month for credit card payment due date (1-31)
    is_deleted = Column(Boolean, default=False, server_default="0", nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    version = Column(Integer, default=1, nullable=False)  # FASE 7: Versioning para resolución de conflictos (auto-increment via onupdate)

    # Relationships
    transactions = relationship("Transaction", back_populates="account")
    subscriptions = relationship("Subscription", back_populates="account")
