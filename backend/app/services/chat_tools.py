"""
Read-only "tools" the chat agent can call to answer questions about a workspace's
computed statistics. Deliberately NOT a text-to-pandas/eval interface: every tool
is a fixed, parameterized function over the already-computed_stats JSON, so the
model can only ever read data shapes we control -- never execute arbitrary code.
"""
from typing import Any, Dict, List, Optional

from app.analytics.forecast import next_label, period_position, project_next_period

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

    @staticmethod
    def _is_complete(period: Dict[str, Any]) -> bool:
        # Stats computed before completeness was tracked have no flag; treat those periods as complete.
        return period.get("is_complete", True)

    def _progress_info(self, period_type: str, period: Dict[str, Any]) -> Dict[str, Any]:
        info = {"period": period[self.PERIOD_KEYS[period_type]], "revenue_so_far": period["revenue"],
                "transactions_so_far": period["transactions"]}
        if "days_covered" in period:
            info["days_covered"], info["days_in_period"] = period["days_covered"], period["days_in_period"]
        return info

    def _latest_in_progress(self, period_type: str) -> Optional[Dict[str, Any]]:
        periods = self.stats.get("period_metrics", {}).get(period_type, [])
        if periods and not self._is_complete(periods[-1]):
            return self._progress_info(period_type, periods[-1])
        return None

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
            complete = [p.get(key) for p in periods if self._is_complete(p)]
            # Prefer the latest finished period; an in-progress one would just look like a drop.
            period = complete[-1] if len(complete) >= 2 else labels[-1]
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

        notes = []
        for label, entry in ((period, cur), (compare_to, prev)):
            if not self._is_complete(entry):
                notes.append(f"{label} is not a complete {period_type[:-2] if period_type != 'daily' else 'day'} "
                             f"({entry.get('days_covered', '?')} of {entry.get('days_in_period', '?')} days of data), "
                             "so this comparison understates it.")
        in_progress = self._latest_in_progress(period_type)
        if in_progress and in_progress["period"] not in (period, compare_to):
            notes.append(f"{in_progress['period']} is still in progress and was left out.")

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
            "notes": notes,
        }


    def best_and_worst_periods(self, period_type: str) -> Dict[str, Any]:
        key = self.PERIOD_KEYS.get(period_type)
        if not key:
            return {"error": f"Unknown period_type: {period_type}"}
        periods = self.stats.get("period_metrics", {}).get(period_type, [])
        if not periods:
            return {"error": f"No {period_type} data available."}
        # Rank finished periods only: a half-finished month would always look like the worst one.
        ranked = [p for p in periods if self._is_complete(p)]
        note = None
        if not ranked:
            ranked, note = periods, f"No {period_type} period is fully covered by the data, so partial ones are ranked."
        best = max(ranked, key=lambda p: p["revenue"])
        worst = min(ranked, key=lambda p: p["revenue"])
        average = sum(p["revenue"] for p in ranked) / len(ranked)
        latest = ranked[-1]
        result = {
            "period_type": period_type,
            "periods_analysed": len(ranked),
            "best": {"period": best[key], "revenue": best["revenue"], "transactions": best["transactions"]},
            "worst": {"period": worst[key], "revenue": worst["revenue"], "transactions": worst["transactions"]},
            "average_revenue": round(average, 2),
            "latest_complete": {"period": latest[key], "revenue": latest["revenue"],
                                "vs_average_pct": round((latest["revenue"] - average) / average * 100, 1) if average else None},
            "in_progress": self._latest_in_progress(period_type),
        }
        if note:
            result["note"] = note
        return result

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

        key = self.PERIOD_KEYS[period_type]
        status = {p[key]: p for p in self.stats.get("period_metrics", {}).get(period_type, [])}
        series = sorted(
            ({"period": r["period"], "revenue": r["revenue"], "transactions": r["transactions"],
              "is_complete": self._is_complete(status.get(r["period"], {}))}
             for r in rows if r["name"] == match),
            key=lambda r: r["period"],
        )
        complete = [pt for pt in series if pt["is_complete"]]
        result: Dict[str, Any] = {
            "dimension": dimension, "name": match, "period_type": period_type, "series": series,
            "note": "Periods where this had no sales are omitted. Figures below use finished periods only.",
        }
        in_progress = next((pt for pt in series if not pt["is_complete"] and pt["period"] == (self._latest_in_progress(period_type) or {}).get("period")), None)
        if in_progress:
            result["in_progress"] = {"period": in_progress["period"], "revenue_so_far": in_progress["revenue"]}
        if len(complete) < 2:
            result.update(change=None, change_pct=None,
                          note=result["note"] + " Fewer than two finished periods, so no change is reported.")
            return result
        first, last, before_last = complete[0], complete[-1], complete[-2]
        change = round(last["revenue"] - first["revenue"], 2)
        latest_change = round(last["revenue"] - before_last["revenue"], 2)
        peak = max(complete, key=lambda pt: pt["revenue"])
        result.update(
            first_period=first["period"], last_period=last["period"],
            change=change, change_pct=round(change / first["revenue"] * 100, 1) if first["revenue"] else None,
            latest_vs_previous={
                "period": last["period"], "compared_to": before_last["period"], "change": latest_change,
                "change_pct": round(latest_change / before_last["revenue"] * 100, 1) if before_last["revenue"] else None,
            },
            peak={"period": peak["period"], "revenue": peak["revenue"]},
        )
        return result

    _next_label = staticmethod(next_label)
    _period_position = staticmethod(period_position)

    def forecast_next_period(self, period_type: str) -> Dict[str, Any]:
        result = project_next_period(period_type, self.stats.get("period_metrics", {}).get(period_type, []))
        if "error" not in result:
            result["in_progress"] = self._latest_in_progress(period_type)
        return result

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

        warnings = [f"{label} is incomplete ({p.get('days_covered', '?')} of {p.get('days_in_period', '?')} days)."
                    for label, p in ((period_a, a), (period_b, b)) if not self._is_complete(p)]
        return {
            period_a: a,
            period_b: b,
            "warnings": warnings,
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
