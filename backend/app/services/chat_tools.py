"""
Read-only "tools" the chat agent can call to answer questions about a workspace's
computed statistics. Deliberately NOT a text-to-pandas/eval interface: every tool
is a fixed, parameterized function over the already-computed_stats JSON, so the
model can only ever read data shapes we control -- never execute arbitrary code.
"""
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
        }
        fn = dispatch.get(tool_name)
        if not fn:
            return {"error": f"Unknown tool: {tool_name}"}
        try:
            return fn(**tool_input)
        except TypeError as e:
            return {"error": f"Invalid arguments for {tool_name}: {e}"}
