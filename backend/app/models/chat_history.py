import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.core.db import Base

class ChatHistory(Base):
    __tablename__ = "chat_history"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = Column(String, nullable=False)  # 'user', 'assistant'
    content = Column(Text, nullable=False)
    query_used = Column(Text, nullable=True)  # stores safe pandas query executed
    query_result = Column(JSONB, nullable=True)  # stores result of pandas execution
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="chat_histories")
