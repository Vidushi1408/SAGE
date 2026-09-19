import io
import os
import subprocess
import sys
from datetime import datetime, timedelta
from uuid import uuid4

import pytest

from app.analytics.profiler import run_profiling
from app.core.rate_limit import login_account_limiter, login_ip_limiter
from app.models.chat_history import ChatHistory
from app.models.computed_stat import ComputedStat
from app.models.insight import Insight
from app.models.synced_data import SyncedData
from app.models.user import User
from app.services import alerts
from app.services.sync_service import prune_history

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@pytest.fixture(autouse=True)
def reset_limiters():
    login_account_limiter.clear()
    login_ip_limiter.clear()
    yield
    login_account_limiter.clear()
    login_ip_limiter.clear()


def register(client, email=None, password="ownerpassword"):
    email = email or f"user_{uuid4()}@company.com"
    res = client.post("/api/v1/auth/register", json={"email": email, "password": password})
    return email, res


def login(client, email, password="ownerpassword"):
    return client.post("/api/v1/auth/login", data={"username": email, "password": password})


def owner(client):
    email, _ = register(client)
    tok = login(client, email).json()["access_token"]
    return email, {"Authorization": f"Bearer {tok}"}


def invite_and_accept(client, db_session, owner_h, role="viewer"):
    email = f"{role}_{uuid4()}@company.com"
    client.post("/api/v1/team/invite", headers=owner_h, json={"email": email, "role": role})
    tok = db_session.query(User).filter(User.email == email).first().invite_token
    client.post("/api/v1/team/accept-invite", json={"token": tok, "name": role, "password": "memberpass"})
    h = {"Authorization": "Bearer " + login(client, email, "memberpass").json()["access_token"]}
    return email, h


# ---------- passwords & emails ----------

@pytest.mark.parametrize("pw", ["", "short", "1234567", "        "])
def test_register_rejects_weak_passwords(client, pw):
    _, res = register(client, password=pw)
    assert res.status_code == 422


def test_register_rejects_password_over_bcrypt_limit(client):
    _, res = register(client, password="x" * 73)
    assert res.status_code == 422


def test_reset_and_accept_invite_enforce_password_policy(client, db_session):
    email, headers = owner(client)
    client.post("/api/v1/auth/forgot-password", json={"email": email})
    token = db_session.query(User).filter(User.email == email).first().password_reset_token
    assert client.post("/api/v1/auth/reset-password", json={"token": token, "new_password": "abc"}).status_code == 422

    client.post("/api/v1/team/invite", headers=headers, json={"email": f"m_{uuid4()}@company.com", "role": "viewer"})
    invited = db_session.query(User).filter(User.invite_token.isnot(None)).first()
    res = client.post("/api/v1/team/accept-invite", json={"token": invited.invite_token, "name": "x", "password": "abc"})
    assert res.status_code == 422


def test_emails_are_case_insensitive(client):
    email, _ = register(client, f"MixedCase_{uuid4()}@Company.com")
    assert client.post("/api/v1/auth/register", json={"email": email.upper(), "password": "ownerpassword"}).status_code == 400
    assert login(client, email.upper()).status_code == 200
    assert login(client, "  " + email + "  ").status_code == 200


# ---------- rate limiting & session revocation ----------

def test_login_is_rate_limited_after_repeated_failures(client):
    email, _ = register(client)
    codes = [login(client, email, "wrongpassword").status_code for _ in range(10)]
    assert set(codes) == {401}
    blocked = login(client, email, "wrongpassword")
    assert blocked.status_code == 429 and "Retry-After" in blocked.headers
    # Even the right password is refused while blocked
    assert login(client, email).status_code == 429


def test_successful_login_resets_failure_counter(client):
    email, _ = register(client)
    for _ in range(5):
        login(client, email, "wrongpassword")
    assert login(client, email).status_code == 200
    for _ in range(9):
        assert login(client, email, "wrongpassword").status_code == 401
    assert login(client, email).status_code == 200


def test_password_reset_invalidates_existing_sessions(client, db_session):
    email, headers = owner(client)
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 200

    client.post("/api/v1/auth/forgot-password", json={"email": email})
    token = db_session.query(User).filter(User.email == email).first().password_reset_token
    assert client.post("/api/v1/auth/reset-password", json={"token": token, "new_password": "brandnewpass1"}).status_code == 200

    assert client.get("/api/v1/auth/me", headers=headers).status_code == 401
    new_tok = login(client, email, "brandnewpass1").json()["access_token"]
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {new_tok}"}).status_code == 200


# ---------- invites ----------

