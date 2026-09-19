import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.core.db import Base

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    name = Column(String, nullable=True)
    role = Column(String, default="admin", nullable=False)  # 'admin', 'analyst', 'viewer'
    workspace_owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    is_active = Column(Boolean, default=True)
    alert_email_enabled = Column(Boolean, default=True, nullable=False)
    # Keys of anomalies already alerted on, so repeat syncs only notify about NEW ones (owner rows only)
    last_alerted_anomalies = Column(JSONB, nullable=True)
    invite_token = Column(String, nullable=True, unique=True)
    invite_token_expires_at = Column(DateTime, nullable=True)
    password_reset_token = Column(String, nullable=True, unique=True)
    password_reset_expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    workspace_owner = relationship("User", remote_side=[id], backref="team_members")
    
    connected_accounts = relationship("ConnectedAccount", back_populates="user", cascade="all, delete-orphan")
    synced_data = relationship("SyncedData", back_populates="user", cascade="all, delete-orphan")
    computed_stats = relationship("ComputedStat", back_populates="user", cascade="all, delete-orphan")
    insights = relationship("Insight", back_populates="user", cascade="all, delete-orphan")
    chat_histories = relationship("ChatHistory", back_populates="user", cascade="all, delete-orphan")
