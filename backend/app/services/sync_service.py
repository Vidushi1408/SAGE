import os
import json
import random
import logging
from uuid import UUID
from datetime import datetime, timedelta
import pandas as pd
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.core.config import settings
from app.models.connected_account import ConnectedAccount
from app.models.synced_data import SyncedData
from app.models.computed_stat import ComputedStat
from app.models.insight import Insight
from app.analytics.profiler import run_profiling
from app.services.ai import AIService
from app.services.alerts import dispatch_alerts

# Google Auth imports
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from google.auth.exceptions import RefreshError

def generate_mock_business_data():
    """
    Generate highly realistic mock business transactions.
    Contains: Sales over several months with seasonality, categories,
    and a few obvious anomalies/outliers for the profiling layer to find.
    """
    data = []
    base_date = datetime.utcnow() - timedelta(days=90)
    
    categories = ["Coffee", "Bakery", "Merchandise", "Beans", "Sandwiches"]
    payment_methods = ["UPI", "Card", "Cash"]
    
    # Generate ~150 rows of transaction data over 90 days
    for i in range(150):
        # Add random duration to dates to create sequential rows
        days_offset = (i * 90) / 150
        tx_date = base_date + timedelta(days=days_offset)
        
        # Add simple weekly seasonality (more sales on weekends)
        is_weekend = tx_date.weekday() in (5, 6)
        base_amt = 18.0 if is_weekend else 10.0
        
        # Generate amount
        amount = base_amt * random.uniform(0.8, 1.5)
        
        # Introduce a few obvious anomalies (e.g. huge sales outlier and a negative/refund outlier)
        if i == 45:
            amount = 950.0  # Anomaly: Huge corporate order
        elif i == 110:
            amount = -150.0 # Anomaly: Refund outlier
            
        category = random.choice(categories)
        payment = random.choice(payment_methods)
        
        data.append({
            "Date": tx_date.strftime("%Y-%m-%d"),
            "Transaction ID": f"TX_{1000 + i}",
            "Amount": round(amount, 2),
            "Category": category,
            "Payment Method": payment,
            "Quantity": random.randint(1, 5),
            "Customer Email": f"customer_{random.randint(1, 30)}@gmail.com"
        })
        
    return data

def sync_account_sheets(db: Session, account: ConnectedAccount, spreadsheet_id: str, sheet_name: str) -> int:
    """
    Sync Google Sheet rows into synced_data table for a specific account.
    """
    owner_id = account.user_id

    # The workspace analyses ONE worksheet at a time: replace everything previously synced from
    # Google Sheets so switching worksheets (or re-syncing) never double-counts. Uploaded files
    # (source="csv_upload") are separate and untouched.
    db.query(SyncedData).filter(
        SyncedData.user_id == owner_id,
        SyncedData.connected_account_id == account.id,
        SyncedData.source == "google_sheets"
    ).delete(synchronize_session=False)
    db.commit()

    rows_synced = 0

    if account.access_token == "mock_access_token":
        # Generate and insert mock data rows
        mock_data = generate_mock_business_data()
        
        for idx, row in enumerate(mock_data):
            record = SyncedData(
                user_id=owner_id,
                connected_account_id=account.id,
                source="google_sheets",
                external_id=f"{spreadsheet_id}_{sheet_name}_{idx}",
                raw_payload=row,
                synced_at=datetime.utcnow()
            )
            db.add(record)
            rows_synced += 1
            
        # Update metadata to store connected spreadsheet info
        account.account_metadata = {
            **account.account_metadata,
            "connected_spreadsheet_id": spreadsheet_id,
            "connected_sheet_name": sheet_name,
            "last_synced_at": datetime.utcnow().isoformat(),
            "rows_synced": rows_synced
        }
        db.commit()
        return rows_synced

    else:
        # Real Google API sync
        creds = Credentials(
            token=account.access_token,
            refresh_token=account.refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=settings.GOOGLE_CLIENT_ID,
            client_secret=settings.GOOGLE_CLIENT_SECRET,
            scopes=account.scopes.split(",") if account.scopes else None
        )
        
        try:
            service = build("sheets", "v4", credentials=creds)
            sheet = service.spreadsheets()
            result = sheet.values().get(
                spreadsheetId=spreadsheet_id, 
                range=sheet_name
            ).execute()
            
            values = result.get("values", [])
            if not values:
                return 0
                
            headers = values[0]
            headers = [str(h).strip() for h in headers]
            
            for idx, row_vals in enumerate(values[1:], start=1):
                row_vals += [""] * (len(headers) - len(row_vals))
                row_vals = row_vals[:len(headers)]
                row_dict = dict(zip(headers, row_vals))
                
                record = SyncedData(
                    user_id=owner_id,
                    connected_account_id=account.id,
                    source="google_sheets",
                    external_id=f"{spreadsheet_id}_{sheet_name}_{idx}",
                    raw_payload=row_dict,
                    synced_at=datetime.utcnow()
                )
                db.add(record)
                rows_synced += 1
                
            account.account_metadata = {
                **account.account_metadata,
                "connected_spreadsheet_id": spreadsheet_id,
                "connected_sheet_name": sheet_name,
                "last_synced_at": datetime.utcnow().isoformat(),
                "rows_synced": rows_synced
            }
            db.commit()
            return rows_synced
            
        except Exception as e:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to fetch data from Google Sheets API: {str(e)}"
            )