def test_resend_invite_after_expiry_then_accept(client, db_session):
    _, owner_h = owner(client)
    email = f"late_{uuid4()}@company.com"
    client.post("/api/v1/team/invite", headers=owner_h, json={"email": email, "role": "analyst"})
    member = db_session.query(User).filter(User.email == email).first()
    member.invite_token_expires_at = datetime.utcnow() - timedelta(hours=1)
    db_session.commit()
    old_token = member.invite_token
    assert client.post("/api/v1/team/accept-invite", json={"token": old_token, "name": "x", "password": "memberpass"}).status_code == 400

    res = client.post(f"/api/v1/team/{member.id}/resend-invite", headers=owner_h)
    assert res.status_code == 200
    db_session.refresh(member)
    assert member.invite_token != old_token and member.invite_token_expires_at > datetime.utcnow()
    assert client.post("/api/v1/team/accept-invite", json={"token": member.invite_token, "name": "x", "password": "memberpass"}).status_code == 200


def test_reinviting_a_pending_member_resends_instead_of_erroring(client, db_session):
    _, owner_h = owner(client)
    email = f"again_{uuid4()}@company.com"
    first = client.post("/api/v1/team/invite", headers=owner_h, json={"email": email, "role": "viewer"})
    second = client.post("/api/v1/team/invite", headers=owner_h, json={"email": email.upper(), "role": "analyst"})
    assert second.status_code == 201
    assert second.json()["id"] == first.json()["id"] and second.json()["role"] == "analyst"


def test_resend_invite_guards(client, db_session):
    _, owner_h = owner(client)
    member_email, member_h = invite_and_accept(client, db_session, owner_h, "analyst")
    member = db_session.query(User).filter(User.email == member_email).first()
    assert client.post(f"/api/v1/team/{member.id}/resend-invite", headers=owner_h).status_code == 400  # already active
    assert client.post(f"/api/v1/team/{member.id}/resend-invite", headers=member_h).status_code == 403  # not admin
    _, other_h = owner(client)
    assert client.post(f"/api/v1/team/{member.id}/resend-invite", headers=other_h).status_code == 404  # other tenant


# ---------- sync semantics ----------

def _connect_and_sync(client, headers, sheet="Sales"):
    url = client.get("/api/v1/connectors/google/login", headers=headers).json()["url"]
    client.get(url, follow_redirects=False)
    return client.post("/api/v1/connectors/sheets/sync", params={"spreadsheet_id": "mock_sheet_sales_1", "sheet_name": sheet}, headers=headers)


def test_syncing_another_worksheet_replaces_rather_than_adds(client):
    _, headers = owner(client)
    _connect_and_sync(client, headers, "Sales")
    _connect_and_sync(client, headers, "Expenses")
    assert client.get("/api/v1/data/", headers=headers).json()["count"] == 150


def test_worksheet_sync_keeps_uploaded_file_rows(client):
    _, headers = owner(client)
    csv = b"Date,Amount\n2026-01-01,5\n2026-01-02,6\n"
    client.post("/api/v1/connectors/upload", headers=headers, files={"file": ("u.csv", io.BytesIO(csv), "text/csv")})
    _connect_and_sync(client, headers, "Sales")
    _connect_and_sync(client, headers, "Expenses")
    assert client.get("/api/v1/data/", headers=headers).json()["count"] == 152


def test_prune_history_keeps_newest_only(db_session):
    user = User(email=f"p_{uuid4()}@company.com", hashed_password="x")
    db_session.add(user)
    db_session.commit()
    for i in range(5):
        db_session.add(Insight(user_id=user.id, insight_data={"n": i}, created_at=datetime.utcnow() + timedelta(seconds=i)))
        db_session.add(ComputedStat(user_id=user.id, metrics={"n": i}, created_at=datetime.utcnow() + timedelta(seconds=i)))
    db_session.commit()

    prune_history(db_session, user.id, keep=2)

    kept = db_session.query(Insight).filter(Insight.user_id == user.id).order_by(Insight.created_at).all()
    assert [i.insight_data["n"] for i in kept] == [3, 4]
    assert db_session.query(ComputedStat).filter(ComputedStat.user_id == user.id).count() == 2


# ---------- alerts are idempotent ----------

def _anom(tx, amount=950.0):
    return {"transaction_id": tx, "date": "2026-06-01", "amount": amount, "z_score": 5.0, "reason": "High value outlier order"}


