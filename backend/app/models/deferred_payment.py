import enum
from sqlalchemy import Column, String, Integer, ForeignKey, Boolean, DateTime, Numeric
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime, timezone
import uuid

class DeferredPayment(Base):
    __tablename__ = "deferred_payments"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id = Column(String(36), ForeignKey("accounts.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    
    total_amount = Column(Integer, nullable=False)  # centavos
    installment_amount = Column(Integer, nullable=False)  # centavos
    
    total_installments = Column(Integer, nullable=False)
    current_installment = Column(Integer, nullable=False, default=1)
    remaining_balance = Column(Integer, nullable=False)  # centavos
    
    is_shared = Column(Boolean, default=False)
    shared_with = Column(String, nullable=True)
    shared_amount = Column(Integer, nullable=True)  # centavos (cuota compartida)
    
    start_date = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    is_active = Column(Boolean, default=True)
    is_deleted = Column(Boolean, default=False)
    
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    version = Column(Integer, default=1)

    account = relationship("Account")

    def to_dict(self):
        return {
            "id": self.id,
            "account_id": self.account_id,
            "name": self.name,
            "description": self.description,
            "total_amount": self.total_amount,
            "installment_amount": self.installment_amount,
            "total_installments": self.total_installments,
            "current_installment": self.current_installment,
            "remaining_balance": self.remaining_balance,
            "is_shared": self.is_shared,
            "shared_with": self.shared_with,
            "shared_amount": self.shared_amount,
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "version": self.version
        }
