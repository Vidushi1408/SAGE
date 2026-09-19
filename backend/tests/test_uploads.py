import io
import pytest


def get_auth_headers(client):
    login_response = client.post(
        "/api/v1/auth/login",
        data={"username": "demo@sage.ai", "password": "sage_demo_pass"}
    )
    token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


CSV_CONTENT = b"""Date,Amount,Category,Quantity
2026-01-01,10.50,Coffee,1
2026-01-02,25.00,Bakery,2
2026-01-03,999.00,Merchandise,1
"""


def test_upload_csv_ingests_rows_and_feeds_profiler(client):
    headers = get_auth_headers(client)

    files = {"file": ("transactions.csv", io.BytesIO(CSV_CONTENT), "text/csv")}
    upload_res = client.post("/api/v1/connectors/upload", headers=headers, files=files)
    assert upload_res.status_code == 200
    assert upload_res.json()["rows_synced"] == 3

    data_res = client.get("/api/v1/data/", headers=headers)
    assert data_res.status_code == 200
    assert data_res.json()["count"] >= 3

    profile_res = client.post("/api/v1/data/profile", headers=headers)
    assert profile_res.status_code == 201
    assert profile_res.json()["summary"]["total_transactions"] >= 3


def test_upload_rejects_unsupported_file_type(client):
    headers = get_auth_headers(client)
    files = {"file": ("transactions.txt", io.BytesIO(b"not a csv"), "text/plain")}
    res = client.post("/api/v1/connectors/upload", headers=headers, files=files)
    assert res.status_code == 400


def test_upload_rejects_empty_file(client):
    headers = get_auth_headers(client)
    files = {"file": ("empty.csv", io.BytesIO(b"Date,Amount\n"), "text/csv")}
    res = client.post("/api/v1/connectors/upload", headers=headers, files=files)
    assert res.status_code == 400


def test_reupload_same_filename_replaces_rows(client):
    headers = get_auth_headers(client)
    files = {"file": ("repeat.csv", io.BytesIO(CSV_CONTENT), "text/csv")}
    first = client.post("/api/v1/connectors/upload", headers=headers, files=files)
    assert first.json()["rows_synced"] == 3

    smaller_csv = b"Date,Amount,Category\n2026-01-01,5.00,Coffee\n"
    files2 = {"file": ("repeat.csv", io.BytesIO(smaller_csv), "text/csv")}
    second = client.post("/api/v1/connectors/upload", headers=headers, files=files2)
    assert second.json()["rows_synced"] == 1
