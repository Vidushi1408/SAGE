from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import urllib.parse
import json

from app.core.config import settings
from app.core.db import get_db
from app.api.deps import get_current_user, get_workspace_owner_id
from app.models.user import User
from app.models.connected_account import ConnectedAccount
from app.models.synced_data import SyncedData

# Google Auth imports
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from google.auth.exceptions import RefreshError

router = APIRouter()

GOOGLE_SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/userinfo.email",
    "openid"
]

def get_google_flow(state: str = None) -> Flow:
    """Build a Google Flow object dynamically from app settings."""
    client_config = {
        "web": {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [settings.GOOGLE_REDIRECT_URI],
        }
    }
    
    flow = Flow.from_client_config(
        client_config,
        scopes=GOOGLE_SCOPES,
        state=state
    )
    flow.redirect_uri = settings.GOOGLE_REDIRECT_URI
    return flow


@router.get("/google/login")
def google_login(current_user: User = Depends(get_current_user)):
    """
    Generate Google OAuth login URL.
    If GOOGLE_CLIENT_ID is not configured, fall back to Mock OAuth Mode.
    """
    state_payload = {"user_id": str(current_user.id)}
    state_str = urllib.parse.quote(json.dumps(state_payload))
    
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        # Fallback Mock OAuth redirect URL
        mock_callback_url = (
            f"http://localhost:8000/api/v1/connectors/google/callback"
            f"?state={state_str}&code=mock_code"
        )
        return {"url": mock_callback_url, "is_mock": True}
        
    flow = get_google_flow(state=state_str)
    authorization_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent"
    )
    return {"url": authorization_url, "is_mock": False}


@router.get("/google/callback")
def google_callback(code: str, state: str, db: Session = Depends(get_db)):
    """Google OAuth2 callback endpoint."""
    try:
        # Decode state to recover user ID
        state_decoded = json.loads(urllib.parse.unquote(state))
        user_id = state_decoded.get("user_id")
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid OAuth state parameter"
        )
        
    # Check if we are running in Mock Mode
    if code == "mock_code" or not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        # Create/Update Mock Connected Account
        account = db.query(ConnectedAccount).filter(
            ConnectedAccount.user_id == user_id,
            ConnectedAccount.service == "google_sheets"
        ).first()
        
        if not account:
            account = ConnectedAccount(
                user_id=user_id,
                service="google_sheets",
                access_token="mock_access_token",
                refresh_token="mock_refresh_token",
                token_expires_at=datetime.utcnow() + timedelta(hours=24),
                scopes=" ".join(GOOGLE_SCOPES),
                account_metadata={
                    "email": "demo-account@gmail.com",
                    "name": "Sage Coffee Shop Demo Account",
                    "connected_at": datetime.utcnow().isoformat()
                }
            )
            db.add(account)
        else:
            account.access_token = "mock_access_token"
            account.refresh_token = "mock_refresh_token"
            account.token_expires_at = datetime.utcnow() + timedelta(hours=24)
            account.account_metadata = {
                "email": "demo-account@gmail.com",
                "name": "Sage Coffee Shop Demo Account (Reconnected)",
                "connected_at": datetime.utcnow().isoformat()
            }
        db.commit()
        
        # Redirect user back to Next.js dashboard
        return RedirectResponse(url=f"{settings.FRONTEND_URL}/dashboard?connected=google_sheets&mock=true")

    # Real Google OAuth Code Exchange
    try:
        flow = get_google_flow(state=state)
        flow.fetch_token(code=code)
        credentials = flow.credentials
        
        # Pull profile metadata (email)
        user_info_service = build("oauth2", "v2", credentials=credentials)
        user_info = user_info_service.userinfo().get().execute()
        email = user_info.get("email", "unknown@gmail.com")
        name = user_info.get("name", "Connected Google Account")
        
        # Store in database
        account = db.query(ConnectedAccount).filter(
            ConnectedAccount.user_id == user_id,
            ConnectedAccount.service == "google_sheets"
        ).first()
        
        expires_at = None
        if credentials.expiry:
            expires_at = credentials.expiry
            
        metadata_payload = {
            "email": email,
            "name": name,
            "connected_at": datetime.utcnow().isoformat()
        }
        
        if not account:
            account = ConnectedAccount(
                user_id=user_id,
                service="google_sheets",
                access_token=credentials.token,
                refresh_token=credentials.refresh_token,
                token_expires_at=expires_at,
                scopes=" ".join(credentials.scopes),
                account_metadata=metadata_payload
            )
            db.add(account)
        else:
            account.access_token = credentials.token
            if credentials.refresh_token:
                account.refresh_token = credentials.refresh_token
            account.token_expires_at = expires_at
            account.account_metadata = metadata_payload
            
        db.commit()
        return RedirectResponse(url=f"{settings.FRONTEND_URL}/dashboard?connected=google_sheets")
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"OAuth code exchange failed: {str(e)}"
        )