def ingest_uploaded_file(db: Session, account: ConnectedAccount, df: pd.DataFrame, filename: str) -> int:
    """
    Ingest rows from an uploaded CSV/XLSX DataFrame into synced_data for this account,
    mirroring the row-insert pattern used for Google Sheets sync.
    """
    owner_id = account.user_id

    # Clear any previously uploaded rows for this same filename to avoid duplicates on re-upload
    db.query(SyncedData).filter(
        SyncedData.user_id == owner_id,
        SyncedData.connected_account_id == account.id,
        SyncedData.source == "csv_upload",
        SyncedData.external_id.like(f"upload_{filename}_%")
    ).delete(synchronize_session=False)
    db.commit()

    # Round-trip through pandas' own JSON encoder so numpy scalars/Timestamps
    # become plain JSON-serializable Python values before hitting the JSONB column.
    records_json = json.loads(df.to_json(orient="records", date_format="iso"))
    rows_synced = 0

    for idx, row_dict in enumerate(records_json):
        record = SyncedData(
            user_id=owner_id,
            connected_account_id=account.id,
            source="csv_upload",
            external_id=f"upload_{filename}_{idx}",
            raw_payload=row_dict,
            synced_at=datetime.utcnow()
        )
        db.add(record)
        rows_synced += 1

    account.account_metadata = {
        **account.account_metadata,
        "last_filename": filename,
        "last_uploaded_at": datetime.utcnow().isoformat(),
        "rows_synced": rows_synced
    }
    db.commit()
    return rows_synced


def profile_user_data(db: Session, owner_id: UUID) -> dict:
    """
    Run deterministic profiling calculations on a user's synced transaction data.
    Saves and returns the output statistics.
    """
    records = db.query(SyncedData).filter(SyncedData.user_id == owner_id).all()
    if not records:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No synchronized data records found."
        )

    # Execute profiling engine
    profile_data = run_profiling(records)

    # Determine period start and end
    dates = []
    for r in records:
        payload = r.raw_payload
        for k, v in payload.items():
            if k.lower().strip() in ("date", "timestamp", "created_at", "dt"):
                parsed_dt = pd.to_datetime(v, errors="coerce")
                if pd.notna(parsed_dt):
                    dates.append(parsed_dt)

    period_start = min(dates).to_pydatetime() if dates else None
    period_end = max(dates).to_pydatetime() if dates else None

    # Save to computed_stats
    stat = ComputedStat(
        user_id=owner_id,
        metrics=profile_data,
        period_start=period_start,
        period_end=period_end
    )
    db.add(stat)
    db.commit()
    db.refresh(stat)

    return stat.metrics

def generate_user_insights(db: Session, owner_id: UUID) -> Insight:
    """
    Generate plain-English insights from the latest computed stats.
    Saves and returns the output insight record.
    """
    latest_stat = db.query(ComputedStat).filter(
        ComputedStat.user_id == owner_id
    ).order_by(ComputedStat.created_at.desc()).first()

    if not latest_stat:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No computed stats found."
        )

    # Generate insights using AI service
    insight_payload = AIService.generate_insights(latest_stat.metrics)

    # Save to database
    insight_rec = Insight(
        user_id=owner_id,
        computed_stat_id=latest_stat.id,
        insight_data=insight_payload
    )
    db.add(insight_rec)
    db.commit()
    db.refresh(insight_rec)

    try:
        dispatch_alerts(db, owner_id, insight_payload, latest_stat.metrics)
    except Exception as e:
        logging.getLogger("sage.alerts").error(f"Alert dispatch failed: {str(e)}", exc_info=True)

    prune_history(db, owner_id)
    # Later commits expire the instance; reload so callers get a fully populated record.
    db.refresh(insight_rec)
    return insight_rec


HISTORY_LIMIT = 100


def prune_history(db: Session, owner_id: UUID, keep: int = HISTORY_LIMIT) -> None:
    """The scheduler adds a stats + insight row every cycle; keep only the newest `keep` of each."""
    for model in (Insight, ComputedStat):
        stale_ids = [
            row.id for row in db.query(model.id)
            .filter(model.user_id == owner_id)
            .order_by(model.created_at.desc())
            .offset(keep)
            .all()
        ]
        if stale_ids:
            db.query(model).filter(model.id.in_(stale_ids)).delete(synchronize_session=False)
    db.commit()
