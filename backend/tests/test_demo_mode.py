import io

import pytest

from app.core.config import settings
from app.core.rate_limit import demo_ip_limiter
from app.models.synced_data import SyncedData
from app.models.user import User
from app.services.demo import DEMO_GUEST_EMAIL, DEMO_OWNER_EMAIL


@pytest.fixture(autouse=True)
def clean_limiter():
    demo_ip_limiter.clear()
    yield
    demo_ip_limiter.clear()


def enter_demo(client):
    res = client.post("/api/v1/auth/demo")
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def password_login(client, email, password):
    return client.post("/api/v1/auth/login", data={"username": email, "password": password})


# --- the sandbox ---

def test_demo_visitor_is_a_read_only_viewer_flagged_as_demo(client):
    me = client.get("/api/v1/auth/me", headers=enter_demo(client)).json()
    assert me["role"] == "viewer" and me["is_demo"] is True and me["email"] == DEMO_GUEST_EMAIL


def test_demo_workspace_comes_with_data_stats_and_insights(client):
    headers = enter_demo(client)
    assert client.get("/api/v1/data/", headers=headers).json()["count"] > 0
    assert client.get("/api/v1/data/profile/latest", headers=headers).status_code == 200
    assert client.get("/api/v1/insights/latest", headers=headers).status_code == 200


def test_demo_visitor_can_chat(client):
    res = client.post("/api/v1/chat/message", headers=enter_demo(client), json={"message": "What is my total revenue?"})
    assert res.status_code == 200 and "$" in res.json()["content"]


@pytest.mark.parametrize("method,path,kwargs", [
    ("post", "/api/v1/connectors/upload", {"files": {"file": ("a.csv", io.BytesIO(b"Date,Amount\n2026-01-01,5\n"), "text/csv")}}),
    ("post", "/api/v1/connectors/sheets/sync", {"json": {"spreadsheet_id": "x", "sheet_name": "y"}}),
    ("post", "/api/v1/insights/generate", {}),
    ("post", "/api/v1/data/profile", {}),
    ("post", "/api/v1/team/invite", {"json": {"email": "x@y.com", "role": "analyst"}}),
    ("post", "/api/v1/connectors/slack", {"json": {"webhook_url": "https://hooks.slack.com/services/T/B/x"}}),
    ("delete", "/api/v1/connectors/google", {}),
])
def test_demo_visitor_cannot_change_anything(client, method, path, kwargs):
    res = getattr(client, method)(path, headers=enter_demo(client), **kwargs)
    assert res.status_code == 403, (path, res.status_code, res.text)


def test_demo_visitor_cannot_sign_in_with_a_password(client):
    enter_demo(client)
    assert password_login(client, DEMO_GUEST_EMAIL, "anything-at-all").status_code == 401


def test_entering_the_demo_twice_reuses_the_workspace(client, db_session):
    enter_demo(client)
    owner = db_session.query(User).filter(User.email == DEMO_OWNER_EMAIL).one()
    rows = db_session.query(SyncedData).filter(SyncedData.user_id == owner.id).count()
    enter_demo(client)
    assert db_session.query(SyncedData).filter(SyncedData.user_id == owner.id).count() == rows
    assert db_session.query(User).filter(User.email == DEMO_GUEST_EMAIL).count() == 1


def test_demo_owner_never_receives_alert_emails(client, db_session):
    enter_demo(client)
    owner = db_session.query(User).filter(User.email == DEMO_OWNER_EMAIL).one()
    assert owner.alert_email_enabled is False


def test_demo_sessions_are_rate_limited_per_address(client):
    for _ in range(30):
        assert client.post("/api/v1/auth/demo").status_code == 200
    blocked = client.post("/api/v1/auth/demo")
    assert blocked.status_code == 429 and "Retry-After" in blocked.headers


# --- production lock-down ---

@pytest.fixture
def production(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "ENABLE_DEMO", "")


def test_demo_is_off_by_default_in_production(client, production):
    res = client.post("/api/v1/auth/demo")
    assert res.status_code == 404


def test_the_published_demo_password_does_not_work_in_production(client, db_session, production):
    # Even if demo@sage.ai already exists from an earlier local seed.
    from app.core.security import hash_password
    owner = db_session.query(User).filter(User.email == DEMO_OWNER_EMAIL).first()
    if owner:
        owner.hashed_password = hash_password("sage_demo_pass")
    else:
        db_session.add(User(email=DEMO_OWNER_EMAIL, hashed_password=hash_password("sage_demo_pass")))
    db_session.commit()
    assert password_login(client, DEMO_OWNER_EMAIL, "sage_demo_pass").status_code == 401


def test_demo_owner_is_not_auto_created_by_a_login_attempt_in_production(client, db_session, production):
    db_session.query(User).filter(User.email == DEMO_OWNER_EMAIL).delete()
    db_session.commit()
    assert password_login(client, DEMO_OWNER_EMAIL, "sage_demo_pass").status_code == 401
    assert db_session.query(User).filter(User.email == DEMO_OWNER_EMAIL).count() == 0


def test_demo_can_be_switched_on_in_production_but_the_owner_password_stays_secret(client, db_session, monkeypatch, production):
    monkeypatch.setattr(settings, "ENABLE_DEMO", "true")
    db_session.query(User).filter(User.email == DEMO_OWNER_EMAIL).delete()
    db_session.commit()
    assert client.get("/api/v1/auth/me", headers=enter_demo(client)).json()["role"] == "viewer"
    assert password_login(client, DEMO_OWNER_EMAIL, "sage_demo_pass").status_code == 401


def test_demo_can_be_switched_off_outside_production(client, monkeypatch):
    monkeypatch.setattr(settings, "ENABLE_DEMO", "false")
    assert client.post("/api/v1/auth/demo").status_code == 404
