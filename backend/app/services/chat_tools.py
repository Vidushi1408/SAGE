"""
Read-only "tools" the chat agent can call to answer questions about a workspace's
computed statistics. Deliberately NOT a text-to-pandas/eval interface: every tool
is a fixed, parameterized function over the already-computed_stats JSON, so the
model can only ever read data shapes we control -- never execute arbitrary code.
"""
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

TOOL_DEFINITIONS = [
    {
        "name": "get_summary",
        "description": "Get the overall revenue summary: total revenue, total transactions, average transaction value.",
        "input_schema": {"type": "object", "properties": {}}
    },
    {
        "name": "get_category_breakdown",
        "description": "Get revenue/volume broken down by product/transaction category, including each category's share of total revenue.",
        "input_schema": {"type": "object", "properties": {}}
    },
    {
        "name": "get_period_metrics",
        "description": "Get revenue, transaction count, and growth % for each period, at daily, weekly, or monthly granularity.",
        "input_schema": {
            "type": "object",
            "properties": {
                "period": {"type": "string", "enum": ["daily", "weekly", "monthly"], "description": "Which granularity to return."}
            },
            "required": ["period"]
        }
    },
    {
        "name": "get_metrics_for_date",
        "description": "Get revenue, transaction count, and day-over-day change for one specific calendar date -- use this for questions about what happened on a particular day (e.g. 'why did sales drop last Tuesday').",
        "input_schema": {
            "type": "object",
            "properties": {
                "date": {"type": "string", "description": "Date in YYYY-MM-DD format."}
            },
            "required": ["date"]
        }
    },
    {
        "name": "list_anomalies",
        "description": "List flagged anomalous transactions (outliers, refunds), optionally filtered to a minimum absolute amount.",
        "input_schema": {
            "type": "object",
            "properties": {
                "min_amount": {"type": "number", "description": "Only return anomalies with |amount| >= this value."}
            }
        }
    },
    {
        "name": "explain_change",
        "description": "Explain WHY revenue moved between two periods: returns the revenue change split into volume vs average-ticket effects, which categories and payment methods contributed most to the change, and any anomalies/refunds in the periods. Use this for 'why did sales drop/rise' questions. Omit period/compare_to to explain the most recent period versus the one before it.",
        "input_schema": {
            "type": "object",
            "properties": {
                "period_type": {"type": "string", "enum": ["daily", "weekly", "monthly"]},
                "period": {"type": "string", "description": "Period to explain (e.g. '2026-05' or '2026-05-14'). Defaults to the latest."},
                "compare_to": {"type": "string", "description": "Period to compare against. Defaults to the one immediately before `period`."}
            },
            "required": ["period_type"]
        }
    },
    {
        "name": "get_driver_trend",
        "description": "Show how ONE category or payment method has performed over time (revenue and transactions per period, plus its overall change). Use for 'how is Coffee doing', 'is cash use growing', 'trend for the Bakery category'.",
        "input_schema": {
            "type": "object",
            "properties": {
                "dimension": {"type": "string", "enum": ["category", "payment_method"]},
                "name": {"type": "string", "description": "The category or payment method name, e.g. 'Coffee' or 'Card'."},
                "period_type": {"type": "string", "enum": ["daily", "weekly", "monthly"]}
            },
            "required": ["dimension", "name", "period_type"]
        }
    },
    {
        "name": "best_and_worst_periods",
        "description": "Find the highest- and lowest-revenue periods (day, week or month) and the average, to answer 'what was my best month', 'worst day', 'how do I compare to my average'.",
        "input_schema": {
            "type": "object",
            "properties": {"period_type": {"type": "string", "enum": ["daily", "weekly", "monthly"]}},
            "required": ["period_type"]
        }
    },
    {
        "name": "forecast_next_period",
        "description": "Project revenue for the NEXT period by extending the recent linear trend. A rough projection, not a guarantee: the result states how many periods it is based on and how well the trend fits. Use for 'what will next month look like', 'where am I heading'.",
        "input_schema": {
            "type": "object",
            "properties": {"period_type": {"type": "string", "enum": ["daily", "weekly", "monthly"]}},
            "required": ["period_type"]
        }
    },
    {
        "name": "compare_periods",
        "description": "Compare revenue and transaction count between two specific periods (e.g. two months, two weeks, or two days).",
        "input_schema": {
            "type": "object",
            "properties": {
                "period_type": {"type": "string", "enum": ["daily", "weekly", "monthly"]},
                "period_a": {"type": "string", "description": "Label of the first period, e.g. '2026-05', '2026-W20', or '2026-05-14'."},
                "period_b": {"type": "string", "description": "Label of the second period."}
            },
            "required": ["period_type", "period_a", "period_b"]
        }
    }
]


