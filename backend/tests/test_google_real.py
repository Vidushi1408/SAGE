"""Real (non-mock) Google Sheets path, with every Google call faked."""
from datetime import datetime, timedelta
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi import HTTPException

from app.api.v1 import connectors
from app.core.config import settings
from app.models.connected_account import ConnectedAccount
from app.models.synced_data import SyncedData
from app.models.user import User
from app.services import google_sheets
from app.services.token_crypto import decrypt_token, encrypt_token

SHEETS = "https://www.googleapis.com/auth/spreadsheets.readonly"


def headers(client):
    r = client.post("/api/v1/auth/login", data={"username": "demo@sage.ai", "password": "sage_demo_pass"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def state_for(client, h):
    url = client.get("/api/v1/connectors/google/login", headers=h).json()["url"]
    return parse_qs(urlparse(url).query)["state"][0]


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "cid.apps.googleusercontent.com")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "secret")


def fake_flow(scopes, refresh="refresh-tok"):
    class Flow:
        credentials = SimpleNamespace(token="access-tok", refresh_token=refresh,
                                      expiry=datetime.utcnow() + timedelta(hours=1), scopes=scopes)
        def fetch_token(self, code): assert code == "good-code"
    return Flow()


def fake_userinfo(monkeypatch):
    class Exec:
        def execute(self): return {"email": "owner@gmail.com", "name": "Owner"}
    svc = SimpleNamespace(userinfo=lambda: SimpleNamespace(get=lambda: Exec()))
    monkeypatch.setattr(connectors, "build", lambda *a, **k: svc)


def real_account(db_session, **kw):
    user = db_session.query(User).filter(User.email == "demo@sage.ai").first()
    db_session.query(ConnectedAccount).filter(ConnectedAccount.user_id == user.id, ConnectedAccount.service == "google_sheets").delete()
    acct = ConnectedAccount(user_id=user.id, service="google_sheets", access_token=encrypt_token("access-tok"),
                            refresh_token=encrypt_token("refresh-tok"),
                            token_expires_at=kw.get("expires", datetime.utcnow() + timedelta(hours=1)),
                            scopes=SHEETS, account_metadata={"email": "owner@gmail.com"})
    db_session.add(acct); db_session.flush()
    return user, acct


def test_token_crypto_roundtrip_and_passthrough():
    enc = encrypt_token("secret-token")
    assert enc.startswith("enc:") and "secret-token" not in enc
    assert decrypt_token(enc) == "secret-token"
    assert decrypt_token("mock_access_token") == "mock_access_token"   # legacy / mock values
    assert encrypt_token(enc) == enc                                    # never double-encrypts
    assert decrypt_token("enc:garbage") is None                         # wrong key -> unusable, not a crash


def test_callback_stores_encrypted_tokens_and_reports_success(client, db_session, configured, monkeypatch):
    h = headers(client); st = state_for(client, h)
    monkeypatch.setattr(connectors, "get_google_flow", lambda state=None: fake_flow(connectors.GOOGLE_SCOPES))
    fake_userinfo(monkeypatch)
    r = client.get(f"/api/v1/connectors/google/callback?state={st}&code=good-code", follow_redirects=False)
    assert r.status_code in (302, 307) and "connected=google_sheets" in r.headers["location"] and "mock" not in r.headers["location"]
    demo = db_session.query(User).filter(User.email == "demo@sage.ai").first()
    acct = db_session.query(ConnectedAccount).filter(ConnectedAccount.user_id == demo.id, ConnectedAccount.service == "google_sheets").first()
    assert acct.access_token.startswith("enc:") and acct.refresh_token.startswith("enc:")
    assert decrypt_token(acct.refresh_token) == "refresh-tok"
    status = client.get("/api/v1/connectors/google/status", headers=h).json()
    assert status["connected"] and status["email"] == "owner@gmail.com" and status["is_mock"] is False


def test_callback_without_sheets_permission_is_rejected_politely(client, configured, monkeypatch):
    h = headers(client); st = state_for(client, h)
    monkeypatch.setattr(connectors, "get_google_flow", lambda state=None: fake_flow(["openid"]))
    fake_userinfo(monkeypatch)
    r = client.get(f"/api/v1/connectors/google/callback?state={st}&code=good-code", follow_redirects=False)
    assert "google_error=" in r.headers["location"] and "/data" in r.headers["location"]


def test_callback_user_cancelled_and_exchange_failure_redirect_with_message(client, configured, monkeypatch):
    h = headers(client); st = state_for(client, h)
    r = client.get(f"/api/v1/connectors/google/callback?state={st}&error=access_denied", follow_redirects=False)
    assert "cancelled" in r.headers["location"]

    def boom(state=None): raise RuntimeError("invalid_grant")
    monkeypatch.setattr(connectors, "get_google_flow", boom)
    r = client.get(f"/api/v1/connectors/google/callback?state={st}&code=x", follow_redirects=False)
    assert "google_error=" in r.headers["location"]


def test_callback_rejects_forged_state(client):
    assert client.get("/api/v1/connectors/google/callback?state=forged&code=x").status_code == 400


