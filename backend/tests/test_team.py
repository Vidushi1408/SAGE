import pytest
from app.models.user import User
from app.models.synced_data import SyncedData
from uuid import uuid4

def test_team_invite_and_list(client):
    """Verify that an owner/admin can invite team members and list them."""
    # 1. Register owner
    owner_email = f"owner_{uuid4()}@company.com"
    reg_response = client.post(
        "/api/v1/auth/register",
        json={"email": owner_email, "password": "ownerpassword"}
    )
    assert reg_response.status_code == 201
    
    # 2. Login owner
    login_response = client.post(
        "/api/v1/auth/login",
        data={"username": owner_email, "password": "ownerpassword"}
    )
    token = login_response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 3. List team (should contain only the owner at first)
    list_res1 = client.get("/api/v1/team/", headers=headers)
    assert list_res1.status_code == 200
    assert len(list_res1.json()) == 1
    assert list_res1.json()[0]["email"] == owner_email
    assert list_res1.json()[0]["role"] == "admin"

    # 4. Invite a team member
    member_email = f"analyst_{uuid4()}@company.com"
    invite_res = client.post(
        "/api/v1/team/invite",
        headers=headers,
        json={
            "email": member_email,
            "name": "Jane Analyst",
            "role": "analyst"
        }
    )
    assert invite_res.status_code == 201
    assert invite_res.json()["email"] == member_email
    assert invite_res.json()["role"] == "analyst"
    assert invite_res.json()["is_active"] is False

    # 5. List team again (should contain 2 users now)
    list_res2 = client.get("/api/v1/team/", headers=headers)
    assert list_res2.status_code == 200
    assert len(list_res2.json()) == 2
    emails = [u["email"] for u in list_res2.json()]
    assert member_email in emails

def test_team_role_restrictions(client, db_session):
    """Verify that only admin users can invite or delete team members."""
    # 1. Create owner and invite an analyst
    owner_email = f"owner_{uuid4()}@company.com"
    client.post("/api/v1/auth/register", json={"email": owner_email, "password": "ownerpassword"})
    login_owner = client.post("/api/v1/auth/login", data={"username": owner_email, "password": "ownerpassword"})
    owner_token = login_owner.json()["access_token"]
    owner_headers = {"Authorization": f"Bearer {owner_token}"}

    analyst_email = f"analyst_{uuid4()}@company.com"
    client.post(
        "/api/v1/team/invite",
        headers=owner_headers,
        json={"email": analyst_email, "name": "Analyst", "role": "analyst"}
    )

    # 2. Accept the invite (as would happen from the emailed link) then log in as the analyst
    invited_user = db_session.query(User).filter(User.email == analyst_email).first()
    accept_res = client.post(
        "/api/v1/team/accept-invite",
        json={"token": invited_user.invite_token, "name": "Analyst", "password": "analystpassword"}
    )
    assert accept_res.status_code == 200

    login_analyst = client.post("/api/v1/auth/login", data={"username": analyst_email, "password": "analystpassword"})
    analyst_token = login_analyst.json()["access_token"]
    analyst_headers = {"Authorization": f"Bearer {analyst_token}"}

    # 3. Analyst tries to invite someone (should fail with 403)
    invite_fail = client.post(
        "/api/v1/team/invite",
        headers=analyst_headers,
        json={"email": "extra@company.com", "role": "viewer"}
    )
    assert invite_fail.status_code == 403

def test_team_data_sharing(client, db_session):
    """Verify that invited team members query and write to the owner's database context."""
    # 1. Create owner
    owner_email = f"owner_{uuid4()}@company.com"
    client.post("/api/v1/auth/register", json={"email": owner_email, "password": "ownerpassword"})
    login_owner = client.post("/api/v1/auth/login", data={"username": owner_email, "password": "ownerpassword"})
    owner_token = login_owner.json()["access_token"]
    owner_headers = {"Authorization": f"Bearer {owner_token}"}

    # 2. Invite analyst and accept the invite (as would happen from the emailed link)
    analyst_email = f"analyst_{uuid4()}@company.com"
    client.post(
        "/api/v1/team/invite",
        headers=owner_headers,
        json={"email": analyst_email, "name": "Analyst", "role": "analyst"}
    )
    invited_user = db_session.query(User).filter(User.email == analyst_email).first()
    client.post(
        "/api/v1/team/accept-invite",
        json={"token": invited_user.invite_token, "name": "Analyst", "password": "analystpassword"}
    )

    # 3. Connect mock sheets and sync data using OWNER credentials
    client.get("/api/v1/connectors/google/login", headers=owner_headers)
    
    # Run callback to create mock ConnectedAccount for OWNER
    from urllib.parse import urlparse, parse_qs
    login_res = client.get("/api/v1/connectors/google/login", headers=owner_headers)
    state = parse_qs(urlparse(login_res.json()["url"]).query)["state"][0]
    client.get(f"/api/v1/connectors/google/callback?state={state}&code=mock_code")
    
    # Sync sheets (seeds 150 records under OWNER)
    sync_res = client.post(
        "/api/v1/connectors/sheets/sync?spreadsheet_id=mock_sheet_sales_1&sheet_name=Sales",
        headers=owner_headers
    )
    assert sync_res.status_code == 200

    # 4. Log in as the ANALYST
    login_analyst = client.post("/api/v1/auth/login", data={"username": analyst_email, "password": "analystpassword"})
    analyst_token = login_analyst.json()["access_token"]
    analyst_headers = {"Authorization": f"Bearer {analyst_token}"}

    # 5. Query data as the ANALYST (should return the OWNER's 150 synced records!)
    data_res = client.get("/api/v1/data/", headers=analyst_headers)
    assert data_res.status_code == 200
    assert data_res.json()["count"] == 150

    # 6. Trigger profiling as the ANALYST (should save under OWNER, return metrics)
    profile_res = client.post("/api/v1/data/profile", headers=analyst_headers)
    assert profile_res.status_code == 201
    assert profile_res.json()["summary"]["total_transactions"] == 150
