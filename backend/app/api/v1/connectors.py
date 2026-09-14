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
        
    # Delegate to the unified service helper
    from app.services.sync_service import sync_account_sheets
    rows_synced = sync_account_sheets(db, account, spreadsheet_id, sheet_name)
    return {"status": "success", "rows_synced": rows_synced, "message": f"Successfully synced {rows_synced} rows"}

