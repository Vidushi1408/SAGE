from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel, HttpUrl, field_validator
from datetime import datetime, timedelta
import urllib.parse
import json
import io
import pandas as pd

from app.core.config import settings
from app.core.db import get_db
from app.api.deps import get_current_user, get_workspace_owner_id, require_writer
from app.core.security import create_oauth_state, verify_oauth_state
from app.analytics.column_mapping import map_columns, column_warnings
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


def google_configured() -> bool:
    return bool(settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET)


@router.get("/google/login")
def google_login(current_user: User = Depends(require_writer)):
    """
    Generate Google OAuth login URL.
    If GOOGLE_CLIENT_ID is not configured, fall back to Mock OAuth Mode.
    The connection always belongs to the workspace owner, even when a teammate starts it.
    """
    state_str = create_oauth_state(get_workspace_owner_id(current_user))

    if not google_configured():
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
    # The state is signed by /google/login, so it can't be forged to attach an
    # account to someone else's workspace.
    user_id = verify_oauth_state(state)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OAuth state parameter"
        )

    # Mock mode only when Google isn't configured (never a bypass in production)
    if not google_configured():
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
    current_user: User = Depends(require_writer),
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


# --- Slack Alerts Connector ---

ALLOWED_SLACK_WEBHOOK_HOSTS = {"hooks.slack.com", "hooks.slack-gov.com"}


class SlackConnectRequest(BaseModel):
    webhook_url: HttpUrl

    @field_validator("webhook_url")
    @classmethod
    def must_be_slack_webhook(cls, v):
        # The server POSTs to this URL, so it must never point at arbitrary/internal hosts.
        if v.scheme != "https" or v.host not in ALLOWED_SLACK_WEBHOOK_HOSTS:
            raise ValueError("Webhook must be an https://hooks.slack.com/... Incoming Webhook URL")
        return v


@router.get("/slack")
def get_slack_connection(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return the Slack alert connection status for the current workspace."""
    owner_id = get_workspace_owner_id(current_user)
    account = db.query(ConnectedAccount).filter(
        ConnectedAccount.user_id == owner_id,
        ConnectedAccount.service == "slack"
    ).first()

    if not account:
        return {"connected": False}

    # The webhook URL is a secret: only admins may see it.
    if current_user.role == "admin":
        return {"connected": True, "webhook_url": account.access_token}
    return {"connected": True}


@router.post("/slack")
def connect_slack(
    payload: SlackConnectRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Save or update the workspace's Slack Incoming Webhook URL for alerts."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admin users can manage Slack alerts."
        )

    owner_id = get_workspace_owner_id(current_user)
    account = db.query(ConnectedAccount).filter(
        ConnectedAccount.user_id == owner_id,
        ConnectedAccount.service == "slack"
    ).first()

    webhook_url_str = str(payload.webhook_url)
    if not account:
        account = ConnectedAccount(
            user_id=owner_id,
            service="slack",
            access_token=webhook_url_str,
            account_metadata={"connected_at": datetime.utcnow().isoformat()}
        )
        db.add(account)
    else:
        account.access_token = webhook_url_str

    db.commit()
    return {"status": "success", "connected": True}


@router.delete("/slack")
def disconnect_slack(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Remove the workspace's Slack alert connection."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admin users can manage Slack alerts."
        )

    owner_id = get_workspace_owner_id(current_user)
    account = db.query(ConnectedAccount).filter(
        ConnectedAccount.user_id == owner_id,
        ConnectedAccount.service == "slack"
    ).first()

    if account:
        db.delete(account)
        db.commit()

    return {"status": "success", "connected": False}


# --- CSV / XLSX Upload Connector ---

MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024  # 5MB
ALLOWED_UPLOAD_EXTENSIONS = (".csv", ".xlsx")


def read_csv_flexibly(contents: bytes) -> pd.DataFrame:
    """Parse a CSV, sniffing the delimiter (comma, semicolon, tab, pipe) and tolerating BOMs / Latin-1."""
    for encoding in ("utf-8-sig", "latin-1"):
        try:
            return pd.read_csv(io.BytesIO(contents), sep=None, engine="python", encoding=encoding)
        except UnicodeDecodeError:
            continue
    raise ValueError("Unsupported text encoding")


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(require_writer),
    db: Session = Depends(get_db)
):
    """
    Upload a CSV or XLSX file as a data source. Rows are ingested into the same
    synced_data table used by Google Sheets, so they flow through profiling automatically.
    """
    filename = file.filename or "upload"
    lower_name = filename.lower()
    if not lower_name.endswith(ALLOWED_UPLOAD_EXTENSIONS):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .csv and .xlsx files are supported."
        )

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File is too large. Maximum upload size is 5MB."
        )

    try:
        if lower_name.endswith(".csv"):
            if b"\x00" in contents[:65536]:
                raise ValueError("this doesn't look like a text CSV file")
            df = read_csv_flexibly(contents)
        else:
            df = pd.read_excel(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not parse the uploaded file: {str(e)}"
        )

    if df.empty:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded file has no data rows."
        )

    owner_id = get_workspace_owner_id(current_user)
    account = db.query(ConnectedAccount).filter(
        ConnectedAccount.user_id == owner_id,
        ConnectedAccount.service == "csv_upload"
    ).first()

    if not account:
        account = ConnectedAccount(
            user_id=owner_id,
            service="csv_upload",
            access_token="uploaded_file",
            account_metadata={}
        )
        db.add(account)
        db.commit()
        db.refresh(account)

    from app.services.sync_service import ingest_uploaded_file
    rows_synced = ingest_uploaded_file(db, account, df, filename)

    _, mapping = map_columns(df)
    warnings = column_warnings([str(c) for c in df.columns], mapping)
    return {
        "status": "success",
        "rows_synced": rows_synced,
        "message": f"Successfully imported {rows_synced} rows from {filename}",
        "warnings": warnings,
    }

