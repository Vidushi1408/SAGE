"""
Straight-line projection of the next period's revenue from recent finished periods.

One implementation shared by the chat tool (so answers can cite it) and the profiler (so charts can draw it),
which guarantees the dashboard and the chat never disagree.
"""
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

PERIOD_KEYS = {"monthly": "month", "weekly": "week", "daily": "date"}
FORECAST_WINDOW = 6
FORECAST_MIN_PERIODS = 3
CAVEAT = "A straight-line projection from recent finished periods only; it ignores seasonality, promotions and anything not in the data."


def next_label(period_type: str, last_label: str) -> Optional[str]:
    try:
        if period_type == "daily":
            return (datetime.strptime(last_label, "%Y-%m-%d").date() + timedelta(days=1)).isoformat()
        if period_type == "monthly":
            year, month = (int(x) for x in last_label.split("-"))
            return f"{year + month // 12}-{month % 12 + 1:02d}"
        _, _, end = last_label.partition("/")
        start = date.fromisoformat(end) + timedelta(days=1)
        return f"{start.isoformat()}/{(start + timedelta(days=6)).isoformat()}"
    except ValueError:
        return None


def period_position(period_type: str, label: str) -> Optional[int]:
    """Calendar position of a period, so quiet periods missing from the data still count as time passing."""
    try:
        if period_type == "daily":
            return date.fromisoformat(label).toordinal()
        if period_type == "monthly":
            year, month = (int(x) for x in label.split("-"))
            return year * 12 + month
        return date.fromisoformat(label.partition("/")[0]).toordinal() // 7
    except ValueError:
        return None


def project_next_period(period_type: str, all_periods: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Returns the projection, or {"error": ...} when there isn't enough finished history."""
    key = PERIOD_KEYS.get(period_type)
    if not key:
        return {"error": f"Unknown period_type: {period_type}"}
    # Fit on finished periods only; an in-progress one would drag the projection down.
    periods = [p for p in all_periods if p.get("is_complete", True)]
    if len(periods) < FORECAST_MIN_PERIODS:
        return {"error": f"Need at least {FORECAST_MIN_PERIODS} complete {period_type} periods to project a trend; only {len(periods)} available."}
    window = periods[-FORECAST_WINDOW:]
    ys = [p["revenue"] for p in window]
    n = len(ys)
    positions = [period_position(period_type, p[key]) for p in window]
    xs = positions if None not in positions else list(range(n))
    next_x = xs[-1] + 1
    mean_x, mean_y = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mean_x) ** 2 for x in xs)
    slope = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys)) / sxx
    intercept = mean_y - slope * mean_x
    ss_tot = sum((y - mean_y) ** 2 for y in ys)
    ss_res = sum((y - (intercept + slope * x)) ** 2 for x, y in zip(xs, ys))
    r_squared = round(1 - ss_res / ss_tot, 2) if ss_tot else 1.0
    projected = max(0.0, intercept + slope * next_x)
    fit = "strong" if r_squared >= 0.7 else "moderate" if r_squared >= 0.4 else "weak"
    return {
        "period_type": period_type,
        "projected_period": next_label(period_type, window[-1][key]),
        "projected_revenue": round(projected, 2),
        "last_period": window[-1][key],
        "last_period_revenue": window[-1]["revenue"],
        "trend_per_period": round(slope, 2),
        "based_on_periods": [p[key] for p in window],
        "trend_fit": fit,
        "r_squared": r_squared,
        "caveat": CAVEAT,
    }
