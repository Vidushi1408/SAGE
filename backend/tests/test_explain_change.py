from uuid import uuid4

from app.analytics.profiler import run_profiling
from app.models.synced_data import SyncedData
from app.services.chat import ChatService
from app.services.chat_tools import ChatTools


def _records(rows):
    user_id, account_id = uuid4(), uuid4()
    return [
        SyncedData(id=uuid4(), user_id=user_id, connected_account_id=account_id,
                   source="google_sheets", external_id=str(i), raw_payload=row)
        for i, row in enumerate(rows)
    ]


# April: Coffee 600 + Bakery 400. May: Coffee 200 (the drop) + Bakery 400 plus a 300 refund on Cash.
ROWS = (
    [{"Date": f"2026-04-{d:02d}", "Amount": 100, "Category": "Coffee", "Payment Method": "Card"} for d in range(1, 7)]
    + [{"Date": f"2026-04-{d:02d}", "Amount": 100, "Category": "Bakery", "Payment Method": "Cash"} for d in range(7, 11)]
    + [{"Date": f"2026-05-{d:02d}", "Amount": 100, "Category": "Coffee", "Payment Method": "Card"} for d in range(1, 3)]
    + [{"Date": f"2026-05-{d:02d}", "Amount": 100, "Category": "Bakery", "Payment Method": "Cash"} for d in range(3, 7)]
)


def _stats():
    return run_profiling(_records(ROWS))


def test_profiler_emits_driver_breakdowns():
    drivers = _stats()["drivers"]
    assert {"period": "2026-04", "name": "Coffee", "revenue": 600.0, "transactions": 6} in drivers["category"]["monthly"]
    assert drivers["payment_method"]["daily"]


def test_profiler_drivers_empty_without_dimension():
    stats = run_profiling(_records([{"Date": "2026-05-01", "Amount": 10}, {"Date": "2026-05-02", "Amount": 20}]))
    assert stats["drivers"]["category"] == {"daily": [], "weekly": [], "monthly": []}


def test_explain_change_names_the_category_that_drove_the_drop():
    result = ChatTools(_stats()).explain_change("monthly")
    assert result["period"] == "2026-05" and result["compared_to"] == "2026-04"
    assert result["revenue_change"] == -400.0
    top = result["top_category_drivers"][0]
    assert top["name"] == "Coffee" and top["change"] == -400.0
    assert top["share_of_total_change_pct"] == 100.0
    # Fewer sales at the same ticket size, so it is a volume effect
    assert result["volume_effect"] == -400.0 and result["ticket_size_effect"] == 0.0
    assert result["top_payment_method_drivers"][0]["name"] == "Card"


def test_explain_change_includes_anomalies_in_period():
    stats = _stats()
    stats["anomalies"] = [
        {"transaction_id": "T1", "date": "2026-05-02", "amount": -300.0, "reason": "Refund", "z_score": 3.0},
        {"transaction_id": "T2", "date": "2026-04-02", "amount": 900.0, "reason": "Outlier", "z_score": 3.0},
    ]
    result = ChatTools(stats).explain_change("monthly")
    assert [a["transaction_id"] for a in result["anomalies_in_period"]] == ["T1"]


def test_explain_change_errors_are_reported_not_raised():
    tools = ChatTools(_stats())
    assert "error" in tools.explain_change("monthly", period="1999-01")
    assert "error" in tools.explain_change("monthly", period="2026-04")  # first period, nothing earlier
    assert "error" in ChatTools({}).explain_change("weekly")


def test_explain_change_weekly_anomaly_window():
    stats = _stats()
    weekly = [p["week"] for p in stats["period_metrics"]["weekly"]]
    stats["anomalies"] = [{"transaction_id": "T", "date": "2026-05-02", "amount": -50.0, "reason": "Refund", "z_score": 3}]
    week = next(w for w in weekly if w.startswith("2026-04-27"))
    assert ChatTools(stats).explain_change("weekly", period=week)["anomalies_in_period"]


def test_tool_dispatch_and_mock_why_question():
    tools = ChatTools(_stats())
    assert tools.call("explain_change", {"period_type": "monthly"})["revenue_change"] == -400.0
    answer = ChatService._mock_respond(tools, "why did my revenue drop this month?")
    assert answer["query_used"] == "explain_change"
    assert "Coffee" in answer["content"] and "fell $400.00" in answer["content"]
    assert "not proven causes" in answer["content"]
