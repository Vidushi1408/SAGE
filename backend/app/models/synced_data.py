import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.core.db import Base

class SyncedData(Base):
    __tablename__ = "synced_data"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    connected_account_id = Column(UUID(as_uuid=True), ForeignKey("connected_accounts.id", ondelete="CASCADE"), nullable=False)
    source = Column(String, nullable=False)  # 'google_sheets', 'razorpay'
    external_id = Column(String, nullable=False)  # e.g., 'sheet_id_row_5' or Razorpay payment ID
    raw_payload = Column(JSONB, nullable=False)
    synced_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="synced_data")
    connected_account = relationship("ConnectedAccount", back_populates="synced_records")
