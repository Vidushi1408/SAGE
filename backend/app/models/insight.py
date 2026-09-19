import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.core.db import Base

class Insight(Base):
    __tablename__ = "insights"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    computed_stat_id = Column(UUID(as_uuid=True), ForeignKey("computed_stats.id", ondelete="SET NULL"), nullable=True)
    insight_data = Column(JSONB, nullable=False)  # holds structured JSON of insights list + recommendation
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="insights")
    computed_stat = relationship("ComputedStat")