def test_reconnect_keeps_existing_refresh_token_when_google_omits_it(client, db_session, configured, monkeypatch):
    h = headers(client); st = state_for(client, h)
    _, acct = real_account(db_session)
    monkeypatch.setattr(connectors, "get_google_flow", lambda state=None: fake_flow(connectors.GOOGLE_SCOPES, refresh=None))
    fake_userinfo(monkeypatch)
    client.get(f"/api/v1/connectors/google/callback?state={st}&code=good-code", follow_redirects=False)
    db_session.refresh(acct)
    assert decrypt_token(acct.refresh_token) == "refresh-tok"


def test_credentials_refresh_when_expired_and_persist_encrypted(db_session, configured, monkeypatch):
    _, acct = real_account(db_session, expires=datetime.utcnow() - timedelta(minutes=1))

    def fake_refresh(self, request):
        self.token = "new-access"; self.expiry = datetime.utcnow() + timedelta(hours=1)
    monkeypatch.setattr("google.oauth2.credentials.Credentials.refresh", fake_refresh)
    creds = google_sheets.get_credentials(acct, db_session)
    assert creds.token == "new-access"
    assert decrypt_token(acct.access_token) == "new-access"


def test_credentials_revoked_gives_reconnect_message(db_session, configured, monkeypatch):
    from google.auth.exceptions import RefreshError
    _, acct = real_account(db_session, expires=datetime.utcnow() - timedelta(minutes=1))
    def deny(self, request): raise RefreshError("invalid_grant")
    monkeypatch.setattr("google.oauth2.credentials.Credentials.refresh", deny)
    with pytest.raises(HTTPException) as e:
        google_sheets.get_credentials(acct, db_session)
    assert e.value.status_code == 400 and "reconnect" in e.value.detail.lower()


def test_range_is_quoted_for_worksheets_with_spaces_and_quotes():
    assert google_sheets.quote_range("Q1 Sales") == "'Q1 Sales'"
    assert google_sheets.quote_range("Owner's data") == "'Owner''s data'"


def test_parse_spreadsheet_id_from_url_or_bare_id():
    sid = "1AbC_dEf-GhIjKlMnOpQrStUvWxYz0123456789"
    assert google_sheets.parse_spreadsheet_id(f"https://docs.google.com/spreadsheets/d/{sid}/edit#gid=0") == sid
    assert google_sheets.parse_spreadsheet_id(sid) == sid
    with pytest.raises(HTTPException):
        google_sheets.parse_spreadsheet_id("https://example.com/not-a-sheet")


def test_sync_reads_real_rows_and_a_google_failure_keeps_existing_data(client, db_session, configured, monkeypatch):
    h = headers(client)
    user, acct = real_account(db_session)
    monkeypatch.setattr(google_sheets, "fetch_rows",
                        lambda a, d, sid, name: [{"Date": "2026-01-01", "Amount": "$1,200.50"}, {"Date": "2026-01-02", "Amount": "300"}])
    r = client.post("/api/v1/connectors/sheets/sync?spreadsheet_id=abc&sheet_name=Q1 Sales", headers=h)
    assert r.status_code == 200 and r.json()["rows_synced"] == 2

    def fail(*a, **k): raise HTTPException(400, "Google denied access")
    monkeypatch.setattr(google_sheets, "fetch_rows", fail)
    r = client.post("/api/v1/connectors/sheets/sync?spreadsheet_id=abc&sheet_name=Q1 Sales", headers=h)
    assert r.status_code == 400
    kept = db_session.query(SyncedData).filter(SyncedData.user_id == user.id, SyncedData.source == "google_sheets").count()
    assert kept == 2


def test_disconnect_revokes_and_removes_account_and_rows(client, db_session, configured, monkeypatch):
    h = headers(client)
    user, acct = real_account(db_session)
    monkeypatch.setattr(google_sheets, "fetch_rows", lambda *a: [{"Date": "2026-01-01", "Amount": "5"}])
    client.post("/api/v1/connectors/sheets/sync?spreadsheet_id=abc&sheet_name=Sales", headers=h)
    revoked = {}
    monkeypatch.setattr(connectors.httpx, "post", lambda url, params=None, timeout=None: revoked.update(url=url, token=params["token"]))
    assert client.delete("/api/v1/connectors/google", headers=h).status_code == 200
    assert revoked["token"] == "refresh-tok" and "revoke" in revoked["url"]
    assert client.get("/api/v1/connectors/google/status", headers=h).json()["connected"] is False
    assert db_session.query(SyncedData).filter(SyncedData.user_id == user.id, SyncedData.source == "google_sheets").count() == 0


def test_viewers_cannot_disconnect(client, db_session):
    h = headers(client)
    invite = client.post("/api/v1/team/invite", headers=h, json={"email": "viewer_g@example.com", "role": "viewer"})
    assert invite.status_code == 201
    from app.models.user import User as U
    v = db_session.query(U).filter(U.email == "viewer_g@example.com").first()
    tok = client.post("/api/v1/team/accept-invite", json={"token": v.invite_token, "name": "V", "password": "Passw0rd!"})
    assert tok.status_code == 200
    vt = client.post("/api/v1/auth/login", data={"username": "viewer_g@example.com", "password": "Passw0rd!"}).json()["access_token"]
    assert client.delete("/api/v1/connectors/google", headers={"Authorization": f"Bearer {vt}"}).status_code == 403
