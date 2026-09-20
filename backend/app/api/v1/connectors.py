from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel, HttpUrl, field_validator
from datetime import datetime, timedelta
import urllib.parse
import json
import io
import logging
import os
import httpx
import pandas as pd

from app.core.config import settings
from app.core.db import get_db
from app.api.deps import get_current_user, get_workspace_owner_id, require_writer
from app.core.security import create_oauth_state, verify_oauth_state
from app.analytics.column_mapping import map_columns, column_warnings
from app.models.user import User
from app.models.connected_account import ConnectedAccount
from app.models.synced_data import SyncedData
from app.services import google_sheets
from app.services.token_crypto import decrypt_token, encrypt_token

# Google Auth imports
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

router = APIRouter()
logger = logging.getLogger("sage.connectors")

GOOGLE_SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/drive.metadata.readonly",  # list the user's spreadsheets (names only)
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/userinfo.email",
    "openid"
]
SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly"

# Google may return a different (e.g. narrower, user-edited) scope set than requested; accept it and
# verify the one scope we truly need ourselves instead of letting oauthlib raise.
os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")
if settings.ENVIRONMENT != "production" and settings.GOOGLE_REDIRECT_URI.startswith("http://"):
    os.environ.setdefault("OAUTHLIB_INSECURE_TRANSPORT", "1")  # local http://localhost redirect only


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

    # Login and callback are separate requests (and separate Flow objects), so PKCE's per-flow code
    # verifier would be lost. This is a confidential web client (it has a secret), so PKCE isn't needed.
    flow = Flow.from_client_config(
        client_config,
        scopes=GOOGLE_SCOPES,
        state=state,
        autogenerate_code_verifier=False,
    )
    flow.redirect_uri = settings.GOOGLE_REDIRECT_URI
    return flow


def google_configured() -> bool:
    return bool(settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET)


def _google_account(db: Session, owner_id) -> ConnectedAccount | None:
    return db.query(ConnectedAccount).filter(
        ConnectedAccount.user_id == owner_id,
        ConnectedAccount.service == "google_sheets"
    ).first()


def _back_to_app(path: str, **params) -> RedirectResponse:
    return RedirectResponse(url=f"{settings.FRONTEND_URL}{path}?{urllib.parse.urlencode(params)}")


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
        access_type="offline",          # get a refresh token so background syncs keep working
        include_granted_scopes="false",
        prompt="consent"                # always return a refresh token, even on reconnect
    )
    return {"url": authorization_url, "is_mock": False}


@router.get("/google/callback")
def google_callback(
    state: str,
    code: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db)
):
    """Google OAuth2 callback endpoint. Always ends in a redirect back to the app, never a raw error page."""
    # The state is signed by /google/login, so it can't be forged to attach an
    # account to someone else's workspace.
    user_id = verify_oauth_state(state)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OAuth state parameter"
        )

    if error or not code:
        msg = "You cancelled the Google connection." if error == "access_denied" else "Google didn't complete the connection."
        return _back_to_app("/data", google_error=msg)

    # Mock mode only when Google isn't configured (never a bypass in production)
    if not google_configured():
        meta = {"email": "demo-account@gmail.com", "name": "Sage Coffee Shop Demo Account",
                "connected_at": datetime.utcnow().isoformat()}
        account = _google_account(db, user_id)
        if not account:
            account = ConnectedAccount(
                user_id=user_id, service="google_sheets",
                access_token="mock_access_token", refresh_token="mock_refresh_token",
                token_expires_at=datetime.utcnow() + timedelta(hours=24),
                scopes=" ".join(GOOGLE_SCOPES), account_metadata=meta
            )
            db.add(account)
        else:
            account.access_token = "mock_access_token"
            account.refresh_token = "mock_refresh_token"
            account.token_expires_at = datetime.utcnow() + timedelta(hours=24)
            account.account_metadata = meta
        db.commit()
        return _back_to_app("/dashboard", connected="google_sheets", mock="true")

    # Real Google OAuth code exchange
    try:
        flow = get_google_flow(state=state)
        flow.fetch_token(code=code)
        credentials = flow.credentials

        granted = set(credentials.scopes or [])
        if SHEETS_SCOPE not in granted:
            return _back_to_app("/data", google_error="SAGE needs permission to read your spreadsheets. Please reconnect and tick the Sheets access box.")

        info = build("oauth2", "v2", credentials=credentials, cache_discovery=False).userinfo().get().execute()
        meta = {
            "email": info.get("email", "unknown"),
            "name": info.get("name", "Google account"),
            "connected_at": datetime.utcnow().isoformat(),
            "can_list_drive": "https://www.googleapis.com/auth/drive.metadata.readonly" in granted,
        }

        account = _google_account(db, user_id)
        if not account:
            account = ConnectedAccount(user_id=user_id, service="google_sheets")
            db.add(account)
        elif account.account_metadata:
            # Reconnecting keeps the previously chosen spreadsheet/worksheet.
            meta = {**account.account_metadata, **meta}

        account.access_token = encrypt_token(credentials.token)
        if credentials.refresh_token:  # Google only sends this on consent; never overwrite a good one with None
            account.refresh_token = encrypt_token(credentials.refresh_token)
        account.token_expires_at = credentials.expiry
        account.scopes = " ".join(granted)
        account.account_metadata = meta
        db.commit()
        return _back_to_app("/dashboard", connected="google_sheets")

    except Exception as e:
        logger.error("Google OAuth code exchange failed: %s", e, exc_info=True)
        return _back_to_app("/data", google_error="Google sign-in failed. Please try connecting again.")