class ChatTools:
    """Bound to one workspace's latest computed_stats payload for the duration of a chat turn."""

    def __init__(self, computed_stats: Dict[str, Any]):
        self.stats = computed_stats or {}

    def get_summary(self) -> Dict[str, Any]:
        return self.stats.get("summary", {})

    def get_category_breakdown(self) -> Dict[str, Any]:
        return self.stats.get("category_metrics", {})

    def get_period_metrics(self, period: str) -> List[Dict[str, Any]]:
        return self.stats.get("period_metrics", {}).get(period, [])

    def list_anomalies(self, min_amount: Optional[float] = None) -> List[Dict[str, Any]]:
        anomalies = self.stats.get("anomalies", [])
        if min_amount is None:
            return anomalies
        return [a for a in anomalies if abs(a.get("amount", 0)) >= min_amount]

    def get_metrics_for_date(self, date: str) -> Dict[str, Any]:
        daily = self.stats.get("period_metrics", {}).get("daily", [])
        entry = next((d for d in daily if d.get("date") == date), None)
        if not entry:
            available = [d.get("date") for d in daily]
            return {"error": f"No data found for {date}. Available dates: {available[:10]}{'...' if len(available) > 10 else ''}"}
        return entry

    PERIOD_KEYS = {"monthly": "month", "weekly": "week", "daily": "date"}
    TOP_DRIVERS = 3

    def _driver_deltas(self, dimension: str, period_type: str, period: str, base: str, total_change: float) -> List[Dict[str, Any]]:
        rows = self.stats.get("drivers", {}).get(dimension, {}).get(period_type, [])
        current = {r["name"]: r for r in rows if r["period"] == period}
        previous = {r["name"]: r for r in rows if r["period"] == base}
        deltas = []
        for name in set(current) | set(previous):
            cur = current.get(name, {}).get("revenue", 0.0)
            prev = previous.get(name, {}).get("revenue", 0.0)
            change = round(cur - prev, 2)
            if change == 0:
                continue
            deltas.append({
                "name": name,
                "revenue": cur,
                "previous_revenue": prev,
                "change": change,
                "share_of_total_change_pct": round(change / total_change * 100, 1) if total_change else None,
            })
        # Largest movers first, whichever direction they moved
        deltas.sort(key=lambda d: abs(d["change"]), reverse=True)
        return deltas[: self.TOP_DRIVERS]

    def explain_change(self, period_type: str, period: Optional[str] = None, compare_to: Optional[str] = None) -> Dict[str, Any]:
        key = self.PERIOD_KEYS.get(period_type)
        if not key:
            return {"error": f"Unknown period_type: {period_type}"}
        periods = self.stats.get("period_metrics", {}).get(period_type, [])
        labels = [p.get(key) for p in periods]

        if period is None:
            if len(periods) < 2:
                return {"error": f"Need at least two {period_type} periods to explain a change."}
            period = labels[-1]
        if period not in labels:
            return {"error": f"No {period_type} data for {period}. Available: {labels[-10:]}"}
        if compare_to is None:
            idx = labels.index(period)
            if idx == 0:
                return {"error": f"{period} is the first {period_type} period, so there is nothing earlier to compare against."}
            compare_to = labels[idx - 1]
        if compare_to not in labels:
            return {"error": f"No {period_type} data for {compare_to}. Available: {labels[-10:]}"}

        cur = periods[labels.index(period)]
        prev = periods[labels.index(compare_to)]
        change = round(cur["revenue"] - prev["revenue"], 2)
        change_pct = round(change / prev["revenue"] * 100, 2) if prev["revenue"] else None

        # Split the change into "more/fewer sales" vs "bigger/smaller sales":
        # volume effect uses the old ticket size, ticket effect uses the new volume.
        prev_ticket = prev["revenue"] / prev["transactions"] if prev["transactions"] else 0.0
        cur_ticket = cur["revenue"] / cur["transactions"] if cur["transactions"] else 0.0
        volume_effect = round((cur["transactions"] - prev["transactions"]) * prev_ticket, 2)
        ticket_effect = round(change - volume_effect, 2)

        anomalies = [a for a in self.stats.get("anomalies", []) if self._in_period(a.get("date", ""), period_type, period)]

        return {
            "period": period,
            "compared_to": compare_to,
            "revenue": cur["revenue"],
            "previous_revenue": prev["revenue"],
            "revenue_change": change,
            "revenue_change_pct": change_pct,
            "transactions": cur["transactions"],
            "previous_transactions": prev["transactions"],
            "avg_ticket": round(cur_ticket, 2),
            "previous_avg_ticket": round(prev_ticket, 2),
            "volume_effect": volume_effect,
            "ticket_size_effect": ticket_effect,
            "top_category_drivers": self._driver_deltas("category", period_type, period, compare_to, change),
            "top_payment_method_drivers": self._driver_deltas("payment_method", period_type, period, compare_to, change),
            "anomalies_in_period": anomalies[:5],
        }

    FORECAST_WINDOW = 6
    FORECAST_MIN_PERIODS = 3

    def best_and_worst_periods(self, period_type: str) -> Dict[str, Any]:
        key = self.PERIOD_KEYS.get(period_type)
        if not key:
            return {"error": f"Unknown period_type: {period_type}"}
        periods = self.stats.get("period_metrics", {}).get(period_type, [])
        if not periods:
            return {"error": f"No {period_type} data available."}
        best = max(periods, key=lambda p: p["revenue"])
        worst = min(periods, key=lambda p: p["revenue"])
        average = sum(p["revenue"] for p in periods) / len(periods)
        latest = periods[-1]
        return {
            "period_type": period_type,
            "periods_analysed": len(periods),
            "best": {"period": best[key], "revenue": best["revenue"], "transactions": best["transactions"]},
            "worst": {"period": worst[key], "revenue": worst["revenue"], "transactions": worst["transactions"]},
            "average_revenue": round(average, 2),
            "latest": {"period": latest[key], "revenue": latest["revenue"],
                       "vs_average_pct": round((latest["revenue"] - average) / average * 100, 1) if average else None},
            "note": "The most recent period may be only partly complete, which can make it look like the worst.",
        }

    def get_driver_trend(self, dimension: str, name: str, period_type: str) -> Dict[str, Any]:
        if dimension not in ("category", "payment_method"):
            return {"error": f"Unknown dimension: {dimension}"}
        if period_type not in self.PERIOD_KEYS:
            return {"error": f"Unknown period_type: {period_type}"}
        rows = self.stats.get("drivers", {}).get(dimension, {}).get(period_type, [])
        names = sorted({r["name"] for r in rows})
        match = next((n for n in names if n.lower() == name.strip().lower()), None)
        if match is None:
            hint = f"Available: {names}" if names else f"No {dimension} breakdown exists in this data."
            return {"error": f"No {dimension} called '{name}'. {hint}"}
        series = sorted(
            ({"period": r["period"], "revenue": r["revenue"], "transactions": r["transactions"]}
             for r in rows if r["name"] == match),
            key=lambda r: r["period"],
        )
        first, last = series[0], series[-1]
        change = round(last["revenue"] - first["revenue"], 2)
        return {
            "dimension": dimension,
            "name": match,
            "period_type": period_type,
            "series": series,
            "first_period": first["period"],
            "last_period": last["period"],
            "change": change,
            "change_pct": round(change / first["revenue"] * 100, 1) if first["revenue"] else None,
            "note": "Periods where this had no sales are omitted.",
        }

    @staticmethod
    def _next_label(period_type: str, last_label: str) -> Optional[str]:
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

    @staticmethod
    def _period_position(period_type: str, label: str) -> Optional[int]:
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

    def forecast_next_period(self, period_type: str) -> Dict[str, Any]:
        key = self.PERIOD_KEYS.get(period_type)
        if not key:
            return {"error": f"Unknown period_type: {period_type}"}
        periods = self.stats.get("period_metrics", {}).get(period_type, [])
        if len(periods) < self.FORECAST_MIN_PERIODS:
            return {"error": f"Need at least {self.FORECAST_MIN_PERIODS} {period_type} periods to project a trend; only {len(periods)} available."}
        window = periods[-self.FORECAST_WINDOW:]
        ys = [p["revenue"] for p in window]
        n = len(ys)
        positions = [self._period_position(period_type, p[key]) for p in window]
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
            "projected_period": self._next_label(period_type, window[-1][key]),
            "projected_revenue": round(projected, 2),
            "last_period": window[-1][key],
            "last_period_revenue": window[-1]["revenue"],
            "trend_per_period": round(slope, 2),
            "based_on_periods": [p[key] for p in window],
            "trend_fit": fit,
            "r_squared": r_squared,
            "caveat": "A straight-line projection from recent history only; it ignores seasonality, promotions and anything not in the data. "
                      "The latest period may be incomplete, which pulls the projection down.",
        }

    @staticmethod
    def _in_period(date: str, period_type: str, period: str) -> bool:
        if period_type == "daily":
            return date == period
        if period_type == "monthly":
            return date.startswith(period)
        # Weekly labels look like "2026-05-11/2026-05-17"
        start, _, end = period.partition("/")
        return bool(end) and start <= date <= end

    def compare_periods(self, period_type: str, period_a: str, period_b: str) -> Dict[str, Any]:
        key = {"monthly": "month", "weekly": "week", "daily": "date"}[period_type]
        periods = self.stats.get("period_metrics", {}).get(period_type, [])
        a = next((p for p in periods if p.get(key) == period_a), None)
        b = next((p for p in periods if p.get(key) == period_b), None)

        if not a or not b:
            return {"error": f"Could not find both periods. Available: {[p.get(key) for p in periods]}"}

        return {
            period_a: a,
            period_b: b,
            "revenue_change_pct": (
                round(((a["revenue"] - b["revenue"]) / b["revenue"]) * 100, 2)
                if b.get("revenue") else None
            )
        }

    def call(self, tool_name: str, tool_input: Dict[str, Any]) -> Any:
        dispatch = {
            "get_summary": self.get_summary,
            "get_category_breakdown": self.get_category_breakdown,
            "get_period_metrics": self.get_period_metrics,
            "get_metrics_for_date": self.get_metrics_for_date,
            "list_anomalies": self.list_anomalies,
            "compare_periods": self.compare_periods,
            "explain_change": self.explain_change,
            "get_driver_trend": self.get_driver_trend,
            "best_and_worst_periods": self.best_and_worst_periods,
            "forecast_next_period": self.forecast_next_period,
        }
        fn = dispatch.get(tool_name)
        if not fn:
            return {"error": f"Unknown tool: {tool_name}"}
        try:
            return fn(**tool_input)
        except TypeError as e:
            return {"error": f"Invalid arguments for {tool_name}: {e}"}
