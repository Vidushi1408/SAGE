import json
import logging
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

import anthropic

from app.core.config import settings
from app.core.prompts import CHAT_SYSTEM_PROMPT
from app.services import ollama
from app.services.chat_tools import ChatTools, TOOL_DEFINITIONS

logger = logging.getLogger("sage.chat")

MAX_TOOL_ITERATIONS = 6  # enough to chain e.g. summary -> explain_change -> driver trend, but still bounded

# Tools whose result is naturally chartable; used to opportunistically attach
# a chart to the chat response, in the same {title, chart_type, chart_data} shape
# the Overview tab's insight cards already use.
CHARTABLE_TOOLS = {"get_period_metrics", "get_category_breakdown"}

WEEKDAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
DATE_PATTERN = re.compile(r"\d{4}-\d{2}-\d{2}")


class ChatService:
    @classmethod
    def respond(
        cls,
        computed_stats: Dict[str, Any],
        user_message: str,
        history: Optional[List[Dict[str, str]]] = None
    ) -> Dict[str, Any]:
        """
        Answer a user's question about their workspace's computed stats.
        Falls back to a deterministic keyword-matched mock when ANTHROPIC_API_KEY is unset.
        Returns {"content": str, "chart": {...} | None, "query_used": str | None, "query_result": Any | None}
        """
        tools = ChatTools(computed_stats)

        provider = settings.active_llm
        if provider == "mock":
            return cls._mock_respond(tools, user_message)

        try:
            if provider == "ollama":
                return cls._ollama_respond(tools, user_message, history or [])
            return cls._agent_respond(tools, user_message, history or [])
        except Exception as e:
            logger.error(f"Chat agent failed: {str(e)}", exc_info=True)
            return {
                "content": "I ran into an error looking that up. Please try rephrasing your question.",
                "chart": None,
                "query_used": None,
                "query_result": None,
                "tools_used": [],
            }

    @classmethod
    def _agent_respond(cls, tools: ChatTools, user_message: str, history: List[Dict[str, str]]) -> Dict[str, Any]:
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

        messages: List[Dict[str, Any]] = list(history) + [{"role": "user", "content": user_message}]

        last_tool_name = None
        last_tool_input = None
        last_tool_result = None
        used: List[str] = []

        for _ in range(MAX_TOOL_ITERATIONS):
            response = client.messages.create(
                model=settings.ANTHROPIC_MODEL,
                max_tokens=1024,
                system=CHAT_SYSTEM_PROMPT,
                tools=TOOL_DEFINITIONS,
                messages=messages
            )

            if response.stop_reason != "tool_use":
                text = "".join(block.text for block in response.content if block.type == "text")
                chart = cls._build_chart(last_tool_name, last_tool_result)
                return {
                    "content": text.strip() or "I don't have a clear answer for that yet.",
                    "chart": chart,
                    "query_used": last_tool_name,
                    "query_result": last_tool_result,
                    "tools_used": used,
                }

            # Execute every tool_use block, append results, and loop back to the model
            messages.append({"role": "assistant", "content": response.content})
            tool_results = []

            for block in response.content:
                if block.type != "tool_use":
                    continue
                last_tool_name = block.name
                last_tool_input = block.input
                last_tool_result = tools.call(block.name, block.input)
                cls._note_tool(used, block.name)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": json.dumps(last_tool_result, default=str)
                })

            messages.append({"role": "user", "content": tool_results})

        return {
            "content": "I looked into a few angles on this but couldn't settle on a confident answer. Could you narrow the question down?",
            "chart": None,
            "query_used": last_tool_name,
            "query_result": last_tool_result,
            "tools_used": used,
        }

    @staticmethod
    def _note_tool(used: List[str], name: Optional[str]) -> None:
        if name and name not in used:
            used.append(name)

    @classmethod
    def _ollama_respond(cls, tools: ChatTools, user_message: str, history: List[Dict[str, str]]) -> Dict[str, Any]:
        """
        Local-LLM tool loop. The model may only answer from tool results; if it never calls a tool
        (small models sometimes skip it) we use the deterministic router so the answer is always
        grounded, and if Ollama is unreachable we fall back to the deterministic answer too.
        """
        try:
            messages: List[Dict[str, Any]] = [{"role": "system", "content": CHAT_SYSTEM_PROMPT}]
            messages += [{"role": h["role"], "content": h["content"]} for h in history[-6:]]
            messages.append({"role": "user", "content": user_message})
            tool_specs = ollama.to_ollama_tools(TOOL_DEFINITIONS)

            last_name = last_result = None
            used: List[str] = []
            for _ in range(MAX_TOOL_ITERATIONS):
                reply = ollama.chat(messages, tools=tool_specs)
                calls = reply.get("tool_calls") or []
                if not calls:
                    if last_name is None:
                        return cls._mock_respond(tools, user_message)
                    text = (reply.get("content") or "").strip()
                    return {"content": text or "I don't have a clear answer for that yet.",
                            "chart": cls._build_chart(last_name, last_result),
                            "query_used": last_name, "query_result": last_result, "tools_used": used}
                messages.append(reply)
                for call in calls:
                    fn = call.get("function", {})
                    last_name = fn.get("name")
                    args = fn.get("arguments") or {}
                    last_result = tools.call(last_name, args if isinstance(args, dict) else {})
                    cls._note_tool(used, last_name)
                    messages.append({"role": "tool", "content": json.dumps(last_result, default=str)})
            return cls._mock_respond(tools, user_message)
        except Exception as e:
            logger.error(f"Ollama chat failed, using deterministic answer: {e}")
            return cls._mock_respond(tools, user_message)

    @classmethod
    def _build_chart(cls, tool_name: Optional[str], tool_result: Any) -> Optional[Dict[str, Any]]:
        if tool_name not in CHARTABLE_TOOLS or not tool_result:
            return None

        if tool_name == "get_period_metrics" and isinstance(tool_result, list) and tool_result:
            first = tool_result[0]
            key = "month" if "month" in first else ("week" if "week" in first else "date")
            return {
                "title": "Revenue Trend",
                "chart_type": "area",
                "chart_data": [{"name": p[key], "value": p["revenue"]} for p in tool_result]
            }

        if tool_name == "get_category_breakdown" and isinstance(tool_result, dict):
            top = tool_result.get("top_categories", [])
            if top:
                return {
                    "title": "Category Breakdown",
                    "chart_type": "pie",
                    "chart_data": [{"name": c["category"], "value": c["revenue"]} for c in top]
                }

        return None

    @classmethod
    def _resolve_date_from_message(cls, tools: ChatTools, msg: str) -> Optional[str]:
        """Best-effort match of an explicit date or a weekday name (most recent occurrence) in the message."""
        explicit = DATE_PATTERN.search(msg)
        if explicit:
            return explicit.group(0)

        daily = tools.get_period_metrics("daily")
        if not daily:
            return None

        for weekday_name in WEEKDAY_NAMES:
            if weekday_name in msg:
                target_weekday = WEEKDAY_NAMES.index(weekday_name)
                for entry in reversed(daily):
                    entry_date = datetime.strptime(entry["date"], "%Y-%m-%d")
                    if entry_date.weekday() == target_weekday:
                        return entry["date"]

        return None

    @classmethod
    def _explain_text(cls, r: Dict[str, Any]) -> str:
        if "error" in r:
            return r["error"]
        direction = "rose" if r["revenue_change"] >= 0 else "fell"
        pct = f" ({r['revenue_change_pct']:+.1f}%)" if r["revenue_change_pct"] is not None else ""
        text = (
            f"Revenue {direction} ${abs(r['revenue_change']):,.2f}{pct} in {r['period']} versus {r['compared_to']} "
            f"(${r['previous_revenue']:,.2f} to ${r['revenue']:,.2f}). "
        )
        vol, tick = r["volume_effect"], r["ticket_size_effect"]
        main = "the number of sales" if abs(vol) >= abs(tick) else "the average sale size"
        text += (
            f"Transactions went from {r['previous_transactions']} to {r['transactions']} and the average sale from "
            f"${r['previous_avg_ticket']:,.2f} to ${r['avg_ticket']:,.2f}, so the change came mostly from {main}. "
        )
        cats = r["top_category_drivers"]
        if cats:
            c = cats[0]
            text += f"The biggest category mover was '{c['name']}' ({c['change']:+,.2f}). "
        pays = r["top_payment_method_drivers"]
        if pays:
            text += f"By payment method, '{pays[0]['name']}' moved most ({pays[0]['change']:+,.2f}). "
        if r["anomalies_in_period"]:
            a = max(r["anomalies_in_period"], key=lambda x: abs(x["amount"]))
            text += f"Note a flagged anomaly of ${a['amount']:,.2f} on {a['date']} ({a['reason']}). "
        return text.strip() + " These are contributing factors visible in your data, not proven causes."

    @classmethod
    def _mock_respond(cls, tools: ChatTools, user_message: str) -> Dict[str, Any]:
        result = cls._route_mock(tools, user_message)
        result["tools_used"] = [result["query_used"]] if result.get("query_used") else []
        return result

    @staticmethod
    def _period_from_message(msg: str, default: str = "weekly") -> str:
        if "month" in msg:
            return "monthly"
        if re.search(r"\bday\b|\bdaily\b|yesterday|today", msg):
            return "daily"
        if "week" in msg:
            return "weekly"
        return default

    @staticmethod
    def _first_working(period_type: str, call) -> tuple:
        """Try the requested granularity, then the others, until one has enough data."""
        order = [period_type] + [p for p in ("monthly", "weekly", "daily") if p != period_type]
        result: Dict[str, Any] = {"error": "No data available."}
        for candidate in order:
            result = call(candidate)
            if "error" not in result:
                return candidate, result
        return period_type, result

    @classmethod
    def _forecast_text(cls, r: Dict[str, Any]) -> str:
        if "error" in r:
            return r["error"]
        unit = {"daily": "day", "weekly": "week", "monthly": "month"}[r["period_type"]]
        direction = "upward" if r["trend_per_period"] > 0 else "downward" if r["trend_per_period"] < 0 else "flat"
        return (
            f"If the recent trend continues, the next {unit} ({r['projected_period']}) lands around "
            f"${r['projected_revenue']:,.2f}, versus ${r['last_period_revenue']:,.2f} in {r['last_period']}. "
            f"That's a {direction} trend of ${abs(r['trend_per_period']):,.2f} per {unit} across the last "
            f"{len(r['based_on_periods'])} {unit}s, with a {r['trend_fit']} fit (R\u00b2 {r['r_squared']}). "
            "This is a rough projection from your own history, not a guarantee."
        )

    @classmethod
    def _best_worst_text(cls, r: Dict[str, Any]) -> str:
        if "error" in r:
            return r["error"]
        unit = {"daily": "day", "weekly": "week", "monthly": "month"}[r["period_type"]]
        latest = r["latest"]
        text = (
            f"Your best {unit} was {r['best']['period']} with ${r['best']['revenue']:,.2f}, and your weakest was "
            f"{r['worst']['period']} with ${r['worst']['revenue']:,.2f}. The average is ${r['average_revenue']:,.2f} "
            f"across {r['periods_analysed']} {unit}s."
        )
        if latest["vs_average_pct"] is not None:
            text += f" The latest ({latest['period']}) is {latest['vs_average_pct']:+.1f}% versus that average."
        return text + " The most recent period may not be complete yet."

    @classmethod
    def _driver_trend_text(cls, r: Dict[str, Any]) -> str:
        if "error" in r:
            return r["error"]
        pct = f" ({r['change_pct']:+.1f}%)" if r["change_pct"] is not None else ""
        direction = "up" if r["change"] > 0 else "down" if r["change"] < 0 else "flat"
        return (
            f"'{r['name']}' went from ${r['series'][0]['revenue']:,.2f} in {r['first_period']} to "
            f"${r['series'][-1]['revenue']:,.2f} in {r['last_period']}: {direction} ${abs(r['change']):,.2f}{pct} "
            f"over {len(r['series'])} {r['period_type']} periods."
        )

    @staticmethod
    def _driver_names(tools: ChatTools) -> List[tuple]:
        """(dimension, name) pairs present in the data, longest names first so 'Iced Coffee' wins over 'Coffee'."""
        found = {}
        for dimension, by_period in tools.stats.get("drivers", {}).items():
            for rows in by_period.values():
                for r in rows:
                    found[(dimension, r["name"])] = True
        return sorted(found, key=lambda dn: len(dn[1]), reverse=True)

    @classmethod
    def _driver_trend_chart(cls, r: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        if "error" in r or len(r["series"]) < 2:
            return None
        return {"title": f"{r['name']} revenue", "chart_type": "line",
                "chart_data": [{"name": p["period"], "value": p["revenue"]} for p in r["series"]]}

    @classmethod
    def _route_mock(cls, tools: ChatTools, user_message: str) -> Dict[str, Any]:
        """Deterministic keyword-matched fallback, mirroring AIService's mock-first pattern."""
        msg = user_message.lower()

        date_match = cls._resolve_date_from_message(tools, msg)
        if date_match:
            result = tools.get_metrics_for_date(date_match)
            if "error" in result:
                content = result["error"]
            else:
                growth = result.get("growth_pct")
                growth_str = f", a {growth:+.1f}% change from the previous day" if growth is not None else ""
                content = (
                    f"On {result['date']}, you made ${result['revenue']:,.2f} across "
                    f"{result['transactions']} transactions{growth_str}."
                )
            return {"content": content, "chart": None, "query_used": "get_metrics_for_date", "query_result": result}

        if re.search(r"forecast|predict|project(ed|ion)|next (day|week|month)|where am i (going|heading)|going to (make|earn|bring)|expect", msg):
            period_type, result = cls._first_working(cls._period_from_message(msg, "monthly"), tools.forecast_next_period)
            return {"content": cls._forecast_text(result), "chart": None,
                    "query_used": "forecast_next_period", "query_result": result}

        if re.search(r"\bwhy\b|\bwhat (caused|happened)|\bexplain\b|\bdrop|\bdecline|\bdecrease|\bincrease|\bspike", msg):
            period_type = "monthly" if "month" in msg else "daily" if "day" in msg or "yesterday" in msg else "weekly"
            result = tools.explain_change(period_type)
            if "error" in result and period_type != "monthly":
                period_type, result = "monthly", tools.explain_change("monthly")
            return {"content": cls._explain_text(result), "chart": None,
                    "query_used": "explain_change", "query_result": result}

        if re.search(r"\b(best|worst|highest|lowest|biggest|weakest|strongest|peak|slowest)\b", msg) and re.search(r"\b(day|week|month)s?\b", msg):
            period_type, result = cls._first_working(cls._period_from_message(msg), tools.best_and_worst_periods)
            return {"content": cls._best_worst_text(result), "chart": None,
                    "query_used": "best_and_worst_periods", "query_result": result}

        for dimension, name in cls._driver_names(tools):
            if re.search(rf"\b{re.escape(name.lower())}\b", msg):
                period_type, result = cls._first_working(
                    cls._period_from_message(msg, "monthly"),
                    lambda p: tools.get_driver_trend(dimension, name, p))
                return {"content": cls._driver_trend_text(result), "chart": cls._driver_trend_chart(result),
                        "query_used": "get_driver_trend", "query_result": result}

        if "categor" in msg:
            result = tools.get_category_breakdown()
            top = result.get("top_categories", [])
            content = (
                f"Your top category is '{top[0]['category']}' with ${top[0]['revenue']:,.2f} "
                f"({top[0]['share_pct']:.1f}% of revenue)."
                if top else "No category data is available yet."
            )
            return {"content": content, "chart": cls._build_chart("get_category_breakdown", result),
                    "query_used": "get_category_breakdown", "query_result": result}

        if "anomal" in msg or "outlier" in msg or "refund" in msg:
            result = tools.list_anomalies()
            content = (
                f"There are {len(result)} flagged anomalies. The most notable is "
                f"${max(result, key=lambda a: abs(a['amount']))['amount']:,.2f} on "
                f"{max(result, key=lambda a: abs(a['amount']))['date']}."
                if result else "No anomalies have been flagged in your latest sync."
            )
            return {"content": content, "chart": None, "query_used": "list_anomalies", "query_result": result}

        if "month" in msg:
            result = tools.get_period_metrics("monthly")
            content = (
                f"Your most recent month ({result[-1]['month']}) brought in ${result[-1]['revenue']:,.2f}."
                if result else "No monthly data is available yet."
            )
            return {"content": content, "chart": cls._build_chart("get_period_metrics", result),
                    "query_used": "get_period_metrics", "query_result": result}

        if "week" in msg or "trend" in msg or "growth" in msg:
            result = tools.get_period_metrics("weekly")
            content = (
                f"Your most recent week ({result[-1]['week']}) brought in ${result[-1]['revenue']:,.2f}."
                if result else "No weekly data is available yet."
            )
            return {"content": content, "chart": cls._build_chart("get_period_metrics", result),
                    "query_used": "get_period_metrics", "query_result": result}

        result = tools.get_summary()
        content = (
            f"You've generated ${result.get('total_revenue', 0):,.2f} across "
            f"{result.get('total_transactions', 0)} transactions, averaging "
            f"${result.get('avg_transaction_value', 0):,.2f} per sale."
        )
        return {"content": content, "chart": None, "query_used": "get_summary", "query_result": result}
