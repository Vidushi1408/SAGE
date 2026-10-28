import calendar

import pytest

from app.analytics.profiler import run_profiling
from app.core.config import settings
from app.services.ai import AIService
from app.services.chat import ChatService
from app.services.chat_tools import ChatTools
from tests.test_explain_change import _records


def month_rows(year, month, coffee_days, through_day=None):
    """Bakery sells every day through `through_day` (so the data spans that far); Coffee sells on `coffee_days` days."""
    last = through_day or calendar.monthrange(year, month)[1]
    rows = [{"Date": f"{year}-{month:02d}-{d:02d}", "Amount": 5, "Category": "Bakery", "Payment Method": "Cash"} for d in range(1, last + 1)]
    rows += [{"Date": f"{year}-{month:02d}-{d:02d}", "Amount": 20, "Category": "Coffee", "Payment Method": "Card"} for d in range(1, coffee_days + 1)]
    return rows


# Coffee: Jul 3 sales, Aug 9, Sep 11 (finished months, rising), then only 2 days of October (it stops mid-week).
ROWS = (month_rows(2026, 7, 3) + month_rows(2026, 8, 9) + month_rows(2026, 9, 11) + month_rows(2026, 10, 1, through_day=2))  # data stops Fri 2 Oct, mid-week


@pytest.fixture(autouse=True)
def mock_provider(monkeypatch):
    monkeypatch.setattr(settings, "LLM_PROVIDER", "mock")


@pytest.fixture
def stats():
    return run_profiling(_records(ROWS))


# --- profiler ---

def test_profiler_flags_the_unfinished_trailing_month(stats):
    monthly = {m["month"]: m for m in stats["period_metrics"]["monthly"]}
    assert [monthly[k]["is_complete"] for k in ("2026-07", "2026-08", "2026-09", "2026-10")] == [True, True, True, False]
    assert monthly["2026-10"]["days_covered"] == 2 and monthly["2026-10"]["days_in_period"] == 31


def test_growth_is_only_calculated_between_finished_periods(stats):
    monthly = {m["month"]: m for m in stats["period_metrics"]["monthly"]}
    assert monthly["2026-08"]["growth_pct"] is not None and monthly["2026-09"]["growth_pct"] is not None
    assert monthly["2026-10"]["growth_pct"] is None  # October vs September would read as a ~90% collapse


def test_unfinished_first_period_blocks_growth_into_the_second():
    january = [r for r in month_rows(2026, 1, 2) if r["Date"] >= "2026-01-15"]  # the file starts on 15 Jan
    rows = january + month_rows(2026, 2, 3) + month_rows(2026, 3, 3)
    monthly = {m["month"]: m for m in run_profiling(_records(rows))["period_metrics"]["monthly"]}
    assert monthly["2026-01"]["is_complete"] is False
    assert monthly["2026-02"]["growth_pct"] is None
    assert monthly["2026-03"]["growth_pct"] is not None


def test_a_closed_last_day_does_not_make_the_week_look_unfinished():
    # Mon 2026-05-04 .. Sat 05-09 trading, closed Sunday 05-10, then more trading the week after.
    dates = [f"2026-05-{d:02d}" for d in (4, 5, 6, 7, 8, 9, 11, 12)]
    weeks = {w["week"]: w for w in run_profiling(_records([{"Date": d, "Amount": 10} for d in dates]))["period_metrics"]["weekly"]}
    assert weeks["2026-05-04/2026-05-10"]["is_complete"] is True


# --- chat tools ---

def test_explain_change_defaults_to_the_latest_finished_month(stats):
    r = ChatTools(stats).explain_change("monthly")
    assert (r["period"], r["compared_to"]) == ("2026-09", "2026-08")
    assert any("2026-10 is still in progress" in n for n in r["notes"])


def test_explain_change_warns_when_asked_about_the_partial_month_directly(stats):
    r = ChatTools(stats).explain_change("monthly", period="2026-10", compare_to="2026-09")
    assert any("2026-10 is not a complete" in n and "2 of 31 days" in n for n in r["notes"])


def test_explain_change_works_on_stats_saved_before_the_flag_existed(stats):
    for group in stats["period_metrics"].values():
        for p in group:
            for k in ("is_complete", "days_covered", "days_in_period"):
                p.pop(k, None)
    r = ChatTools(stats).explain_change("monthly")
    assert (r["period"], r["compared_to"]) == ("2026-10", "2026-09") and r["notes"] == []


def test_forecast_uses_finished_months_only_and_projects_the_current_one(stats):
    r = ChatTools(stats).forecast_next_period("monthly")
    assert r["based_on_periods"] == ["2026-07", "2026-08", "2026-09"]
    assert r["projected_period"] == "2026-10"
    assert r["projected_revenue"] > r["last_period_revenue"]  # an upward trend, not dragged down by 2 days of October
    assert r["in_progress"]["period"] == "2026-10" and r["in_progress"]["days_covered"] == 2


def test_forecast_needs_three_finished_periods():
    rows = month_rows(2026, 1, 2) + month_rows(2026, 2, 2) + month_rows(2026, 3, 1, through_day=5)
    assert "complete" in ChatTools(run_profiling(_records(rows))).forecast_next_period("monthly")["error"]


