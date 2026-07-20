import pytest

def get_auth_headers(client):
    """Helper to get access token headers for demo@sage.ai."""
    login_response = client.post(
        "/api/v1/auth/login",
        data={"username": "demo@sage.ai", "password": "sage_demo_pass"}
    )
    token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

def test_google_login_endpoint(client):
    """Verify login redirection URL generation (and fallback to mock)."""
    headers = get_auth_headers(client)
    response = client.get("/api/v1/connectors/google/login", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "url" in data
    assert data["is_mock"] is True  # Should fall back to mock since keys are empty

def test_google_callback_mock(client):
    """Verify mock callback records account and redirects correctly."""
    headers = get_auth_headers(client)
    
    # Retrieve mock login state
    login_response = client.get("/api/v1/connectors/google/login", headers=headers)
    url_str = login_response.json()["url"]
    
    # Parse query parameters from the url_str
    from urllib.parse import urlparse, parse_qs
    parsed = urlparse(url_str)
    params = parse_qs(parsed.query)
    state = params["state"][0]
    
    # Call the callback with the state and mock code
    callback_response = client.get(
        f"/api/v1/connectors/google/callback?state={state}&code=mock_code",
        follow_redirects=False
    )
    
    # Assert redirect behavior
    assert callback_response.status_code == 307
    location = callback_response.headers["location"]
    assert "dashboard" in location
    assert "connected=google_sheets" in location

def test_list_sheets_mock(client):
    """Verify spreadsheets listing for a connected mock account."""
    headers = get_auth_headers(client)
    
    # Connect account first via mock callback
    login_response = client.get("/api/v1/connectors/google/login", headers=headers)
    from urllib.parse import urlparse, parse_qs
    parsed = urlparse(login_response.json()["url"])
    state = parse_qs(parsed.query)["state"][0]
    client.get(f"/api/v1/connectors/google/callback?state={state}&code=mock_code")
    
    # Retrieve sheets list
    list_response = client.get("/api/v1/connectors/sheets", headers=headers)
    assert list_response.status_code == 200
    sheets_data = list_response.json()
    assert len(sheets_data) > 0
    assert sheets_data[0]["id"] == "mock_sheet_sales_1"
    assert "Sales" in sheets_data[0]["sheets"]

def test_sync_sheets_mock(client):
    """Verify mock sheets sync processes and writes rows to synced_data table."""
    headers = get_auth_headers(client)
    
    # Connect account first via mock callback
    login_response = client.get("/api/v1/connectors/google/login", headers=headers)
    from urllib.parse import urlparse, parse_qs
    parsed = urlparse(login_response.json()["url"])
    state = parse_qs(parsed.query)["state"][0]
    client.get(f"/api/v1/connectors/google/callback?state={state}&code=mock_code")
    
    # Sync mock sheet
    sync_response = client.post(
        "/api/v1/connectors/sheets/sync?spreadsheet_id=mock_sheet_sales_1&sheet_name=Sales",
        headers=headers
    )
    assert sync_response.status_code == 200
    sync_data = sync_response.json()
    assert sync_data["status"] == "success"
    assert sync_data["rows_synced"] == 150
    
    # Verify synced data is accessible via get data endpoint
    data_response = client.get("/api/v1/data/", headers=headers)
    assert data_response.status_code == 200
    assert data_response.json()["count"] == 150
