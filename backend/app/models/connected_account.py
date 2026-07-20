import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.core.db import Base

class ConnectedAccount(Base):
    __tablename__ = "connected_accounts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    service = Column(String, nullable=False)  # 'google_sheets', 'razorpay'
    access_token = Column(String, nullable=False)
    refresh_token = Column(String, nullable=True)
    token_expires_at = Column(DateTime, nullable=True)
    scopes = Column(String, nullable=True)
    account_metadata = Column(JSONB, default={}, nullable=False)  # holds sheet_id, title, etc.
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="connected_accounts")
    synced_records = relationship("SyncedData", back_populates="connected_account", cascade="all, delete-orphan")
