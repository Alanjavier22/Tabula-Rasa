"""Legacy embedding cache kept in the schema for forward compatibility."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, String, Text, Integer

from database import Base


class TransactionEmbedding(Base):
    """Persisted semantic-cache table from the original categorizer.

    The current categorizer does not write embeddings, but retaining the model
    prevents Alembic from treating existing user data as an accidental orphan.
    """

    __tablename__ = "transaction_embeddings"

    id = Column(String(36), primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    description_hash = Column(String(64), unique=True, index=True, nullable=True)
    description = Column(String, nullable=False)
    embedding = Column(Text, nullable=False)
    category_id = Column(String(36), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    source = Column(String, nullable=True)
    hit_count = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
