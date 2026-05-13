import uuid
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from database import Base


class CategoryPattern(Base):
    """
    Self-learning pattern memory for transaction categorization.
    
    Each row maps a normalized description pattern to a category.
    Patterns are learned from:
      - 'system': Initial seed rules (migrated from hardcoded rules)
      - 'user': Manual recategorization by the user (highest priority)
    """
    __tablename__ = "category_patterns"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    pattern = Column(String, nullable=False, unique=True, index=True)
    category_id = Column(String(36), ForeignKey("categories.id", ondelete="CASCADE"), nullable=False)
    source = Column(String, nullable=False, default="system")  # 'system' | 'user'
    hit_count = Column(Integer, default=0, nullable=False)
    last_used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    category = relationship("Category")
