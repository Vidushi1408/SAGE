import pytest
from uuid import uuid4
from datetime import datetime

from app.models.user import User
from app.models.connected_account import ConnectedAccount
from app.models.synced_data import SyncedData
from app.models.computed_stat import ComputedStat
from app.models.insight import Insight
from app.services.scheduler import scheduler_service
from app.core.security import hash_password

def test_scheduler_sync_pipeline(db_session):
    """Verify scheduler job runs end-to-end sheets ingestion, profiling, and insights."""
    # 1. Clear database tables for clean test state
    db_session.query(Insight).delete()
    db_session.query(ComputedStat).delete()
    db_session.query(SyncedData).delete()
    db_session.query(ConnectedAccount).delete()
    db_session.query(User).delete()
    db_session.commit()

    # 2. Seed a test owner user
    owner = User(
        email=f"owner_{uuid4()}@company.com",
        hashed_password=hash_password("ownerpassword"),
        role="admin"
    )
    db_session.add(owner)
    db_session.commit()
    db_session.refresh(owner)

    # 3. Seed connected account with target spreadsheet metadata
    account = ConnectedAccount(
        user_id=owner.id,
        service="google_sheets",
        access_token="mock_access_token",
        account_metadata={
            "connected_spreadsheet_id": "test_sheet_id_123",
            "connected_sheet_name": "Sales"
        }
    )
    db_session.add(account)
    db_session.commit()
    db_session.refresh(account)

    # 4. Trigger scheduler pipeline run manually
    scheduler_service.run_scheduled_sync_pipeline(db_session)

    # 5. Check if SyncedData rows were created under the owner
    synced_rows = db_session.query(SyncedData).filter(
        SyncedData.user_id == owner.id
    ).all()
    assert len(synced_rows) == 150  # Mock generator seeds 150 transactions

    # 6. Check if ComputedStat record was computed
    stats = db_session.query(ComputedStat).filter(
        ComputedStat.user_id == owner.id
    ).all()
    assert len(stats) == 1
    assert "summary" in stats[0].metrics

    # 7. Check if Insight record was compiled
    insights = db_session.query(Insight).filter(
        Insight.user_id == owner.id
    ).all()
    assert len(insights) == 1
    assert "recommendation" in insights[0].insight_data

def test_scheduler_lifecycle():
    """Verify starting and stopping the scheduler works without errors."""
    assert not scheduler_service.running
    scheduler_service.start()
    assert scheduler_service.running
    
    # Start again should be idempotent
    scheduler_service.start()
    assert scheduler_service.running

    scheduler_service.shutdown()
    assert not scheduler_service.running
