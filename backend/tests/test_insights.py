# pyrefly: ignore [missing-import]
import pytest
from app.services.ai import AIService
from app.models.insight import Insight
from app.models.computed_stat import ComputedStat
from uuid import uuid4

def test_regex_json_cleaner():
    """Verify that SAGE's regex cleaner correctly sanitizes Claude outputs containing fences or preamble."""
    raw_response_with_fences = """
    Here is the requested analysis:
    ```json
    {
      "recommendation": "Expand weekend shifts.",
      "insights": [
        {
          "title": "Weekend Sales Surge",
          "explanation": "Weekend sales are double weekday volumes.",
          "chart_type": "line",
          "chart_data": [{"name": "Sat", "value": 500}]
        }
      ]
    }
    ```
    I hope this helps!
    """
    
    parsed = AIService._clean_and_parse_json(raw_response_with_fences)
    assert parsed["recommendation"] == "Expand weekend shifts."
    assert len(parsed["insights"]) == 1
    assert parsed["insights"][0]["title"] == "Weekend Sales Surge"
    assert parsed["insights"][0]["chart_data"][0]["value"] == 500

def test_mock_insight_generation_format():
    """Verify the mock engine returns structural and mathematical compliance with the schema."""
    computed_stats = {
        "summary": {
            "total_revenue": 5000.00,
            "total_transactions": 50,
            "avg_transaction_value": 100.00
        },
        "period_metrics": {
            "monthly": [],
            "weekly": [{"week": "2026-W22", "revenue": 1000.0, "transactions": 10, "growth_pct": 5.0}]
        },
        "category_metrics": {
            "top_categories": [{"category": "Beans", "revenue": 3000.0, "volume": 30, "share_pct": 60.0}],
            "bottom_categories": []
        },
        "anomalies": [{"amount": 950.0, "date": "2026-06-01", "reason": "outlier"}],
        "correlations": {}
    }
    
    insights = AIService._generate_mock_insights(computed_stats)
    
    assert "recommendation" in insights
    assert len(insights["insights"]) >= 2  # Should contain Weekly Trend and Category performance
    
    # Assert Weekly trend card details
    trend_card = insights["insights"][0]
    assert trend_card["title"] == "Weekly Revenue Trend Analysis"
    assert len(trend_card["chart_data"]) == 1
    assert trend_card["chart_data"][0]["name"] == "2026-W22"
    assert trend_card["chart_data"][0]["value"] == 1000.0

def test_api_endpoints_insights(client, db_session):
    """Test generating and retrieving SAGE insights via API endpoints."""
    # Clear any pre-existing insights and computed stats for clean testing context
    db_session.query(Insight).delete()
    db_session.query(ComputedStat).delete()
    db_session.commit()

    # Obtain auth headers
    login_response = client.post(
        "/api/v1/auth/login",
        data={"username": "demo@sage.ai", "password": "sage_demo_pass"}
    )
    token = login_response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # 1. Check latest insights endpoint fails with 404 before generating
    res_latest_fail = client.get("/api/v1/insights/latest", headers=headers)
    assert res_latest_fail.status_code == 404
    
    # 2. Check generate insights fails with 400 if no computed stats are present
    res_gen_fail = client.post("/api/v1/insights/generate", headers=headers)
    assert res_gen_fail.status_code == 400
    
    # 3. Seed mock stats and sync mock sheets first
    # Connect account first via mock callback
    login_res = client.get("/api/v1/connectors/google/login", headers=headers)
    from urllib.parse import urlparse, parse_qs
    state = parse_qs(urlparse(login_res.json()["url"]).query)["state"][0]
    client.get(f"/api/v1/connectors/google/callback?state={state}&code=mock_code")
    client.post("/api/v1/connectors/sheets/sync?spreadsheet_id=mock_sheet_sales_1&sheet_name=Sales", headers=headers)
    
    # Trigger profiling
    client.post("/api/v1/data/profile", headers=headers)
    
    # 4. Generate insights
    gen_res = client.post("/api/v1/insights/generate", headers=headers)
    assert gen_res.status_code == 201
    insight_payload = gen_res.json()
    assert "insight_data" in insight_payload
    assert "recommendation" in insight_payload["insight_data"]
    
    # 5. Fetch latest insights should succeed now
    fetch_res = client.get("/api/v1/insights/latest", headers=headers)
    assert fetch_res.status_code == 200
    assert fetch_res.json()["insight_data"]["recommendation"] == insight_payload["insight_data"]["recommendation"]
