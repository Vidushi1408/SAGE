import pytest
from datetime import datetime, timedelta
from uuid import uuid4

from app.models.user import User


def register_and_login(client, email, password="ownerpassword"):
    client.post("/api/v1/auth/register", json={"email": email, "password": password})
    login = client.post("/api/v1/auth/login", data={"username": email, "password": password})
    return login.json()["access_token"]


def test_invite_sends_email_and_creates_inactive_user(client, db_session, monkeypatch):
    sent = {}
    monkeypatch.setattr(
        "app.api.v1.team.EmailService.send",
        staticmethod(lambda to, subject, html: sent.update(to=to, subject=subject) or True)
    )

    owner_email = f"owner_{uuid4()}@company.com"
    token = register_and_login(client, owner_email)
    headers = {"Authorization": f"Bearer {token}"}

    member_email = f"member_{uuid4()}@company.com"
    invite_res = client.post(
        "/api/v1/team/invite",
        headers=headers,
        json={"email": member_email, "name": "New Member", "role": "viewer"}
    )
    assert invite_res.status_code == 201
    assert invite_res.json()["is_active"] is False
    assert sent["to"] == member_email

    invited_user = db_session.query(User).filter(User.email == member_email).first()
    assert invited_user.invite_token is not None
    assert invited_user.invite_token_expires_at > datetime.utcnow()

    # Cannot log in before accepting the invite
    blocked_login = client.post(
        "/api/v1/auth/login",
        data={"username": member_email, "password": "whatever"}
    )
    assert blocked_login.status_code in (401, 403)


def test_accept_invite_activates_account(client, db_session, monkeypatch):
    monkeypatch.setattr("app.api.v1.team.EmailService.send", staticmethod(lambda to, subject, html: True))

    owner_email = f"owner_{uuid4()}@company.com"
    token = register_and_login(client, owner_email)
    headers = {"Authorization": f"Bearer {token}"}

    member_email = f"member_{uuid4()}@company.com"
    client.post(
        "/api/v1/team/invite",
        headers=headers,
        json={"email": member_email, "role": "viewer"}
    )
    invited_user = db_session.query(User).filter(User.email == member_email).first()

    accept_res = client.post(
        "/api/v1/team/accept-invite",
        json={"token": invited_user.invite_token, "name": "Accepted Member", "password": "mynewpassword"}
    )
    assert accept_res.status_code == 200
    assert accept_res.json()["is_active"] is True

    login_res = client.post(
        "/api/v1/auth/login",
        data={"username": member_email, "password": "mynewpassword"}
    )
    assert login_res.status_code == 200


def test_accept_invite_rejects_expired_token(client, db_session, monkeypatch):
    monkeypatch.setattr("app.api.v1.team.EmailService.send", staticmethod(lambda to, subject, html: True))

    owner_email = f"owner_{uuid4()}@company.com"
    token = register_and_login(client, owner_email)
    headers = {"Authorization": f"Bearer {token}"}

    member_email = f"member_{uuid4()}@company.com"
    client.post("/api/v1/team/invite", headers=headers, json={"email": member_email, "role": "viewer"})

    invited_user = db_session.query(User).filter(User.email == member_email).first()
    invited_user.invite_token_expires_at = datetime.utcnow() - timedelta(hours=1)
    db_session.commit()

    accept_res = client.post(
        "/api/v1/team/accept-invite",
        json={"token": invited_user.invite_token, "name": "Too Late", "password": "mynewpassword"}
    )
    assert accept_res.status_code == 400
