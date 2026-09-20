import pytest
from uuid import uuid4

from app.models.connected_account import ConnectedAccount


def get_auth_headers(client):
    login_response = client.post(
        "/api/v1/auth/login",
        data={"username": "demo@sage.ai", "password": "sage_demo_pass"}
    )
    token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_connect_slack_webhook(client, db_session):
    headers = get_auth_headers(client)

    status_before = client.get("/api/v1/connectors/slack", headers=headers)
    assert status_before.status_code == 200
    assert status_before.json()["connected"] is False

    connect_res = client.post(
        "/api/v1/connectors/slack",
        headers=headers,
        json={"webhook_url": "https://hooks.slack.com/services/T000/B000/XXXX"}
    )
    assert connect_res.status_code == 200
    assert connect_res.json()["connected"] is True

    status_after = client.get("/api/v1/connectors/slack", headers=headers)
    assert status_after.json()["connected"] is True
    assert status_after.json()["webhook_url"].startswith("https://hooks.slack.com/")


def test_disconnect_slack_webhook(client):
    headers = get_auth_headers(client)
    client.post(
        "/api/v1/connectors/slack",
        headers=headers,
        json={"webhook_url": "https://hooks.slack.com/services/T000/B000/XXXX"}
    )

    disconnect_res = client.delete("/api/v1/connectors/slack", headers=headers)
    assert disconnect_res.status_code == 200
    assert disconnect_res.json()["connected"] is False

    status_res = client.get("/api/v1/connectors/slack", headers=headers)
    assert status_res.json()["connected"] is False


def test_dispatch_alerts_posts_to_slack_webhook(client, db_session, monkeypatch):
    """Verify that generating insights with anomalies posts a Slack alert when a webhook is connected."""
    posted = {}

    def fake_post(url, json=None, timeout=None):
        posted["url"] = url
        posted["json"] = json

        class FakeResponse:
            def raise_for_status(self):
                pass
        return FakeResponse()

    monkeypatch.setattr("app.services.slack.httpx.post", fake_post)

    headers = get_auth_headers(client)
    # The shared demo user may already have been alerted about these anomalies by earlier runs.
    from app.models.user import User
    db_session.query(User).filter(User.email == "demo@sage.ai").update({"last_alerted_anomalies": []})
    db_session.flush()
    client.post(
        "/api/v1/connectors/slack",
        headers=headers,
        json={"webhook_url": "https://hooks.slack.com/services/T000/B000/XXXX"}
    )

    # Seed mock data (includes seeded anomalies) and generate insights
    login_res = client.get("/api/v1/connectors/google/login", headers=headers)
    from urllib.parse import urlparse, parse_qs
    state = parse_qs(urlparse(login_res.json()["url"]).query)["state"][0]
    client.get(f"/api/v1/connectors/google/callback?state={state}&code=mock_code")
    client.post("/api/v1/connectors/sheets/sync?spreadsheet_id=mock_sheet_sales_1&sheet_name=Sales", headers=headers)
    client.post("/api/v1/data/profile", headers=headers)

    gen_res = client.post("/api/v1/insights/generate", headers=headers)
    assert gen_res.status_code == 201

    assert posted.get("url") == "https://hooks.slack.com/services/T000/B000/XXXX"
    assert "blocks" in posted["json"]