def test_best_and_worst_ignore_the_unfinished_month(stats):
    r = ChatTools(stats).best_and_worst_periods("monthly")
    assert r["worst"]["period"] == "2026-07" and r["best"]["period"] == "2026-09"
    assert r["periods_analysed"] == 3
    assert r["in_progress"]["period"] == "2026-10"


def test_best_and_worst_when_nothing_is_finished():
    r = ChatTools(run_profiling(_records(month_rows(2026, 1, 1, through_day=5)))).best_and_worst_periods("monthly")
    assert "partial" in r["note"] and r["worst"]["period"] == "2026-01"


def test_driver_trend_does_not_call_a_partial_month_a_collapse_or_a_win(stats):
    r = ChatTools(stats).get_driver_trend("category", "Coffee", "monthly")
    assert [pt["is_complete"] for pt in r["series"]] == [True, True, True, False]
    assert (r["first_period"], r["last_period"]) == ("2026-07", "2026-09")
    assert r["change"] == 160.0  # 60 -> 220
    assert r["latest_vs_previous"]["period"] == "2026-09" and r["latest_vs_previous"]["compared_to"] == "2026-08"
    assert r["peak"]["period"] == "2026-09"
    assert r["in_progress"] == {"period": "2026-10", "revenue_so_far": 20.0}


def test_driver_trend_with_a_single_finished_period_reports_no_change():
    rows = month_rows(2026, 1, 2) + month_rows(2026, 2, 1, through_day=4)
    r = ChatTools(run_profiling(_records(rows))).get_driver_trend("category", "Coffee", "monthly")
    assert r["change"] is None and "Fewer than two" in r["note"]


def test_compare_periods_warns_about_an_unfinished_side(stats):
    r = ChatTools(stats).compare_periods("monthly", "2026-10", "2026-09")
    assert len(r["warnings"]) == 1 and "2026-10" in r["warnings"][0]
    assert ChatTools(stats).compare_periods("monthly", "2026-09", "2026-08")["warnings"] == []


# --- what the user is told ---

def test_chat_trend_answer_mentions_the_month_in_progress(stats):
    text = ChatService.respond(stats, "How is Coffee doing?")["content"]
    assert "up $160.00" in text and "2026-10 is still in progress" in text
    assert "down" not in text


def test_chat_best_month_answer_leaves_out_the_partial_month(stats):
    text = ChatService.respond(stats, "what was my best month?")["content"]
    assert "2026-09" in text and "still in progress" in text


def test_chat_why_question_explains_a_finished_month(stats):
    text = ChatService.respond(stats, "Why did sales change last month?")["content"]
    assert "2026-09 versus 2026-08" in text


def test_a_week_ending_one_day_after_the_data_still_counts_as_finished():
    # Data runs to Sat 3 Oct; the week ends Sun 4 Oct. Shops closed on Sundays shouldn't look permanently unfinished.
    rows = month_rows(2026, 9, 1) + month_rows(2026, 10, 1, through_day=3)
    weeks = {w["week"]: w for w in run_profiling(_records(rows))["period_metrics"]["weekly"]}
    assert weeks["2026-09-28/2026-10-04"]["is_complete"] is True


def test_chat_latest_month_answer_separates_full_and_current(stats):
    text = ChatService.respond(stats, "how was the last month?")["content"]
    assert "most recent full month (2026-09)" in text and "2026-10" in text and "in progress" in text


def test_insights_text_does_not_compare_the_unfinished_week(stats):
    text = AIService.generate_insights(stats)["insights"][0]["explanation"]
    assert "in progress" in text
    assert "most recent full week" in text


def test_forecast_answer_says_when_it_switches_granularity_and_reads_naturally():
    # Only two finished months, so "next month" falls back to weeks.
    rows = month_rows(2026, 8, 5) + month_rows(2026, 9, 8) + month_rows(2026, 10, 1, through_day=12)
    text = ChatService.respond(run_profiling(_records(rows)), "What will next month look like?")["content"]
    assert "aren't enough finished months" in text and "next week" in text
    assert "a upward" not in text


def test_forecast_answer_describes_the_period_already_under_way(stats):
    text = ChatService.respond(stats, "What will next month look like?")["content"]
    assert "(2026-10)" in text and "already under way" in text and "$30.00 so far" in text
    assert "isn't counted" not in text


# --- the stored forecast the charts draw ---

def test_profile_stores_the_same_forecast_the_chat_tool_reports(stats):
    stored = stats["forecast"]["monthly"]
    tool = ChatTools(stats).forecast_next_period("monthly")
    assert stored["projected_period"] == tool["projected_period"] == "2026-10"
    assert stored["projected_revenue"] == tool["projected_revenue"]
    assert "in_progress" not in stored  # chart data only; the tool adds the in-progress note


def test_profile_forecast_is_absent_when_history_is_too_short():
    rows = month_rows(2026, 1, 2) + month_rows(2026, 2, 2)
    forecast = run_profiling(_records(rows))["forecast"]
    assert forecast["monthly"] is None  # two months aren't enough to project a trend
    assert set(forecast) == {"weekly", "monthly"}


def test_insight_chart_leaves_out_the_unfinished_week(stats):
    weekly = stats["period_metrics"]["weekly"]
    assert weekly[-1]["is_complete"] is False
    chart = AIService.generate_insights(stats)["insights"][0]["chart_data"]
    assert weekly[-1]["week"] not in [point["name"] for point in chart]
    assert chart[-1]["name"] == [w for w in weekly if w["is_complete"]][-1]["week"]
