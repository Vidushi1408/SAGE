import pytest
from datetime import datetime, timedelta
from uuid import uuid4

from app.models.user import User


def register_and_login(client, email, password="ownerpassword"):
    client.post("/api/v1/auth/register", json={"email": email, "password": password})
    login = client.post("/api/v1/auth/login", data={"username": email, "password": password})
    return login.json()["access_token"]


def test_forgot_password_always_returns_success(client, monkeypatch):
    """Forgot-password should return 200 regardless of whether the email exists (avoid enumeration)."""
    sent = {}

    def fake_send(to, subject, html):
        sent["to"] = to
        sent["subject"] = subject
        return True

    monkeypatch.setattr("app.api.v1.auth.EmailService.send", staticmethod(fake_send))

    email = f"owner_{uuid4()}@company.com"
    register_and_login(client, email)

    res_known = client.post("/api/v1/auth/forgot-password", json={"email": email})
    assert res_known.status_code == 200
    assert sent["to"] == email

    res_unknown = client.post("/api/v1/auth/forgot-password", json={"email": "nobody@nowhere.com"})
    assert res_unknown.status_code == 200


def test_reset_password_with_valid_token(client, db_session, monkeypatch):
    monkeypatch.setattr("app.api.v1.auth.EmailService.send", staticmethod(lambda to, subject, html: True))

    email = f"owner_{uuid4()}@company.com"
    register_and_login(client, email)

    client.post("/api/v1/auth/forgot-password", json={"email": email})

    user = db_session.query(User).filter(User.email == email).first()
    assert user.password_reset_token is not None

    reset_res = client.post(
        "/api/v1/auth/reset-password",
        json={"token": user.password_reset_token, "new_password": "brandnewpassword"}
    )
    assert reset_res.status_code == 200

    # Old password should no longer work; new one should
    old_login = client.post("/api/v1/auth/login", data={"username": email, "password": "ownerpassword"})
    assert old_login.status_code == 401

    new_login = client.post("/api/v1/auth/login", data={"username": email, "password": "brandnewpassword"})
    assert new_login.status_code == 200


def test_reset_password_rejects_expired_token(client, db_session, monkeypatch):
    monkeypatch.setattr("app.api.v1.auth.EmailService.send", staticmethod(lambda to, subject, html: True))

    email = f"owner_{uuid4()}@company.com"
    register_and_login(client, email)
    client.post("/api/v1/auth/forgot-password", json={"email": email})

    user = db_session.query(User).filter(User.email == email).first()
    user.password_reset_expires_at = datetime.utcnow() - timedelta(minutes=1)
    db_session.commit()

    reset_res = client.post(
        "/api/v1/auth/reset-password",
        json={"token": user.password_reset_token, "new_password": "brandnewpassword"}
    )
    assert reset_res.status_code == 400


def test_reset_password_rejects_invalid_token(client):
    reset_res = client.post(
        "/api/v1/auth/reset-password",
        json={"token": "not-a-real-token", "new_password": "brandnewpassword"}
    )
    assert reset_res.status_code == 400
