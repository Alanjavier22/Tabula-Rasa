import uuid
from sqlalchemy import Column, String, Text, Integer, DateTime, ForeignKey
from datetime import datetime, timezone
from database import Base


class TransactionEmbedding(Base):
    __tablename__ = "transaction_embeddings"

    id = Column(String(36), primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    description_hash = Column(String(64), unique=True, index=True)
    description = Column(String, nullable=False)
    embedding = Column(Text, nullable=False)
    category_id = Column(String(36), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    source = Column(String, default="transaction")
    hit_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
