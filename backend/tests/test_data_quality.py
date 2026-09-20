import io
from uuid import uuid4

import numpy as np
import pandas as pd
import pytest

from app.analytics.column_mapping import map_columns, column_warnings
from app.analytics.parsing import parse_amount, parse_amount_series
from app.analytics.profiler import run_profiling
from app.models.synced_data import SyncedData


@pytest.mark.parametrize("raw,expected", [
    ("$1,200.50", 1200.50),
    ("1,200.50", 1200.50),
    ("1.200,50", 1200.50),       # European
    ("300,00", 300.0),           # decimal comma
    ("12,34,567.00", 1234567.0), # Indian grouping
    ("$45", 45.0),
    ("USD 45", 45.0),
    ("(50.00)", -50.0),          # accounting negative
    ("-7.5", -7.5),
    ("1,200", 1200.0),
    ("1.234.567", 1234567.0),
    (12, 12.0),
    (3.5, 3.5),
])
def test_parse_amount_valid(raw, expected):
    assert parse_amount(raw) == pytest.approx(expected)


@pytest.mark.parametrize("raw", ["abc", "", "   ", None, float("nan"), "N/A", "-"])
def test_parse_amount_unreadable_is_nan(raw):
    assert np.isnan(parse_amount(raw))


def test_parse_amount_series_mixed():
    out = parse_amount_series(pd.Series(["$10", "5", "oops", "(2)"]))
    assert out.iloc[0] == 10 and out.iloc[1] == 5 and np.isnan(out.iloc[2]) and out.iloc[3] == -2


def test_column_mapping_recognises_common_headers():
    df = pd.DataFrame(columns=["Order Date", "Total Price", "Product", "Units Sold", "Customer"])
    renamed, mapping = map_columns(df)
    assert mapping == {"Date": "Order Date", "Amount": "Total Price", "Category": "Product", "Quantity": "Units Sold"}
    assert {"Date", "Amount", "Category", "Quantity"} <= set(renamed.columns)


def test_column_mapping_ignores_duplicates_and_internal_columns():
    df = pd.DataFrame(columns=["Amount", "Price", "_external_id"])
    renamed, mapping = map_columns(df)
    assert mapping == {"Amount": "Amount"}
    assert list(renamed.columns).count("Amount") == 1  # no duplicate canonical column


def test_column_warnings_flag_missing_amount_and_date():
    warnings = column_warnings(["Foo", "Bar"], {})
    assert any("amount" in w.lower() for w in warnings)
    assert any("date" in w.lower() for w in warnings)
    assert column_warnings(["Date", "Amount"], {"Date": "Date", "Amount": "Amount"}) == []


def _records(rows):
    uid, aid = uuid4(), uuid4()
    return [SyncedData(id=uuid4(), user_id=uid, connected_account_id=aid, source="csv_upload",
                       external_id=str(i), raw_payload=r) for i, r in enumerate(rows)]


def test_profiler_reads_formatted_currency():
    profile = run_profiling(_records([
        {"Date": "2026-02-01", "Amount": "$1,200.50"},
        {"Date": "2026-02-02", "Amount": "$300.00"},
    ]))
    assert profile["summary"]["total_revenue"] == pytest.approx(1500.5)
    assert profile["data_quality"]["warnings"] == []


def test_profiler_reports_unrecognised_columns_instead_of_silent_zero():
    profile = run_profiling(_records([{"When": "2026-02-01", "How much": "10"}]))
    warnings = " ".join(profile["data_quality"]["warnings"]).lower()
    assert "amount" in warnings and "date" in warnings
    assert profile["summary"]["total_revenue"] == 0


def test_profiler_reports_unreadable_amounts_and_bad_dates():
    profile = run_profiling(_records([
        {"Date": "2026-02-01", "Amount": "10"},
        {"Date": "2026-02-02", "Amount": "n/a-ish"},
        {"Date": "not a date", "Amount": "5"},
    ]))
    dq = profile["data_quality"]
    assert dq["rows_total"] == 3 and dq["rows_used"] == 2
    joined = " ".join(dq["warnings"])
    assert "could not be read as a number" in joined
    assert "dropped" in joined and "date" in joined


def test_profiler_includes_data_quality_when_empty():
    assert run_profiling([])["data_quality"]["warnings"] == []


# --- upload API ---

def _auth(client):
    r = client.post("/api/v1/auth/login", data={"username": "demo@sage.ai", "password": "sage_demo_pass"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _upload(client, name, data):
    return client.post("/api/v1/connectors/upload", headers=_auth(client), files={"file": (name, io.BytesIO(data), "text/csv")})


def test_upload_semicolon_csv_is_parsed_properly(client):
    res = _upload(client, "semi.csv", b"Date;Amount\n2026-02-01;5\n2026-02-02;7\n")
    assert res.status_code == 200
    assert res.json()["warnings"] == []


def test_upload_returns_warnings_for_unrecognised_headers(client):
    res = _upload(client, "odd.csv", b"Foo,Bar\n1,2\n")
    assert res.status_code == 200
    assert res.json()["warnings"]


def test_upload_latin1_file_accepted(client):
    res = _upload(client, "latin.csv", "Date,Amount,Category\n2026-02-01,5,Caf\xe9\n".encode("latin-1"))
    assert res.status_code == 200


def test_upload_binary_file_named_csv_is_rejected_cleanly(client):
    res = _upload(client, "fake.csv", bytes(range(256)) * 10)
    assert res.status_code == 400


def test_mock_worksheets_have_distinct_repeatable_data():
    from app.services.sync_service import generate_mock_business_data as gen
    sales, expenses = gen("Sales"), gen("Expenses")
    assert {r["Category"] for r in sales}.isdisjoint({r["Category"] for r in expenses})
    assert gen("Sales") == sales  # repeatable
    assert any(r["Amount"] == 950.0 for r in sales) and not any(r["Amount"] == 950.0 for r in expenses)
