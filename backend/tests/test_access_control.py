import io
import json
import urllib.parse
from datetime import timedelta
from uuid import uuid4

import pytest

from app.core.security import create_access_token, create_oauth_state
from app.models.user import User


def make_owner(client):
    email = f"owner_{uuid4()}@company.com"
    client.post("/api/v1/auth/register", json={"email": email, "password": "ownerpassword"})
    tok = client.post("/api/v1/auth/login", data={"username": email, "password": "ownerpassword"}).json()["access_token"]
    return email, {"Authorization": f"Bearer {tok}"}


def add_member(client, db_session, owner_headers, role):
    email = f"{role}_{uuid4()}@company.com"
    client.post("/api/v1/team/invite", headers=owner_headers, json={"email": email, "role": role})
    invited = db_session.query(User).filter(User.email == email).first()
    client.post("/api/v1/team/accept-invite", json={"token": invited.invite_token, "name": role, "password": "memberpass"})
    tok = client.post("/api/v1/auth/login", data={"username": email, "password": "memberpass"}).json()["access_token"]
    return email, {"Authorization": f"Bearer {tok}"}


def connect_google_mock(client, headers):
    url = client.get("/api/v1/connectors/google/login", headers=headers).json()["url"]
    return client.get(url, follow_redirects=False)


CSV = b"Date,Amount,Category\n2026-01-01,10,A\n2026-01-02,20,B\n"


# --- OAuth state signing ---

def test_callback_rejects_unsigned_state(client):
    forged = urllib.parse.quote(json.dumps({"user_id": str(uuid4())}))
    res = client.get(f"/api/v1/connectors/google/callback?state={forged}&code=mock_code", follow_redirects=False)
    assert res.status_code == 400


def test_callback_rejects_non_uuid_state_without_500(client):
    res = client.get("/api/v1/connectors/google/callback?state=%7B%22user_id%22%3A%22nope%22%7D&code=mock_code", follow_redirects=False)
    assert res.status_code == 400


def test_callback_rejects_access_token_used_as_state(client):
    email, headers = make_owner(client)
    access = headers["Authorization"].split(" ")[1]
    res = client.get(f"/api/v1/connectors/google/callback?state={access}&code=mock_code", follow_redirects=False)
    assert res.status_code == 400


def test_callback_rejects_expired_state(client):
    expired = create_oauth_state(uuid4(), minutes=-1)
    res = client.get(f"/api/v1/connectors/google/callback?state={expired}&code=mock_code", follow_redirects=False)
    assert res.status_code == 400


def test_teammate_google_connect_belongs_to_workspace_owner(client, db_session):
    _, owner_h = make_owner(client)
    _, analyst_h = add_member(client, db_session, owner_h, "analyst")

    res = connect_google_mock(client, analyst_h)
    assert res.status_code in (302, 307)

    # Both the teammate and the owner see the connection (it is stored under the owner).
    assert client.get("/api/v1/connectors/sheets", headers=analyst_h).status_code == 200
    assert client.get("/api/v1/connectors/sheets", headers=owner_h).status_code == 200


# --- Role enforcement ---

def test_viewer_cannot_write(client, db_session):
    _, owner_h = make_owner(client)
    connect_google_mock(client, owner_h)
    client.post("/api/v1/connectors/sheets/sync", params={"spreadsheet_id": "mock_sheet_sales_1", "sheet_name": "Sales"}, headers=owner_h)
    client.post("/api/v1/data/profile", headers=owner_h)
    _, viewer_h = add_member(client, db_session, owner_h, "viewer")

    assert client.get("/api/v1/connectors/google/login", headers=viewer_h).status_code == 403
    assert client.post("/api/v1/connectors/sheets/sync", params={"spreadsheet_id": "mock_sheet_sales_1", "sheet_name": "Sales"}, headers=viewer_h).status_code == 403
    assert client.post("/api/v1/data/profile", headers=viewer_h).status_code == 403
    assert client.post("/api/v1/insights/generate", headers=viewer_h).status_code == 403
    upload = client.post("/api/v1/connectors/upload", headers=viewer_h, files={"file": ("a.csv", io.BytesIO(CSV), "text/csv")})
    assert upload.status_code == 403


def test_viewer_can_still_read_and_chat(client, db_session):
    _, owner_h = make_owner(client)
    connect_google_mock(client, owner_h)
    client.post("/api/v1/connectors/sheets/sync", params={"spreadsheet_id": "mock_sheet_sales_1", "sheet_name": "Sales"}, headers=owner_h)
    client.post("/api/v1/data/profile", headers=owner_h)
    client.post("/api/v1/insights/generate", headers=owner_h)
    _, viewer_h = add_member(client, db_session, owner_h, "viewer")

    assert client.get("/api/v1/data/profile/latest", headers=viewer_h).status_code == 200
    assert client.get("/api/v1/insights/latest", headers=viewer_h).status_code == 200
    assert client.get("/api/v1/insights/history", headers=viewer_h).status_code == 200
    assert client.post("/api/v1/chat/message", headers=viewer_h, json={"message": "revenue?"}).status_code == 200


def test_analyst_can_write(client, db_session):
    _, owner_h = make_owner(client)
    _, analyst_h = add_member(client, db_session, owner_h, "analyst")
    upload = client.post("/api/v1/connectors/upload", headers=analyst_h, files={"file": ("a.csv", io.BytesIO(CSV), "text/csv")})
    assert upload.status_code == 200
    assert client.post("/api/v1/data/profile", headers=analyst_h).status_code == 201


# --- Slack webhook hardening ---

@pytest.mark.parametrize("url", [
    "http://hooks.slack.com/services/T/B/X",
    "https://evil.example.com/hook",
    "http://127.0.0.1:9/hook",
    "https://169.254.169.254/latest/meta-data",
])
def test_slack_rejects_non_slack_or_insecure_urls(client, url):
    _, headers = make_owner(client)
    assert client.post("/api/v1/connectors/slack", headers=headers, json={"webhook_url": url}).status_code == 422


def test_slack_webhook_url_visible_to_admin_only(client, db_session):
    _, owner_h = make_owner(client)
    client.post("/api/v1/connectors/slack", headers=owner_h, json={"webhook_url": "https://hooks.slack.com/services/T000/B000/XXXX"})
    _, analyst_h = add_member(client, db_session, owner_h, "analyst")

    admin_view = client.get("/api/v1/connectors/slack", headers=owner_h).json()
    member_view = client.get("/api/v1/connectors/slack", headers=analyst_h).json()
    assert admin_view["connected"] is True and "hooks.slack.com" in admin_view["webhook_url"]
    assert member_view["connected"] is True and "webhook_url" not in member_view


# --- Dead sessions ---

def test_token_for_removed_user_is_401(client):
    ghost = create_access_token(str(uuid4()))
    res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {ghost}"})
    assert res.status_code == 401


def test_removed_member_token_is_401(client, db_session):
    _, owner_h = make_owner(client)
    email, member_h = add_member(client, db_session, owner_h, "viewer")
    member = db_session.query(User).filter(User.email == email).first()
    client.delete(f"/api/v1/team/{member.id}", headers=owner_h)
    assert client.get("/api/v1/auth/me", headers=member_h).status_code == 401
