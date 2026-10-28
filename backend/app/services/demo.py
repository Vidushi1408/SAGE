"""
Demo sandbox: a seeded coffee-shop workspace that visitors can explore read-only without an account.

Visitors are signed in as a *viewer* of the demo workspace, so every write endpoint (sync, upload, invite,
connect, delete) refuses them. The viewer's password is random and never shown, so the only way in is
POST /auth/demo, which can be switched off with ENABLE_DEMO=false (the default in production).
"""
import secrets
from typing import Optional

from sqlalchemy.orm import Session

from app.core.clock import utcnow
from app.core.config import settings
from app.core.security import hash_password
from app.models.connected_account import ConnectedAccount
from app.models.computed_stat import ComputedStat
from app.models.synced_data import SyncedData
from app.models.user import User

DEMO_OWNER_EMAIL = "demo@sage.ai"
DEMO_GUEST_EMAIL = "guest@demo.sage.ai"
# Only used for local development logins; in production the owner's password is random.
DEMO_OWNER_DEV_PASSWORD = "sage_demo_pass"


def is_demo_account(email: str) -> bool:
    return (email or "").lower() in (DEMO_OWNER_EMAIL, DEMO_GUEST_EMAIL)


def _owner(db: Session) -> User:
    owner = db.query(User).filter(User.email == DEMO_OWNER_EMAIL).first()
    if not owner:
        password = secrets.token_urlsafe(32) if settings.is_production else DEMO_OWNER_DEV_PASSWORD
        owner = User(email=DEMO_OWNER_EMAIL, hashed_password=hash_password(password),
                     name="Sage Coffee Shop (demo)", role="admin")
        db.add(owner)
    # Anomaly alerts must never email this address: it isn't ours to mail.
    owner.alert_email_enabled = False
    db.commit()
    db.refresh(owner)
    return owner


def reset_demo_data(db: Session, owner: User) -> int:
    """Replace the demo workspace's rows with freshly generated mock sales; returns the row count."""
    from app.services.sync_service import generate_mock_business_data

    account = db.query(ConnectedAccount).filter(
        ConnectedAccount.user_id == owner.id, ConnectedAccount.service == "google_sheets"
    ).first()
    if not account:
        account = ConnectedAccount(
            user_id=owner.id, service="google_sheets",
            access_token="mock_access_token", refresh_token="mock_refresh_token",
            token_expires_at=utcnow().replace(year=utcnow().year + 10),
            scopes="openid profile email https://www.googleapis.com/auth/spreadsheets.readonly",
            account_metadata={"email": "demo-account@gmail.com", "name": "Sage Coffee Shop Demo Account"},
        )
        db.add(account)
        db.commit()
        db.refresh(account)

    db.query(SyncedData).filter(SyncedData.user_id == owner.id).delete()
    rows = generate_mock_business_data()
    db.bulk_save_objects([
        SyncedData(user_id=owner.id, connected_account_id=account.id, source="google_sheets",
                   external_id=f"mock_sheet_sales_1_Sales_{i}", raw_payload=row, synced_at=utcnow())
        for i, row in enumerate(rows)
    ])
    account.account_metadata = {
        **(account.account_metadata or {}),
        "connected_spreadsheet_id": "mock_sheet_sales_1", "connected_sheet_name": "Sales",
        "last_synced_at": utcnow().isoformat(), "rows_synced": len(rows),
    }
    db.commit()
    return len(rows)


def ensure_demo_workspace(db: Session) -> User:
    """Create (once) the demo workspace with data, stats and insights, and return its read-only guest user."""
    from app.services.sync_service import generate_user_insights, profile_user_data

    owner = _owner(db)
    if not db.query(SyncedData).filter(SyncedData.user_id == owner.id).first():
        reset_demo_data(db, owner)
    if not db.query(ComputedStat).filter(ComputedStat.user_id == owner.id).first():
        profile_user_data(db, owner.id)
        generate_user_insights(db, owner.id)

    guest: Optional[User] = db.query(User).filter(User.email == DEMO_GUEST_EMAIL).first()
    if not guest:
        guest = User(email=DEMO_GUEST_EMAIL, hashed_password=hash_password(secrets.token_urlsafe(32)),
                     name="Demo visitor", role="viewer", workspace_owner_id=owner.id, alert_email_enabled=False)
        db.add(guest)
        db.commit()
        db.refresh(guest)
    return guest
