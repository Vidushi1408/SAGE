import io
import json
import zipfile
from uuid import UUID

import pytest

from app.core.rate_limit import login_account_limiter
from app.models.chat_history import ChatHistory
from app.models.computed_stat import ComputedStat
from app.models.connected_account import ConnectedAccount
from app.models.insight import Insight
from app.models.synced_data import SyncedData
from app.models.user import User
from app.services import google_sheets
from tests.test_access_control import add_member, make_owner

CSV = b"Date,Amount,Category\n2026-01-01,10,Coffee\n2026-01-02,20,=HYPERLINK(\"http://evil\")\n2026-01-03,-5,-Refund\n"


@pytest.fixture(autouse=True)
def fresh_limiter():
    login_account_limiter.clear()
    yield
    login_account_limiter.clear()


def populate(client, headers):
    client.post("/api/v1/connectors/upload", headers=headers, files={"file": ("sales.csv", io.BytesIO(CSV), "text/csv")})
    client.post("/api/v1/data/profile", headers=headers)
    client.post("/api/v1/insights/generate", headers=headers)
    client.post("/api/v1/chat/message", headers=headers, json={"message": "total revenue?"})


def owner_id(db, email):
    return db.query(User).filter(User.email == email).one().id


def workspace_rows(db, uid):
    return {m.__name__: db.query(m).filter(m.user_id == uid).count()
            for m in (SyncedData, ComputedStat, Insight, ConnectedAccount, ChatHistory)}


def delete(client, headers, password="ownerpassword"):
    return client.request("DELETE", "/api/v1/auth/me", headers=headers, json={"password": password})


# --- deleting an account ---

def test_wrong_password_deletes_nothing(client, db_session):
    email, headers = make_owner(client)
    res = delete(client, headers, "not-my-password")
    assert res.status_code == 400
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 200


def test_deleting_an_owner_removes_the_whole_workspace(client, db_session):
    email, headers = make_owner(client)
    populate(client, headers)
    uid = owner_id(db_session, email)
    member_email, _ = add_member(client, db_session, headers, "analyst")
    viewer_email, viewer_headers = add_member(client, db_session, headers, "viewer")
    client.post("/api/v1/chat/message", headers=viewer_headers, json={"message": "hi"})
    assert all(v > 0 for k, v in workspace_rows(db_session, uid).items() if k != "ConnectedAccount")

    assert delete(client, headers).json() == {"status": "deleted"}
    db_session.expire_all()

    assert db_session.query(User).filter(User.email.in_([email, member_email, viewer_email])).count() == 0
    assert sum(workspace_rows(db_session, uid).values()) == 0
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 401
    assert client.get("/api/v1/auth/me", headers=viewer_headers).status_code == 401


def test_a_teammate_leaving_does_not_touch_the_workspace(client, db_session):
    email, owner_h = make_owner(client)
    populate(client, owner_h)
    uid = owner_id(db_session, email)
    before = workspace_rows(db_session, uid)
    member_email, member_h = add_member(client, db_session, owner_h, "analyst")
    client.post("/api/v1/chat/message", headers=member_h, json={"message": "hello"})
    before["ChatHistory"] = db_session.query(ChatHistory).filter(ChatHistory.user_id == uid).count()

    assert delete(client, member_h, "memberpass").status_code == 200
    db_session.expire_all()

    assert db_session.query(User).filter(User.email == member_email).count() == 0
    assert workspace_rows(db_session, uid) == before
    assert client.get("/api/v1/auth/me", headers=owner_h).status_code == 200


def test_deleting_an_owner_revokes_their_google_access(client, db_session, monkeypatch):
    email, headers = make_owner(client)
    db_session.add(ConnectedAccount(user_id=owner_id(db_session, email), service="google_sheets",
                                    access_token="a", refresh_token="r", account_metadata={}))
    db_session.commit()
    revoked = []
    monkeypatch.setattr(google_sheets, "revoke_access", lambda account: revoked.append(account.service))
    assert delete(client, headers).status_code == 200
    assert revoked == ["google_sheets"]


def test_repeated_wrong_passwords_are_throttled(client):
    _, headers = make_owner(client)
    codes = [delete(client, headers, "nope").status_code for _ in range(11)]
    assert codes[:10] == [400] * 10 and codes[10] == 429
    assert delete(client, headers).status_code == 429  # even the right password waits out the lock


