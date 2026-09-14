import sys
import os
from datetime import datetime, timedelta

# Add backend directory to path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models.user import User
from app.models.connected_account import ConnectedAccount
from app.models.synced_data import SyncedData
from app.services.sync_service import generate_mock_business_data
def seed():
    db = SessionLocal()
    try:
        print("🌱 Seeding SAGE demo database...")
        
        # 1. Create or get demo user
        user = db.query(User).filter(User.email == "demo@sage.ai").first()
        if not user:
            print("Creating demo user: demo@sage.ai ...")
            user = User(
                email="demo@sage.ai",
                hashed_password=hash_password("sage_demo_pass")
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            print("Demo user already exists.")

        # 2. Create or get mock connected account
        account = db.query(ConnectedAccount).filter(
            ConnectedAccount.user_id == user.id,
            ConnectedAccount.service == "google_sheets"
        ).first()
        
        if not account:
            print("Creating connected mock account...")
            account = ConnectedAccount(
                user_id=user.id,
                service="google_sheets",
                access_token="mock_access_token",
                refresh_token="mock_refresh_token",
                token_expires_at=datetime.utcnow() + timedelta(hours=24),
                scopes="openid profile email https://www.googleapis.com/auth/spreadsheets.readonly",
                account_metadata={
                    "email": "demo-account@gmail.com",
                    "name": "Sage Coffee Shop Demo Account",
                    "connected_at": datetime.utcnow().isoformat()
                }
            )
            db.add(account)
            db.commit()
            db.refresh(account)
        else:
            print("Connected mock account already exists.")

        # 3. Insert mock synced data (if empty, or override if requested)
        existing_records_count = db.query(SyncedData).filter(SyncedData.user_id == user.id).count()
        if existing_records_count > 0:
            print(f"Database already contains {existing_records_count} synced records for the demo user.")
            print("Clearing old records and re-syncing...")
            db.query(SyncedData).filter(SyncedData.user_id == user.id).delete()
            db.commit()

        mock_data = generate_mock_business_data()
        print(f"Generating {len(mock_data)} mock transactions (seasonality, weekend spikes, anomalies)...")
        
        records_to_insert = []
        for idx, row in enumerate(mock_data):
            record = SyncedData(
                user_id=user.id,
                connected_account_id=account.id,
                source="google_sheets",
                external_id=f"mock_sheet_sales_1_Sales_{idx}",
                raw_payload=row,
                synced_at=datetime.utcnow()
            )
            records_to_insert.append(record)
            
        db.bulk_save_objects(records_to_insert)
        
        # Update connection metadata
        account.account_metadata = {
            **account.account_metadata,
            "connected_spreadsheet_id": "mock_sheet_sales_1",
            "connected_sheet_name": "Sales",
            "last_synced_at": datetime.utcnow().isoformat(),
            "rows_synced": len(mock_data)
        }
        db.commit()
        
        print("✅ Demo seeding completed successfully!")
        print(f"   Demo Username: demo@sage.ai")
        print(f"   Demo Password: sage_demo_pass")
        print(f"   Total Synced Transactions: {len(mock_data)}")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Seeding failed: {str(e)}")
    finally:
        db.close()

if __name__ == "__main__":
    seed()
