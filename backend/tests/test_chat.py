import pytest

from app.services.chat import ChatService
from app.services.chat_tools import ChatTools

COMPUTED_STATS = {
    "summary": {"total_revenue": 5000.0, "total_transactions": 50, "avg_transaction_value": 100.0},
    "period_metrics": {
        "daily": [
            {"date": "2026-05-11", "revenue": 300.0, "transactions": 3, "growth_pct": None},
            {"date": "2026-05-12", "revenue": 150.0, "transactions": 2, "growth_pct": -50.0}
        ],
        "monthly": [{"month": "2026-05", "revenue": 2000.0, "transactions": 20, "growth_pct": None}],
        "weekly": [{"week": "2026-W22", "revenue": 1000.0, "transactions": 10, "growth_pct": 5.0}]
    },
    "category_metrics": {
        "top_categories": [{"category": "Beans", "revenue": 3000.0, "volume": 30, "share_pct": 60.0}],
        "bottom_categories": []
    },
    "anomalies": [{"transaction_id": "TX_1", "amount": 950.0, "date": "2026-05-01", "reason": "High value outlier order", "z_score": 3.1}],
    "correlations": {}
}


def get_auth_headers(client):
    login_response = client.post(
        "/api/v1/auth/login",
        data={"username": "demo@sage.ai", "password": "sage_demo_pass"}
    )
    token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def sync_and_profile(client, headers):
    from urllib.parse import urlparse, parse_qs
    login_res = client.get("/api/v1/connectors/google/login", headers=headers)
    state = parse_qs(urlparse(login_res.json()["url"]).query)["state"][0]
    client.get(f"/api/v1/connectors/google/callback?state={state}&code=mock_code")
    client.post("/api/v1/connectors/sheets/sync?spreadsheet_id=mock_sheet_sales_1&sheet_name=Sales", headers=headers)
    client.post("/api/v1/data/profile", headers=headers)


# --- Unit tests for the tool layer ---

def test_chat_tools_get_summary():
    tools = ChatTools(COMPUTED_STATS)
    assert tools.get_summary()["total_revenue"] == 5000.0


def test_chat_tools_list_anomalies_with_filter():
    tools = ChatTools(COMPUTED_STATS)
    assert len(tools.list_anomalies()) == 1
    assert len(tools.list_anomalies(min_amount=2000)) == 0


def test_chat_tools_compare_periods_missing_period():
    tools = ChatTools(COMPUTED_STATS)
    result = tools.compare_periods("monthly", "2026-05", "1999-01")
    assert "error" in result


def test_chat_tools_get_metrics_for_date_found():
    tools = ChatTools(COMPUTED_STATS)
    result = tools.get_metrics_for_date("2026-05-12")
    assert result["revenue"] == 150.0
    assert result["growth_pct"] == -50.0


def test_chat_tools_get_metrics_for_date_not_found():
    tools = ChatTools(COMPUTED_STATS)
    result = tools.get_metrics_for_date("1999-01-01")
    assert "error" in result


def test_chat_tools_compare_daily_periods():
    tools = ChatTools(COMPUTED_STATS)
    result = tools.compare_periods("daily", "2026-05-11", "2026-05-12")
    assert result["revenue_change_pct"] == 100.0


# --- Mock-mode ChatService (no ANTHROPIC_API_KEY configured in test env) ---

def test_chat_service_mock_mode_category_question():
    result = ChatService.respond(COMPUTED_STATS, "What's my top category?")
    assert "Beans" in result["content"]
    assert result["query_used"] == "get_category_breakdown"


def test_chat_service_mock_mode_anomaly_question():
    result = ChatService.respond(COMPUTED_STATS, "Any anomalies or refunds I should know about?")
    assert "1" in result["content"]
    assert result["query_used"] == "list_anomalies"


def test_chat_service_mock_mode_default_summary():
    result = ChatService.respond(COMPUTED_STATS, "How's business going?")
    assert "5,000.00" in result["content"] or "5000.00" in result["content"]


def test_chat_service_mock_mode_explicit_date_question():
    result = ChatService.respond(COMPUTED_STATS, "What happened on 2026-05-12?")
    assert result["query_used"] == "get_metrics_for_date"
    assert "150.00" in result["content"]


def test_chat_service_mock_mode_weekday_question():
    result = ChatService.respond(COMPUTED_STATS, "Why did sales drop on Tuesday?")
    assert result["query_used"] == "get_metrics_for_date"
    assert "2026-05-12" in result["content"]


def test_build_chart_handles_daily_period_metrics():
    daily_result = ChatTools(COMPUTED_STATS).get_period_metrics("daily")
    chart = ChatService._build_chart("get_period_metrics", daily_result)
    assert chart is not None
    assert chart["chart_data"][0]["name"] == "2026-05-11"


# --- API-level tests ---

def test_chat_message_requires_synced_data(client, db_session):
    from app.models.computed_stat import ComputedStat
    from app.models.insight import Insight
    from app.models.synced_data import SyncedData
    db_session.query(Insight).delete()
    db_session.query(ComputedStat).delete()
    db_session.query(SyncedData).delete()
    db_session.commit()

    headers = get_auth_headers(client)
    res = client.post("/api/v1/chat/message", headers=headers, json={"message": "How's revenue?"})
    assert res.status_code == 400


def test_chat_message_and_history_roundtrip(client, db_session):
    headers = get_auth_headers(client)
    sync_and_profile(client, headers)

    send_res = client.post("/api/v1/chat/message", headers=headers, json={"message": "What's my total revenue?"})
    assert send_res.status_code == 200
    assert send_res.json()["role"] == "assistant"
    assert len(send_res.json()["content"]) > 0

    history_res = client.get("/api/v1/chat/history", headers=headers)
    assert history_res.status_code == 200
    roles = [turn["role"] for turn in history_res.json()["history"]]
    assert "user" in roles
    assert "assistant" in roles