def test_deletion_needs_a_signed_in_user_and_a_body(client):
    assert client.request("DELETE", "/api/v1/auth/me", json={"password": "x"}).status_code == 401
    _, headers = make_owner(client)
    assert client.request("DELETE", "/api/v1/auth/me", headers=headers).status_code == 422


def test_the_demo_visitor_cannot_delete_anything(client):
    token = client.post("/api/v1/auth/demo").json()["access_token"]
    res = delete(client, {"Authorization": f"Bearer {token}"}, "whatever")
    assert res.status_code == 403
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 200


# --- exporting data ---

def export(client, headers):
    res = client.get("/api/v1/data/export", headers=headers)
    assert res.status_code == 200, res.text
    assert res.headers["content-type"] == "application/zip"
    assert "attachment" in res.headers["content-disposition"]
    return zipfile.ZipFile(io.BytesIO(res.content))


def test_export_contains_the_workspace_in_open_formats(client, db_session):
    email, headers = make_owner(client)
    populate(client, headers)
    archive = export(client, headers)
    assert set(archive.namelist()) == {"README.txt", "account.json", "transactions.csv", "stats.json",
                                       "insights.json", "chat_history.json", "team.json"}
    assert json.loads(archive.read("account.json"))["email"] == email
    assert json.loads(archive.read("stats.json"))["summary"]["total_transactions"] == 3
    assert len(json.loads(archive.read("insights.json"))) >= 1
    chat = json.loads(archive.read("chat_history.json"))
    assert [m["role"] for m in chat] == ["user", "assistant"]
    rows = archive.read("transactions.csv").decode().splitlines()
    assert rows[0].startswith("Date,Amount,Category") and len(rows) == 4


def test_export_neutralises_spreadsheet_formulas(client):
    _, headers = make_owner(client)
    populate(client, headers)
    text = export(client, headers).read("transactions.csv").decode()
    assert "'=HYPERLINK" in text and ",=HYPERLINK" not in text
    assert "'-Refund" in text
    assert ",-5," in text  # a genuine negative number is left alone


def test_export_never_includes_credentials_or_tokens(client, db_session):
    email, headers = make_owner(client)
    populate(client, headers)
    uid = owner_id(db_session, email)
    db_session.add(ConnectedAccount(user_id=uid, service="google_sheets", access_token="SECRET-ACCESS-TOKEN",
                                    refresh_token="SECRET-REFRESH-TOKEN", account_metadata={"webhook_url": "https://hooks.slack.com/services/T/B/SECRET-HOOK"}))
    db_session.commit()
    add_member(client, db_session, headers, "analyst")
    user = db_session.query(User).filter(User.id == uid).one()
    everything = b"".join(export(client, headers).read(n) for n in export(client, headers).namelist()).decode()
    for secret in ("SECRET-ACCESS-TOKEN", "SECRET-REFRESH-TOKEN", "SECRET-HOOK", user.hashed_password, "invite_token", "hashed_password"):
        assert secret not in everything


def test_member_export_has_workspace_data_but_no_team_list_and_only_their_own_chat(client, db_session):
    _, owner_h = make_owner(client)
    populate(client, owner_h)
    _, member_h = add_member(client, db_session, owner_h, "viewer")
    client.post("/api/v1/chat/message", headers=member_h, json={"message": "member question"})
    archive = export(client, member_h)
    assert "team.json" not in archive.namelist()
    assert len(archive.read("transactions.csv").decode().splitlines()) == 4
    chat = json.loads(archive.read("chat_history.json"))
    assert [m["content"] for m in chat if m["role"] == "user"] == ["member question"]


def test_team_list_in_admin_export_has_no_secrets(client, db_session):
    email, headers = make_owner(client)
    member_email, _ = add_member(client, db_session, headers, "analyst")
    team = json.loads(export(client, headers).read("team.json"))
    assert {m["email"] for m in team} == {email, member_email}
    assert all(set(m) == {"email", "name", "role", "is_active", "created_at"} for m in team)


def test_export_of_an_empty_workspace_still_works(client):
    _, headers = make_owner(client)
    archive = export(client, headers)
    assert json.loads(archive.read("stats.json")) == {}
    assert archive.read("transactions.csv").decode().strip() == "_source,_synced_at"


def test_export_requires_sign_in_and_is_closed_to_the_demo_visitor(client):
    assert client.get("/api/v1/data/export").status_code == 401
    token = client.post("/api/v1/auth/demo").json()["access_token"]
    assert client.get("/api/v1/data/export", headers={"Authorization": f"Bearer {token}"}).status_code == 403
