"""Google Sheets/Drive access for a connected account: credentials, listing, and reading rows."""
import re
from datetime import datetime, timedelta
from typing import Any, Dict, List

from fastapi import HTTPException, status
from google.auth.exceptions import RefreshError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.connected_account import ConnectedAccount
from app.services.token_crypto import decrypt_token, encrypt_token

TOKEN_URI = "https://oauth2.googleapis.com/token"
MOCK_TOKEN = "mock_access_token"
RECONNECT = "Please reconnect your Google account from the Data page."


def is_mock(account: ConnectedAccount) -> bool:
    return account.access_token == MOCK_TOKEN


def get_credentials(account: ConnectedAccount, db: Session) -> Credentials:
    """Credentials for the account, refreshing (and re-saving, encrypted) the access token when it is about to expire."""
    refresh_token = decrypt_token(account.refresh_token)
    access_token = decrypt_token(account.access_token)
    if not access_token and not refresh_token:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Stored Google credentials are unreadable. {RECONNECT}")

    creds = Credentials(
        token=access_token,
        refresh_token=refresh_token,
        token_uri=TOKEN_URI,
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
    )
    expiring = not account.token_expires_at or datetime.utcnow() >= account.token_expires_at - timedelta(minutes=5)
    if expiring or not access_token:
        if not refresh_token:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Google access expired. {RECONNECT}")
        try:
            creds.refresh(Request())
        except RefreshError:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Google access was revoked or expired. {RECONNECT}")
        account.access_token = encrypt_token(creds.token)
        if creds.expiry:
            account.token_expires_at = creds.expiry  # google-auth returns naive UTC
        db.commit()
    return creds


def _http_error(err: HttpError) -> HTTPException:
    code = getattr(err.resp, "status", 500)
    if code in (401, 403):
        return HTTPException(status.HTTP_400_BAD_REQUEST,
                             f"Google denied access to that spreadsheet. Make sure it belongs to (or is shared with) the connected account. {RECONNECT}")
    if code == 404:
        return HTTPException(status.HTTP_404_NOT_FOUND, "That spreadsheet or worksheet wasn't found.")
    if code == 429:
        return HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Google is rate limiting requests. Try again in a minute.")
    return HTTPException(status.HTTP_502_BAD_GATEWAY, "Google returned an error while reading your spreadsheet.")


def list_spreadsheets(account: ConnectedAccount, db: Session) -> List[Dict[str, Any]]:
    """Spreadsheets visible to the connected account (Drive), each with its worksheet names."""
    creds = get_credentials(account, db)
    try:
        drive = build("drive", "v3", credentials=creds, cache_discovery=False)
        sheets = build("sheets", "v4", credentials=creds, cache_discovery=False)
        files = drive.files().list(
            q="mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
            orderBy="modifiedTime desc", pageSize=25, fields="files(id,name)",
        ).execute().get("files", [])
        out = []
        for f in files:
            try:
                meta = sheets.spreadsheets().get(spreadsheetId=f["id"], fields="sheets.properties.title").execute()
                out.append({"id": f["id"], "name": f["name"], "sheets": [s["properties"]["title"] for s in meta.get("sheets", [])]})
            except HttpError:
                continue  # listed but unreadable (permissions); skip it
        return out
    except HttpError as e:
        if getattr(e.resp, "status", 0) == 403:
            # Drive listing scope missing: the user can still add sheets by link.
            return []
        raise _http_error(e)


def parse_spreadsheet_id(url_or_id: str) -> str:
    """Accept a full Google Sheets URL or a bare spreadsheet id."""
    text = url_or_id.strip()
    m = re.search(r"/spreadsheets/d/([a-zA-Z0-9_-]+)", text)
    if m:
        return m.group(1)
    if re.fullmatch(r"[a-zA-Z0-9_-]{20,}", text):
        return text
    raise HTTPException(status.HTTP_400_BAD_REQUEST, "That doesn't look like a Google Sheets link. Paste the URL from your browser.")


def lookup_spreadsheet(account: ConnectedAccount, db: Session, url_or_id: str) -> Dict[str, Any]:
    sheet_id = parse_spreadsheet_id(url_or_id)
    creds = get_credentials(account, db)
    try:
        sheets = build("sheets", "v4", credentials=creds, cache_discovery=False)
        meta = sheets.spreadsheets().get(spreadsheetId=sheet_id, fields="properties.title,sheets.properties.title").execute()
    except HttpError as e:
        raise _http_error(e)
    return {"id": sheet_id, "name": meta["properties"]["title"], "sheets": [s["properties"]["title"] for s in meta.get("sheets", [])]}


def quote_range(sheet_name: str) -> str:
    """A1 range for a whole worksheet; names with spaces/punctuation must be single-quoted."""
    return "'" + sheet_name.replace("'", "''") + "'"


def fetch_rows(account: ConnectedAccount, db: Session, spreadsheet_id: str, sheet_name: str) -> List[Dict[str, Any]]:
    """Read a worksheet as a list of {header: value} dicts (first row is the header)."""
    creds = get_credentials(account, db)
    try:
        service = build("sheets", "v4", credentials=creds, cache_discovery=False)
        result = service.spreadsheets().values().get(
            spreadsheetId=spreadsheet_id, range=quote_range(sheet_name)
        ).execute()
    except HttpError as e:
        raise _http_error(e)

    values = result.get("values", [])
    if not values:
        return []
    headers = [str(h).strip() for h in values[0]]
    rows = []
    for raw in values[1:]:
        padded = (list(raw) + [""] * len(headers))[: len(headers)]
        rows.append(dict(zip(headers, padded)))
    return rows