@router.get("/google/status")
def google_status(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Who the workspace's Google account is, and which worksheet is being synced."""
    account = _google_account(db, get_workspace_owner_id(current_user))
    if not account:
        return {"connected": False, "configured": google_configured()}
    meta = account.account_metadata or {}
    return {
        "connected": True,
        "configured": google_configured(),
        "is_mock": google_sheets.is_mock(account),
        "email": meta.get("email"),
        "name": meta.get("name"),
        "connected_at": meta.get("connected_at"),
        "spreadsheet_id": meta.get("connected_spreadsheet_id"),
        "sheet_name": meta.get("connected_sheet_name"),
        "last_synced_at": meta.get("last_synced_at"),
        "rows_synced": meta.get("rows_synced"),
    }


@router.delete("/google")
def google_disconnect(current_user: User = Depends(require_writer), db: Session = Depends(get_db)):
    """Disconnect Google: revoke our access, forget the tokens, and remove the rows imported from Sheets."""
    owner_id = get_workspace_owner_id(current_user)
    account = _google_account(db, owner_id)
    if not account:
        return {"status": "success", "connected": False}

    if not google_sheets.is_mock(account):
        token = decrypt_token(account.refresh_token) or decrypt_token(account.access_token)
        if token:
            try:  # best effort: the connection is removed here even if Google can't be reached
                httpx.post("https://oauth2.googleapis.com/revoke", params={"token": token}, timeout=10)
            except Exception as e:
                logger.warning("Google token revoke failed: %s", e)

    db.query(SyncedData).filter(
        SyncedData.user_id == owner_id,
        SyncedData.connected_account_id == account.id,
        SyncedData.source == "google_sheets"
    ).delete(synchronize_session=False)
    db.delete(account)
    db.commit()
    return {"status": "success", "connected": False}


@router.get("/sheets")
def list_sheets(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """List Google Sheets available in user's connected account."""
    account = _google_account(db, get_workspace_owner_id(current_user))
    if not account:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google Sheets is not connected")

    if google_sheets.is_mock(account):
        return [
            {"id": "mock_sheet_sales_1", "name": "SAGE Coffee Shop - Sales & Transactions 2026",
             "sheets": ["Sales", "Expenses", "Anomalies_Demo"]},
            {"id": "mock_sheet_inventory_1", "name": "Sage Inventory & Supply Chain",
             "sheets": ["StockLevel", "Vendors"]}
        ]

    sheets = google_sheets.list_spreadsheets(account, db)
    # Include a spreadsheet added by link earlier, even if Drive listing doesn't return it.
    extra = (account.account_metadata or {}).get("extra_spreadsheets", [])
    known = {s["id"] for s in sheets}
    return sheets + [e for e in extra if e["id"] not in known]


class SheetLookupRequest(BaseModel):
    url: str


@router.post("/sheets/lookup")
def lookup_sheet(
    payload: SheetLookupRequest,
    current_user: User = Depends(require_writer),
    db: Session = Depends(get_db)
):
    """Add a spreadsheet by pasting its link (works even without the Drive-listing permission)."""
    account = _google_account(db, get_workspace_owner_id(current_user))
    if not account:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google Sheets is not connected")
    if google_sheets.is_mock(account):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Connect a real Google account to add sheets by link.")

    found = google_sheets.lookup_spreadsheet(account, db, payload.url)
    meta = dict(account.account_metadata or {})
    extra = [e for e in meta.get("extra_spreadsheets", []) if e["id"] != found["id"]] + [found]
    meta["extra_spreadsheets"] = extra[-20:]
    account.account_metadata = meta
    db.commit()
    return found


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

