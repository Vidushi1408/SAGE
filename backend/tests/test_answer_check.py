import pytest

from app.core.config import settings
from app.services import ollama
from app.services.answer_check import check_reply
from app.services.chat import ChatService
from tests.test_chat_reasoning import ROWS, ScriptedClient, _anthropic, _tool_use
from types import SimpleNamespace

from app.analytics.profiler import run_profiling
from tests.test_explain_change import _records

RESULT = {
    "period": "2026-10", "compared_to": "2026-09",
    "revenue": 463.8, "previous_revenue": 505.63, "revenue_change": -41.83, "revenue_change_pct": -8.27,
    "anomalies_in_period": [{"date": "2026-10-03", "amount": 950.0}],
    "weeks": ["2026-09-28/2026-10-04"],
}


def ok(reply, results=(RESULT,), context=()):
    return check_reply(reply, list(results), context)


# --- what should pass ---

@pytest.mark.parametrize("reply", [
    "Revenue fell $41.83 in 2026-10 versus 2026-09.",
    "Revenue was $463.80, down from $505.63.",
    "That's a drop of 8.27%.",
    "Down roughly 8.3% (about 8%).",
    "About $464 this month.",                 # rounded to the dollar
    "Sales were around $0.5k.",               # k suffix, loosely rounded from the previous 505.63
    "October 2026 was the weaker month.",     # month name backed by 2026-10
    "It was lower in September too.",
    "The $950.00 outlier landed on 2026-10-03.",
    "During the week of 2026-09-30 sales dipped.",  # inside a known week range
    "You may want to look at this, and may be right.",  # 'may' as a verb is not a month
    "There is no data for that, so I can't say.",       # no numbers at all
])
def test_grounded_replies_pass(reply):
    assert ok(reply).ok, ok(reply).problems


def test_numbers_the_user_wrote_may_be_echoed():
    assert not ok("Your goal of $5,000 is far off.").ok
    assert ok("Your goal of $5,000 is far off.", context=["will I hit my $5,000 goal?"]).ok


# --- what should be caught ---

@pytest.mark.parametrize("reply,fragment", [
    ("Revenue was $9,999.00.", "$9,999.00"),
    ("Revenue fell 45.5%.", "45.5%"),
    ("It happened in August.", "August"),               # the real llama3.2 slip: wrong month
    ("Compared with 2026-08, sales fell.", "2026-08"),
    ("Sales dipped on 2026-10-17.", "2026-10-17"),
    ("Sales dipped in 2026-13.", "2026-13"),            # not a real month
    ("Sales dipped on 2026-02-30.", "2026-02-30"),      # not a real day
    ("In May 2026 revenue peaked.", "May"),
])
def test_ungrounded_claims_are_flagged(reply, fragment):
    verdict = ok(reply)
    assert not verdict.ok
    assert any(fragment in p for p in verdict.problems), verdict.problems


def test_no_tool_results_means_any_figure_is_unsupported():
    assert not check_reply("You made $1,000.", [], []).ok
    assert check_reply("Happy to help, what would you like to know?", [], []).ok


def test_rounding_tolerance_does_not_excuse_a_wrong_figure():
    assert not ok("Revenue fell $41.00.").ok  # 41.00 is not 41.83 within a cent or rounding to the dollar


# --- through the chat service ---

@pytest.fixture
def stats():
    return run_profiling(_records(ROWS))


def test_invented_figure_from_the_cloud_model_is_replaced_by_the_grounded_answer(monkeypatch, stats):
    _anthropic(monkeypatch, [
        SimpleNamespace(stop_reason="tool_use", content=[_tool_use("a", "get_summary")]),
        SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text="You made $9,999,999.00 in total.")]),
    ])
    reply = ChatService.respond(stats, "What is my total revenue?")
    assert "9,999,999" not in reply["content"]
    assert "$2,500.00" in reply["content"]


def test_correct_cloud_answer_is_left_alone(monkeypatch, stats):
    _anthropic(monkeypatch, [
        SimpleNamespace(stop_reason="tool_use", content=[_tool_use("a", "get_summary")]),
        SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text="You've made $2,500.00 so far, nicely done.")]),
    ])
    reply = ChatService.respond(stats, "What is my total revenue?")
    assert reply["content"] == "You've made $2,500.00 so far, nicely done."
    assert "tool_results" not in reply


def test_figure_from_an_earlier_tool_call_in_the_same_turn_counts(monkeypatch, stats):
    _anthropic(monkeypatch, [
        SimpleNamespace(stop_reason="tool_use", content=[_tool_use("a", "get_summary")]),
        SimpleNamespace(stop_reason="tool_use", content=[_tool_use("b", "best_and_worst_periods", period_type="monthly")]),
        SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text="Total is $2,500.00 and your best month was 2026-05.")]),
    ])
    assert ChatService.respond(stats, "total and best month?")["content"].startswith("Total is $2,500.00")


def test_wrong_month_from_a_local_model_is_replaced(monkeypatch, stats):
    monkeypatch.setattr(settings, "LLM_PROVIDER", "ollama")
    replies = iter([
        {"role": "assistant", "content": "", "tool_calls": [{"function": {"name": "explain_change", "arguments": {"period_type": "monthly"}}}]},
        {"role": "assistant", "content": "Sales changed from December to November."},
    ])
    monkeypatch.setattr(ollama, "chat", lambda *a, **k: next(replies))
    reply = ChatService.respond(stats, "Why did sales change?")
    assert "December" not in reply["content"]
    assert "2026-05" in reply["content"]
    assert reply["query_used"] == "explain_change"


def test_verification_failure_is_logged(monkeypatch, stats, caplog):
    _anthropic(monkeypatch, [
        SimpleNamespace(stop_reason="tool_use", content=[_tool_use("a", "get_summary")]),
        SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text="Revenue is $123.45.")]),
    ])
    with caplog.at_level("WARNING", logger="sage.chat"):
        ChatService.respond(stats, "revenue?")
    assert "failed verification" in caplog.text and "$123.45" in caplog.text