def test_alerts_only_fire_for_new_anomalies(db_session, monkeypatch):
    owner_user = User(email=f"alert_{uuid4()}@company.com", hashed_password="x", role="admin")
    db_session.add(owner_user)
    db_session.commit()
    sent = []
    monkeypatch.setattr(alerts.EmailService, "send", staticmethod(lambda to, subject, html: sent.append(subject) or True))
    payload = {"recommendation": "Look at <b>this</b>"}

    stats = {"anomalies": [_anom("TX_1")]}
    alerts.dispatch_alerts(db_session, owner_user.id, payload, stats)
    assert len(sent) == 1 and "1 new anomaly" in sent[0]

    alerts.dispatch_alerts(db_session, owner_user.id, payload, stats)          # same data again (scheduler tick)
    assert len(sent) == 1

    stats2 = {"anomalies": [_anom("TX_1"), _anom("TX_2", -150.0)]}
    alerts.dispatch_alerts(db_session, owner_user.id, payload, stats2)         # one genuinely new anomaly
    assert len(sent) == 2 and "1 new anomaly" in sent[1] and "2 total" in sent[1]


def test_alert_email_escapes_html(db_session, monkeypatch):
    owner_user = User(email=f"esc_{uuid4()}@company.com", hashed_password="x", role="admin")
    db_session.add(owner_user)
    db_session.commit()
    bodies = []
    monkeypatch.setattr(alerts.EmailService, "send", staticmethod(lambda to, subject, html: bodies.append(html) or True))
    alerts.dispatch_alerts(db_session, owner_user.id, {"recommendation": "<script>x</script>"},
                           {"anomalies": [{**_anom("TX_9"), "reason": "<img src=x onerror=1>"}]})
    assert "<script>" not in bodies[0] and "<img" not in bodies[0]


# ---------- anomaly quality ----------

def test_ordinary_weekend_sales_are_not_flagged_as_outliers():
    uid, aid = uuid4(), uuid4()
    rows = []
    for day in range(1, 29):
        weekend = datetime(2026, 2, day).weekday() >= 5
        for i, v in enumerate((22.0, 24.0, 26.0) if weekend else (9.0, 10.0, 12.0)):
            rows.append(SyncedData(id=uuid4(), user_id=uid, connected_account_id=aid, source="x",
                                   external_id=f"{day}-{i}", raw_payload={"Date": f"2026-02-{day:02d}", "Amount": v, "Transaction ID": f"T{day}{i}"}))
    rows.append(SyncedData(id=uuid4(), user_id=uid, connected_account_id=aid, source="x", external_id="big",
                           raw_payload={"Date": "2026-02-10", "Amount": 950.0, "Transaction ID": "BIG"}))
    anomalies = run_profiling(rows)["anomalies"]
    assert [a["transaction_id"] for a in anomalies] == ["BIG"]


# ---------- chat ----------

def test_chat_history_is_private_per_user(client, db_session):
    _, owner_h = owner(client)
    _connect_and_sync(client, owner_h)
    client.post("/api/v1/data/profile", headers=owner_h)
    _, viewer_h = invite_and_accept(client, db_session, owner_h, "viewer")

    client.post("/api/v1/chat/message", headers=owner_h, json={"message": "secret owner question"})
    client.post("/api/v1/chat/message", headers=viewer_h, json={"message": "viewer question"})

    owner_hist = " ".join(t["content"] for t in client.get("/api/v1/chat/history", headers=owner_h).json()["history"])
    viewer_hist = " ".join(t["content"] for t in client.get("/api/v1/chat/history", headers=viewer_h).json()["history"])
    assert "secret owner question" in owner_hist and "viewer question" not in owner_hist
    assert "viewer question" in viewer_hist and "secret owner question" not in viewer_hist


@pytest.mark.parametrize("message", ["", "   ", "x" * 2001])
def test_chat_rejects_blank_or_oversized_messages(client, message):
    _, headers = owner(client)
    assert client.post("/api/v1/chat/message", headers=headers, json={"message": message}).status_code == 422


# ---------- production config ----------

def _run_app_import(env):
    full_env = {**os.environ, **env}
    return subprocess.run(
        [sys.executable, "-c", "from app.main import app; print('DOCS=' + str(app.docs_url))"],
        cwd=BACKEND_DIR, env=full_env, capture_output=True, text=True, timeout=60,
    )


def test_production_refuses_default_secret_key():
    res = _run_app_import({"ENVIRONMENT": "production", "SECRET_KEY": "super_secret_key_change_me_in_production_1234567890"})
    assert res.returncode != 0 and "SECRET_KEY" in res.stderr


def test_production_hides_api_docs():
    res = _run_app_import({"ENVIRONMENT": "production", "SECRET_KEY": "a-real-strong-secret-value-1234567890"})
    assert res.returncode == 0 and "DOCS=None" in res.stdout


def test_development_keeps_api_docs():
    res = _run_app_import({"ENVIRONMENT": "development"})
    assert res.returncode == 0 and "DOCS=/docs" in res.stdout
