# pyrefly: ignore [missing-import]
import pytest
from app.analytics.profiler import run_profiling
from app.models.synced_data import SyncedData
from uuid import uuid4

def test_profiler_math_calculations():
    """Test pandas calculations on predictable mock inputs."""
    user_id = uuid4()
    account_id = uuid4()
    
    # We will pass 4 mock transaction records
    records = [
        SyncedData(
            id=uuid4(), user_id=user_id, connected_account_id=account_id,
            source="google_sheets", external_id="1",
            raw_payload={"Date": "2026-05-01", "Amount": 100, "Category": "Coffee", "Quantity": 2}
        ),
        SyncedData(
            id=uuid4(), user_id=user_id, connected_account_id=account_id,
            source="google_sheets", external_id="2",
            raw_payload={"Date": "2026-05-15", "Amount": 200, "Category": "Coffee", "Quantity": 4}
        ),
        SyncedData(
            id=uuid4(), user_id=user_id, connected_account_id=account_id,
            source="google_sheets", external_id="3",
            raw_payload={"Date": "2026-06-01", "Amount": 150, "Category": "Bakery", "Quantity": 1}
        ),
        SyncedData(
            id=uuid4(), user_id=user_id, connected_account_id=account_id,
            source="google_sheets", external_id="4",
            # Add an outlier
            raw_payload={"Date": "2026-06-15", "Amount": 1000, "Category": "Beans", "Quantity": 10}
        )
    ]
    
    profile = run_profiling(records)
    
    # Verify totals
    assert profile["summary"]["total_revenue"] == 1450.00
    assert profile["summary"]["total_transactions"] == 4
    assert profile["summary"]["avg_transaction_value"] == 362.50
    
    # Verify categories
    top_cats = profile["category_metrics"]["top_categories"]
    assert len(top_cats) == 3
    # Sorted by revenue: Beans (1000), Coffee (300), Bakery (150)
    assert top_cats[0]["category"] == "Beans"
    assert top_cats[0]["revenue"] == 1000.00
    assert top_cats[1]["category"] == "Coffee"
    assert top_cats[1]["revenue"] == 300.00
    
    # Check anomalies - 1000 should be detected as anomaly (Z-score outlier)
    anoms = profile["anomalies"]
    assert len(anoms) >= 1
    anom_amounts = [a["amount"] for a in anoms]
    assert 1000.00 in anom_amounts

def test_profiler_negative_values():
    """Test that refunds (negative amount values) are immediately flagged as anomalies."""
    user_id = uuid4()
    account_id = uuid4()
    
    records = [
        SyncedData(
            id=uuid4(), user_id=user_id, connected_account_id=account_id,
            source="google_sheets", external_id="1",
            raw_payload={"Date": "2026-05-01", "Amount": 50.00, "Category": "Coffee"}
        ),
        SyncedData(
            id=uuid4(), user_id=user_id, connected_account_id=account_id,
            source="google_sheets", external_id="2",
            raw_payload={"Date": "2026-05-02", "Amount": -10.00, "Category": "Refund"}
        )
    ]
    
    profile = run_profiling(records)
    anoms = profile["anomalies"]
    assert len(anoms) == 1
    assert anoms[0]["amount"] == -10.00
    assert "Refund" in anoms[0]["reason"]

def test_api_endpoints_profiling(client):
    """Test /api/v1/data/profile and /api/v1/data/profile/latest endpoints."""
    # Obtain auth headers
    login_response = client.post(
        "/api/v1/auth/login",
        data={"username": "demo@sage.ai", "password": "sage_demo_pass"}
    )
    token = login_response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # Connect account first via mock callback
    login_res = client.get("/api/v1/connectors/google/login", headers=headers)
    from urllib.parse import urlparse, parse_qs
    state = parse_qs(urlparse(login_res.json()["url"]).query)["state"][0]
    client.get(f"/api/v1/connectors/google/callback?state={state}&code=mock_code")
    
    # Sync mock sheet data (seeds 150 rows)
    sync_res = client.post(
        "/api/v1/connectors/sheets/sync?spreadsheet_id=mock_sheet_sales_1&sheet_name=Sales",
        headers=headers
    )
    assert sync_res.status_code == 200
    
    # Trigger profiling
    profile_res = client.post("/api/v1/data/profile", headers=headers)
    assert profile_res.status_code == 201
    profile_data = profile_res.json()
    assert "summary" in profile_data
    assert profile_data["summary"]["total_transactions"] == 150
    assert len(profile_data["anomalies"]) > 0  # should flag seeded anomalies (950 and -150)
    
    # Verify latest profile fetch works
    latest_res = client.get("/api/v1/data/profile/latest", headers=headers)
    assert latest_res.status_code == 200
    assert latest_res.json()["summary"]["total_transactions"] == 150
