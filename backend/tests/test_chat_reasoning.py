import json
from types import SimpleNamespace

import pytest

from app.core.config import settings
from app.services import chat as chat_module
from app.services.chat import ChatService
from app.services.chat_tools import TOOL_DEFINITIONS, ChatTools
from tests.test_explain_change import _records
from app.analytics.profiler import run_profiling

# Coffee grows 2 -> 4 sales a month while Bakery stays flat at 2, Jan to May 2026.
COFFEE_PER_MONTH = {1: 2, 2: 3, 3: 4, 4: 5, 5: 6}
ROWS = []
for month, n in COFFEE_PER_MONTH.items():
    ROWS += [{"Date": f"2026-{month:02d}-{d:02d}", "Amount": 100, "Category": "Coffee", "Payment Method": "Card"} for d in range(1, n + 1)]
    ROWS += [{"Date": f"2026-{month:02d}-{d:02d}", "Amount": 50, "Category": "Bakery", "Payment Method": "Cash"} for d in (10, 11)]
# The file runs through 31 May (a $0 closing entry), so every month above is a finished one.
ROWS.append({"Date": "2026-05-31", "Amount": 0, "Category": "Bakery", "Payment Method": "Cash"})


@pytest.fixture(autouse=True)
def mock_provider(monkeypatch):
    monkeypatch.setattr(settings, "LLM_PROVIDER", "mock")


@pytest.fixture
def stats():
    return run_profiling(_records(ROWS))


# --- tools ---

def test_best_and_worst_periods(stats):
    r = ChatTools(stats).best_and_worst_periods("monthly")
    assert r["best"]["period"] == "2026-05" and r["best"]["revenue"] == 700.0
    assert r["worst"]["period"] == "2026-01" and r["worst"]["revenue"] == 300.0
    assert r["average_revenue"] == 500.0 and r["periods_analysed"] == 5
    assert r["latest_complete"]["vs_average_pct"] == 40.0


def test_best_and_worst_without_data():
    assert "error" in ChatTools({}).best_and_worst_periods("monthly")


def test_driver_trend_is_case_insensitive_and_reports_change(stats):
    r = ChatTools(stats).get_driver_trend("category", "coffee", "monthly")
    assert r["name"] == "Coffee"
    assert [p["revenue"] for p in r["series"]] == [200, 300, 400, 500, 600]
    assert r["change"] == 400.0 and r["change_pct"] == 200.0


def test_driver_trend_unknown_name_lists_what_exists(stats):
    r = ChatTools(stats).get_driver_trend("category", "Sushi", "monthly")
    assert "error" in r and "Bakery" in r["error"] and "Coffee" in r["error"]


def test_driver_trend_rejects_bad_arguments(stats):
    assert "error" in ChatTools(stats).get_driver_trend("colour", "x", "monthly")
    assert "error" in ChatTools(stats).get_driver_trend("category", "Coffee", "hourly")


def test_forecast_extends_a_clean_linear_trend(stats):
    r = ChatTools(stats).forecast_next_period("monthly")
    assert r["projected_period"] == "2026-06"
    assert r["trend_per_period"] == 100.0
    assert r["projected_revenue"] == pytest.approx(800.0)
    assert r["trend_fit"] == "strong" and r["r_squared"] == 1.0
    assert r["based_on_periods"][-1] == "2026-05"
    assert "not" not in r["caveat"].lower() or "ignores" in r["caveat"]


def test_forecast_rolls_over_the_year():
    assert ChatTools._next_label("monthly", "2026-12") == "2027-01"
    assert ChatTools._next_label("daily", "2026-02-28") == "2026-03-01"
    assert ChatTools._next_label("weekly", "2026-05-04/2026-05-10") == "2026-05-11/2026-05-17"


def test_forecast_needs_enough_history():
    stats = run_profiling(_records([{"Date": "2026-01-01", "Amount": 10}, {"Date": "2026-02-01", "Amount": 10}]))
    assert "at least 3" in ChatTools(stats).forecast_next_period("monthly")["error"]


def test_forecast_never_goes_negative():
    rows = [{"Date": f"2026-{m:02d}-01", "Amount": a} for m, a in ((1, 300), (2, 150), (3, 10))]
    rows.append({"Date": "2026-03-31", "Amount": 0})  # closes March so it counts as a finished month
    r = ChatTools(run_profiling(_records(rows))).forecast_next_period("monthly")
    assert r["projected_revenue"] == 0.0


def test_forecast_flags_a_noisy_trend_as_weak():
    amounts = (500, 100, 450, 120, 480, 90)
    rows = [{"Date": f"2026-{m:02d}-01", "Amount": a} for m, a in enumerate(amounts, start=1)]
    assert ChatTools(run_profiling(_records(rows))).forecast_next_period("monthly")["trend_fit"] == "weak"


def test_forecast_counts_quiet_weeks_as_time_passing():
    # Sales in weeks 1, 2, then nothing for a month, then week 7: the gap must not be squashed.
    dates = ("2026-01-05", "2026-01-12", "2026-01-19", "2026-02-16", "2026-02-22")  # last entry closes the final week
    rows = [{"Date": d, "Amount": 100} for d in dates]
    r = ChatTools(run_profiling(_records(rows))).forecast_next_period("weekly")
    assert r["projected_period"] == "2026-02-23/2026-03-01"


def test_new_tools_are_declared_and_dispatchable(stats):
    declared = {t["name"] for t in TOOL_DEFINITIONS}
    assert {"get_driver_trend", "best_and_worst_periods", "forecast_next_period"} <= declared
    tools = ChatTools(stats)
    for name in declared:
        assert "Unknown tool" not in str(tools.call(name, {"period_type": "monthly", "dimension": "category", "name": "Coffee", "period": "2026-05", "period_a": "2026-04", "period_b": "2026-05", "date": "2026-05-01"}))


