"""Reset the local demo workspace (demo@sage.ai) with fresh mock sales data, stats and insights."""
import os
import sys

# Add backend directory to path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app.core.db import SessionLocal
from app.services.demo import DEMO_OWNER_DEV_PASSWORD, DEMO_OWNER_EMAIL, _owner, ensure_demo_workspace, reset_demo_data
from app.services.sync_service import generate_user_insights, profile_user_data


def seed():
    db = SessionLocal()
    try:
        print("🌱 Seeding SAGE demo database...")
        owner = _owner(db)
        rows = reset_demo_data(db, owner)
        profile_user_data(db, owner.id)
        generate_user_insights(db, owner.id)
        ensure_demo_workspace(db)  # also creates the read-only guest used by the "Try the demo" button
        print("✅ Demo seeding completed successfully!")
        print(f"   Demo owner (local dev only): {DEMO_OWNER_EMAIL} / {DEMO_OWNER_DEV_PASSWORD}")
        print(f"   Total synced transactions: {rows}")
    except Exception as e:
        db.rollback()
        print(f"❌ Seeding failed: {str(e)}")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