def refresh_account_token(account: ConnectedAccount, db: Session) -> Credentials:
    """Helper to refresh expired Google OAuth credentials."""
    if account.service != "google_sheets":
        raise ValueError("Token refresh is only implemented for Google Sheets")

    # Reconstruct credentials object
    creds = Credentials(
        token=account.access_token,
        refresh_token=account.refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET
    )

    # Check if expired or expiring within 5 minutes
    if account.token_expires_at and datetime.utcnow() >= account.token_expires_at - timedelta(minutes=5):
        if not account.refresh_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Access token is expired and no refresh token is available. Please reconnect your account."
            )
        try:
            from google.auth.transport.requests import Request
            creds.refresh(Request())
            account.access_token = creds.token
            if creds.expiry:
                account.token_expires_at = creds.expiry
            db.commit()
        except RefreshError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to refresh Google credentials. Please reconnect your account."
            )
            
    return creds


@router.get("/sheets")
def list_sheets(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """List Google Sheets available in user's connected account."""
    owner_id = get_workspace_owner_id(current_user)
    account = db.query(ConnectedAccount).filter(
        ConnectedAccount.user_id == owner_id,
        ConnectedAccount.service == "google_sheets"
    ).first()
    
    if not account:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google Sheets is not connected"
        )
        
    # If Mock Account
    if account.access_token == "mock_access_token":
        return [
            {
                "id": "mock_sheet_sales_1",
                "name": "SAGE Coffee Shop - Sales & Transactions 2026",
                "sheets": ["Sales", "Expenses", "Anomalies_Demo"]
            },
            {
                "id": "mock_sheet_inventory_1",
                "name": "Sage Inventory & Supply Chain",
                "sheets": ["StockLevel", "Vendors"]
            }
        ]
        
    # Real Google API listing
    try:
        creds = refresh_account_token(account, db)
        drive_service = build("drive", "v3", credentials=creds)
        sheets_service = build("sheets", "v4", credentials=creds)
        
        # Search for spreadsheets in Google Drive
        results = drive_service.files().list(
            q="mimeType='application/vnd.google-apps.spreadsheet'",
            pageSize=30,
            fields="files(id, name)"
        ).execute()
        files = results.get("files", [])
        
        output = []
        for f in files:
            try:
                # Fetch sheet names inside each spreadsheet
                spreadsheet_metadata = sheets_service.spreadsheets().get(
                    spreadsheetId=f["id"]
                ).execute()
                sheets = [s["properties"]["title"] for s in spreadsheet_metadata.get("sheets", [])]
                output.append({
                    "id": f["id"],
                    "name": f["name"],
                    "sheets": sheets
                })
            except Exception:
                # If we cannot access a specific sheet file (permissions), skip it
                continue
        return output
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve files from Google Drive: {str(e)}"
        )


@router.post("/sheets/sync")
def sync_sheet(
    spreadsheet_id: str,
    sheet_name: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Sync Google Sheet rows into synced_data table.
    For Mock sheets, imports highly realistic business sales data.
    """
    owner_id = get_workspace_owner_id(current_user)
    account = db.query(ConnectedAccount).filter(
        ConnectedAccount.user_id == owner_id,
        ConnectedAccount.service == "google_sheets"
    ).first()
    
    if not account:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google Sheets is not connected"
        )
        
    # Clear existing synced records for this sheet/source to avoid duplicates
    db.query(SyncedData).filter(
        SyncedData.user_id == owner_id,
        SyncedData.connected_account_id == account.id,
        SyncedData.source == "google_sheets",
        SyncedData.external_id.like(f"{spreadsheet_id}_{sheet_name}_%")
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
        return {"status": "success", "rows_synced": rows_synced, "message": "Synced mock business data"}

    # Real Google API synchronization
    try:
        creds = refresh_account_token(account, db)
        sheets_service = build("sheets", "v4", credentials=creds)
        
        # Read the spreadsheet sheet values
        range_name = f"{sheet_name}!A1:Z10000"  # Read first 10k rows
        result = sheets_service.spreadsheets().values().get(
            spreadsheetId=spreadsheet_id,
            range=range_name
        ).execute()
        
        values = result.get("values", [])
        if not values:
            return {"status": "success", "rows_synced": 0, "message": "Sheet is empty"}
            
        headers = values[0]
        # Ensure header elements are clean strings
        headers = [str(h).strip() for h in headers]
        
        for idx, row_vals in enumerate(values[1:], start=1):
            # Pad row values if it's shorter than header length
            row_vals += [""] * (len(headers) - len(row_vals))
            # Slice row values if it's longer than header length
            row_vals = row_vals[:len(headers)]
            
            # Map row to header dictionary
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
            
        # Update metadata to store connected spreadsheet info
        account.account_metadata = {
            **account.account_metadata,
            "connected_spreadsheet_id": spreadsheet_id,
            "connected_sheet_name": sheet_name,
            "last_synced_at": datetime.utcnow().isoformat(),
            "rows_synced": rows_synced
        }
        db.commit()
        return {"status": "success", "rows_synced": rows_synced, "message": f"Successfully synced {rows_synced} rows"}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch data from Google Sheets API: {str(e)}"
        )


def generate_mock_business_data():
    """
    Generate highly realistic mock business transactions.
    Contains: Sales over several months with seasonality, categories,
    and a few obvious anomalies/outliers for the profiling layer to find.
    """
    import random
    from datetime import datetime as dt, timedelta
    
    data = []
    base_date = dt.utcnow() - timedelta(days=90)
    
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