# --- golden questions through the deterministic fallback ---

GOLDEN = [
    ("What will next month look like?", "forecast_next_period", ["2026-06", "$800.00", "not a guarantee"]),
    ("Can you forecast my revenue?", "forecast_next_period", ["$800.00"]),
    ("what was my best month?", "best_and_worst_periods", ["2026-05", "$700.00", "2026-01", "$300.00"]),
    ("which week was the worst?", "best_and_worst_periods", ["best week", "weakest"]),
    ("How is Coffee doing?", "get_driver_trend", ["'Coffee'", "$200.00", "$600.00", "+200.0%"]),
    ("is cash growing over the months", "get_driver_trend", ["'Cash'", "$100.00"]),
    ("Why did sales change?", "explain_change", ["contributing factors"]),
    ("Which category sells the most?", "get_category_breakdown", ["Coffee"]),
]


@pytest.mark.parametrize("question,tool,fragments", GOLDEN)
def test_golden_questions(stats, question, tool, fragments):
    reply = ChatService.respond(stats, question)
    assert reply["query_used"] == tool
    assert reply["tools_used"] == [tool]
    for fragment in fragments:
        assert fragment in reply["content"], (question, reply["content"])


def test_driver_trend_answer_carries_a_chart(stats):
    chart = ChatService.respond(stats, "How is Coffee doing?")["chart"]
    assert chart["chart_type"] == "line" and len(chart["chart_data"]) == 5


def test_forecast_falls_back_to_a_granularity_with_enough_data():
    stats = run_profiling(_records([{"Date": d, "Amount": 100} for d in ("2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26")]))
    reply = ChatService.respond(stats, "what will next month look like?")
    assert reply["query_used"] == "forecast_next_period"
    assert "at least 3" not in reply["content"]


def test_forecast_without_enough_data_says_so():
    stats = run_profiling(_records([{"Date": "2026-01-05", "Amount": 100}]))
    assert "at least 3" in ChatService.respond(stats, "forecast next month")["content"]


# --- multi-step tool use with the Anthropic loop ---

def _tool_use(id_, tool, **inp):
    return SimpleNamespace(type="tool_use", id=id_, name=tool, input=inp)


class ScriptedClient:
    """Stands in for anthropic.Anthropic: replays a fixed list of responses and records the requests."""
    def __init__(self, responses):
        self.responses, self.requests = list(responses), []
        self.messages = SimpleNamespace(create=self._create)

    def _create(self, **kwargs):
        self.requests.append(json.loads(json.dumps(kwargs["messages"], default=lambda o: getattr(o, "__dict__", str(o)))))
        return self.responses.pop(0)


def _anthropic(monkeypatch, responses):
    client = ScriptedClient(responses)
    monkeypatch.setattr(settings, "LLM_PROVIDER", "anthropic")
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(chat_module.anthropic, "Anthropic", lambda api_key: client)
    return client


def test_agent_chains_several_tools_and_reports_all_of_them(monkeypatch, stats):
    client = _anthropic(monkeypatch, [
        SimpleNamespace(stop_reason="tool_use", content=[_tool_use("a", "best_and_worst_periods", period_type="monthly")]),
        SimpleNamespace(stop_reason="tool_use", content=[_tool_use("b", "get_driver_trend", dimension="category", name="Coffee", period_type="monthly")]),
        SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text="May was best, driven by Coffee.")]),
    ])
    reply = ChatService.respond(stats, "What was my best month and what drove it?")
    assert reply["content"] == "May was best, driven by Coffee."
    assert reply["tools_used"] == ["best_and_worst_periods", "get_driver_trend"]
    assert reply["query_used"] == "get_driver_trend"
    assert len(client.requests) == 3


def test_agent_stops_after_the_iteration_cap(monkeypatch, stats):
    loop = [SimpleNamespace(stop_reason="tool_use", content=[_tool_use(str(i), "get_summary")]) for i in range(20)]
    client = _anthropic(monkeypatch, loop)
    reply = ChatService.respond(stats, "keep digging")
    assert len(client.requests) == chat_module.MAX_TOOL_ITERATIONS
    assert "narrow the question" in reply["content"]
    assert reply["tools_used"] == ["get_summary"]


def test_agent_survives_a_tool_error_and_the_model_can_recover(monkeypatch, stats):
    client = _anthropic(monkeypatch, [
        SimpleNamespace(stop_reason="tool_use", content=[_tool_use("a", "get_driver_trend", dimension="category", name="Sushi", period_type="monthly")]),
        SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text="I don't see a Sushi category.")]),
    ])
    reply = ChatService.respond(stats, "How is Sushi doing?")
    assert "Sushi" in reply["content"]
    sent_back = json.dumps(client.requests[1])
    assert "Available" in sent_back and "Coffee" in sent_back


# --- API ---

def test_chat_api_reports_tools_used_live_and_in_history(client):
    from tests.test_uploads import get_auth_headers, CSV_CONTENT
    import io
    headers = get_auth_headers(client)
    client.post("/api/v1/connectors/upload", headers=headers, files={"file": ("t.csv", io.BytesIO(CSV_CONTENT), "text/csv")})
    client.post("/api/v1/data/profile", headers=headers)

    reply = client.post("/api/v1/chat/message", headers=headers, json={"message": "What is my total revenue?"})
    assert reply.status_code == 200
    assert reply.json()["tools_used"] == ["get_summary"]

    history = client.get("/api/v1/chat/history", headers=headers).json()["history"]
    assistant = [m for m in history if m["role"] == "assistant"][-1]
    user = [m for m in history if m["role"] == "user"][-1]
    assert assistant["tools_used"] == ["get_summary"]
    assert user["tools_used"] == []
