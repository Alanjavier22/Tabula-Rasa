import uuid
from sqlalchemy import Column, Boolean, Integer, String, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import enum
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from database import Base


class TransactionType(str, enum.Enum):
    INCOME = "income"
    EXPENSE = "expense"


class ExpenseType(str, enum.Enum):
    FIXED = "fixed"
    VARIABLE = "variable"
    OCCASIONAL = "occasional"


class PaymentMethod(str, enum.Enum):
    CASH = "cash"
    CREDIT_CARD = "credit_card"
    DEBIT_CARD = "debit_card"
    TRANSFER = "transfer"
    OTHER = "other"


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(String(36), primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    amount = Column(Integer, nullable=False)
    description = Column(String, nullable=False)
    transaction_type = Column(String, nullable=False, index=True)
    expense_type = Column(SQLEnum(ExpenseType, values_callable=lambda x: [e.value for e in x]), nullable=True)
    payment_method = Column(SQLEnum(PaymentMethod, values_callable=lambda x: [e.value for e in x]), nullable=False)
    date = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, index=True)
    category_id = Column(String(36), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True)
    account_id = Column(String(36), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=True, index=True)
    goal_id = Column(String(36), ForeignKey("goals.id", ondelete="SET NULL"), nullable=True, index=True)  # Vinculación con metas para progreso automático
    running_balance = Column(Integer, nullable=True)  # Bank running balance in centavos at time of transaction (used for deduplication)
    metadata_json = Column(String, nullable=True)  # JSON string for vehicle telemetry: {"odometer": 15000, "liters": 40}
    is_deleted = Column(Boolean, default=False, server_default="0", nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    version = Column(Integer, default=1, nullable=False)  # FASE 1: Versioning para OCC conflict resolution
    hash = Column(String(64), nullable=True)  # FASE 1: SHA-256 hash for deduplication/handshake
    needs_review = Column(Boolean, default=False, nullable=False)  # FASE 1: Conflict flag
    
    # FASE: Evolución Agentica
    sri_category = Column(String, nullable=True)  # Categoría deducible SRI Ecuador
    audit_status = Column(String, default="pending", nullable=False)  # pending, verified, duplicate
    is_manual = Column(Boolean, default=False, nullable=False)  # Bloquea cambios automáticos de IA
    fingerprint = Column(String, unique=True, index=True, nullable=True)  # Hash único robusto
    import_log_id = Column(String(36), ForeignKey("import_logs.id", ondelete="SET NULL"), nullable=True)
    beneficiary = Column(String, nullable=True)  # Beneficiario/pagador (ej: "DLC UBER RIDES", "376653XXXXXX0754")

    # Relationships
    category = relationship("Category", back_populates="transactions")
    account = relationship("Account", back_populates="transactions")
    goal = relationship("Goal", back_populates="transactions")  # Relación con metas
    splits = relationship("TransactionSplit", back_populates="transaction", cascade="all, delete-orphan")
