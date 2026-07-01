import uuid
from sqlalchemy import Column, Boolean, Integer, String, DateTime
from datetime import datetime, timezone
from sqlalchemy.orm import relationship
from database import Base


class Category(Base):
    __tablename__ = "categories"

    id = Column(String(36), primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False, unique=True)
    description = Column(String, nullable=True)
    color = Column(String, nullable=True)  # Hex color code for UI
    icon = Column(String, nullable=True)  # Icon name for UI
    is_default = Column(Boolean, default=False)

    is_deleted = Column(Boolean, default=False, server_default="0", nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    version = Column(Integer, default=1, nullable=False)  # FASE 7: OCC versioning para resolución de conflictos

    # Relationships
    transactions = relationship("Transaction", back_populates="category")
    subscriptions = relationship("Subscription", back_populates="category")
