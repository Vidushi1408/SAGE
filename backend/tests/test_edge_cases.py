import io

import pandas as pd
import pytest

from app.analytics.profiler import run_profiling
from tests.test_data_quality import _records
from tests.test_uploads import get_auth_headers


def upload(client, name, payload):
    headers = get_auth_headers(client)
    return client.post(
        "/api/v1/connectors/upload", headers=headers,
        files={"file": (name, io.BytesIO(payload), "application/octet-stream")},
    )


def xlsx_bytes(df):
    buf = io.BytesIO()
    df.to_excel(buf, index=False)
    return buf.getvalue()


def test_upload_over_size_limit_is_rejected(client):
    big = b"Date,Amount\n" + b"2026-01-01,1.00\n" * (400_000)
    assert len(big) > 5 * 1024 * 1024
    res = upload(client, "big.csv", big)
    assert res.status_code == 400
    assert "too large" in res.json()["detail"].lower()


def test_upload_corrupt_xlsx_is_rejected_cleanly(client):
    res = upload(client, "broken.xlsx", b"PK\x03\x04 definitely not a workbook")
    assert res.status_code == 400
    assert "parse" in res.json()["detail"].lower()


def test_upload_valid_xlsx_is_ingested(client):
    df = pd.DataFrame({"Date": ["2026-01-01", "2026-01-02"], "Amount": [10.5, 20.0], "Category": ["A", "B"]})
    res = upload(client, "ok.xlsx", xlsx_bytes(df))
    assert res.status_code == 200
    assert res.json()["rows_synced"] == 2


def test_upload_headers_only_xlsx_is_rejected(client):
    res = upload(client, "headers.xlsx", xlsx_bytes(pd.DataFrame({"Date": [], "Amount": []})))
    assert res.status_code == 400


def test_single_row_dataset_uploads_and_profiles(client):
    res = upload(client, "one.csv", b"Date,Amount,Category\n2026-01-01,42.00,Coffee\n")
    assert res.status_code == 200
    headers = get_auth_headers(client)
    profile = client.post("/api/v1/data/profile", headers=headers)
    assert profile.status_code == 201
    assert profile.json()["summary"]["total_transactions"] >= 1


def test_upload_requires_authentication(client):
    res = client.post(
        "/api/v1/connectors/upload",
        files={"file": ("a.csv", io.BytesIO(b"Date,Amount\n2026-01-01,1\n"), "text/csv")},
    )
    assert res.status_code == 401


def test_extension_check_is_case_insensitive(client):
    res = upload(client, "DATA.CSV", b"Date,Amount\n2026-01-01,5.00\n")
    assert res.status_code == 200


def test_profiler_survives_mixed_date_formats():
    profile = run_profiling(_records([
        {"Date": "2026-01-01", "Amount": 10},
        {"Date": "01/02/2026", "Amount": 20},
        {"Date": "Jan 3, 2026", "Amount": 30},
        {"Date": "not a date", "Amount": 40},
        {"Date": None, "Amount": 50},
    ]))
    # The three real dates survive in any format; the unparseable and blank ones are dropped and reported.
    assert profile["summary"]["total_transactions"] == 3
    assert profile["summary"]["total_revenue"] == pytest.approx(60.0)
    assert profile["data_quality"]["rows_used"] == 3


def test_profiler_handles_all_identical_amounts():
    profile = run_profiling(_records([{"Date": "2026-01-01", "Amount": 10.0}] * 5))
    assert profile["summary"]["total_revenue"] == pytest.approx(50.0)
    assert profile["anomalies"] == []


def test_profiler_handles_single_row():
    profile = run_profiling(_records([{"Date": "2026-01-01", "Amount": 99.0}]))
    assert profile["summary"]["total_revenue"] == pytest.approx(99.0)
    assert profile["summary"]["total_transactions"] == 1


def test_profiler_handles_all_unreadable_amounts():
    profile = run_profiling(_records([
        {"Date": "2026-01-01", "Amount": "n/a"},
        {"Date": "2026-01-02", "Amount": ""},
    ]))
    assert profile["summary"]["total_revenue"] == 0
    assert profile["data_quality"]["warnings"]
