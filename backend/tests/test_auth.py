import pytest

def test_register_user(client):
    """Test successful user registration."""
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "newuser@gmail.com", "password": "securepassword"}
    )
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "newuser@gmail.com"
    assert "id" in data

def test_register_user_duplicate(client):
    """Test duplicate registration error."""
    # First registration
    client.post(
        "/api/v1/auth/register",
        json={"email": "dup@gmail.com", "password": "password123"}
    )
    # Second registration
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "dup@gmail.com", "password": "differentpassword"}
    )
    assert response.status_code == 400
    assert "already exists" in response.json()["detail"]

def test_login_user(client):
    """Test user login and token issuance."""
    # Register user
    client.post(
        "/api/v1/auth/register",
        json={"email": "loginuser@gmail.com", "password": "password123"}
    )
    
    # Login
    response = client.post(
        "/api/v1/auth/login",
        data={"username": "loginuser@gmail.com", "password": "password123"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"

def test_login_demo_user_auto_provision(client):
    """Test that login with demo credentials auto-provisions the demo user."""
    response = client.post(
        "/api/v1/auth/login",
        data={"username": "demo@sage.ai", "password": "sage_demo_pass"}
    )
    assert response.status_code == 200
    assert "access_token" in response.json()

def test_get_current_user_profile(client):
    """Test retrieving profile using bearer token."""
    # Login as demo user
    login_response = client.post(
        "/api/v1/auth/login",
        data={"username": "demo@sage.ai", "password": "sage_demo_pass"}
    )
    token = login_response.json()["access_token"]
    
    # Get profile
    profile_response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert profile_response.status_code == 200
    assert profile_response.json()["email"] == "demo@sage.ai"
