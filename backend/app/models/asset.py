import uuid
from sqlalchemy import Column, Integer, String, DateTime, Boolean
from datetime import datetime, timezone
from database import Base


class Asset(Base):
    __tablename__ = "assets"

    id = Column(String(36), primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    purchase_price_cents = Column(Integer, nullable=False)  # Purchase price in cents
    purchase_date = Column(DateTime, nullable=False, index=True)  # When asset was purchased
    estimated_life_months = Column(Integer, nullable=False)  # Useful life in months
    residual_value_cents = Column(Integer, nullable=False, default=0)  # Residual value in cents
    is_deleted = Column(Boolean, default=False, server_default="0", nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    version = Column(Integer, default=1, nullable=False)  # FASE 7: Versioning para resolución de conflictos (auto-increment via onupdate)
