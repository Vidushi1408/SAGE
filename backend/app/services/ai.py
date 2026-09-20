import json
import re
import logging
from typing import Dict, Any
import anthropic

from app.core.config import settings
from app.services import ollama
from app.core.prompts import SYSTEM_PROMPT, USER_PROMPT_TEMPLATE

logger = logging.getLogger("sage.ai")

class AIService:
    @classmethod
    def generate_insights(cls, computed_stats: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate insights using Claude API.
        Falls back to Mock AI Engine if ANTHROPIC_API_KEY is not defined.
        """
        provider = settings.active_llm
        if provider == "mock":
            logger.info("No LLM configured. Running Mock AI Engine...")
            return cls._generate_mock_insights(computed_stats)

        user_prompt = USER_PROMPT_TEMPLATE.format(
            computed_stats=json.dumps(computed_stats, indent=2)
        )

        if provider == "ollama":
            return cls._generate_ollama_insights(computed_stats, user_prompt)

        try:
            client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
            response = client.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=4000,
                system=SYSTEM_PROMPT,
                messages=[
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.0  # Keep it deterministic
            )
            raw_text = response.content[0].text
            logger.info(f"Claude raw response: {raw_text[:200]}...")
            return cls._clean_and_parse_json(raw_text)

        except Exception as e:
            logger.error(f"Claude API failed: {str(e)}. Falling back to default payload.")
            return cls._get_fallback_insights(computed_stats, error_msg=str(e))

    @classmethod
    def _generate_ollama_insights(cls, computed_stats: Dict[str, Any], user_prompt: str) -> Dict[str, Any]:
        """
        Local-LLM insights. The model writes the wording; charts always come from our own computed
        data, and malformed output falls back to the deterministic engine.
        """
        try:
            message = ollama.chat(
                [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user_prompt}],
                json_mode=True,
            )
            result = cls._clean_and_parse_json(message.get("content", ""))
            if not cls._is_valid_payload(result):
                raise ValueError("model returned an invalid insight payload")
            deterministic = cls._generate_mock_insights(computed_stats)["insights"]
            by_title = {i["title"]: i for i in deterministic}
            for idx, insight in enumerate(result["insights"]):
                ref = by_title.get(insight.get("title")) or (deterministic[idx] if idx < len(deterministic) else None)
                insight["chart_type"] = ref["chart_type"] if ref else "none"
                insight["chart_data"] = ref["chart_data"] if ref else []
            return result
        except Exception as e:
            logger.error(f"Ollama insights failed: {e}. Using deterministic insights.")
            return cls._generate_mock_insights(computed_stats)

    @staticmethod
    def _is_valid_payload(result: Any) -> bool:
        return (
            isinstance(result, dict)
            and isinstance(result.get("recommendation"), str) and result["recommendation"].strip() != ""
            and isinstance(result.get("insights"), list) and len(result["insights"]) > 0
            and all(isinstance(i, dict) and isinstance(i.get("title"), str) and isinstance(i.get("explanation"), str)
                    for i in result["insights"])
        )

    @classmethod
    def _clean_and_parse_json(cls, raw_text: str) -> Dict[str, Any]:
        """Strip markdown tags, code fences, and locate JSON block."""
        clean_text = raw_text.strip()
        
        # Remove markdown fences
        if clean_text.startswith("```"):
            lines = clean_text.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            clean_text = "\n".join(lines).strip()

        # Regex fallback to find bracket matching block if text surrounds it
        match = re.search(r"(\{.*})", clean_text, re.DOTALL)
        if match:
            clean_text = match.group(1)

        return json.loads(clean_text)

    @classmethod
    def _generate_mock_insights(cls, computed_stats: Dict[str, Any]) -> Dict[str, Any]:
        """
        Deterministic Mock AI Engine.
        Parses the computed stats and returns highly realistic insights and chart packages.
        """
        summary = computed_stats.get("summary", {})
        total_revenue = summary.get("total_revenue", 0.0)
        total_tx = summary.get("total_transactions", 0)
        avg_tx = summary.get("avg_transaction_value", 0.0)

        monthly_metrics = computed_stats.get("period_metrics", {}).get("monthly", [])
        weekly_metrics = computed_stats.get("period_metrics", {}).get("weekly", [])
        category_metrics = computed_stats.get("category_metrics", {})
        top_cats = category_metrics.get("top_categories", [])
        anomalies = computed_stats.get("anomalies", [])

        # 1. Recommendation Logic
        recommendation = (
            "Focus on scaling high-performing categories and review refund outliers immediately "
            "to secure your net margins."
        )
        if anomalies:
            recommendation = (
                f"Action Required: Audit the {len(anomalies)} anomalies flagged in this sync "
                f"(especially high order sizes). Adjust bakery inventory levels to support weekend demand spikes."
            )

        insights = []

        # 2. Insight A: Revenue Summary & Weekly Trend
        weekly_chart = []
        for w in weekly_metrics[-6:]:  # Last 6 weeks
            weekly_chart.append({"name": w["week"], "value": w["revenue"]})

        explanation_trend = (
            f"Your business has generated a total revenue of ${total_revenue:,.2f} across "
            f"{total_tx} transactions. The average purchase size is ${avg_tx:,.2f}."
        )
        if len(weekly_metrics) > 1:
            last_week = weekly_metrics[-1]
            growth = last_week.get("growth_pct")
            if growth is not None:
                explanation_trend += (
                    f" During the most recent week ({last_week['week']}), revenues stood at "
                    f"${last_week['revenue']:,.2f}, representing a {growth:+.1f}% change compared to the previous week."
                )

        insights.append({
            "title": "Weekly Revenue Trend Analysis",
            "explanation": explanation_trend,
            "chart_type": "line" if weekly_chart else "none",
            "chart_data": weekly_chart
        })

        # 3. Insight B: Category Contribution
        cat_chart = []
        for c in top_cats:
            cat_chart.append({"name": c["category"], "value": c["revenue"]})

        explanation_cat = "Revenue distribution across product segments shows solid performance."
        if top_cats:
            prime_cat = top_cats[0]
            explanation_cat = (
                f"The '{prime_cat['category']}' category is your dominant revenue driver, "
                f"contributing ${prime_cat['revenue']:,.2f} which represents {prime_cat['share_pct']:.1f}% "
                f"of your total sales. Ensuring consistent inventory levels for this segment is vital."
            )

        insights.append({
            "title": "Category Performance Share",
            "explanation": explanation_cat,
            "chart_type": "pie" if cat_chart else "none",
            "chart_data": cat_chart
        })

        # 4. Insight C: Anomalies and Outliers
        if anomalies:
            max_anom = max(anomalies, key=lambda x: abs(x["amount"]))
            explanation_anom = (
                f"Our deterministic outlier filter flagged {len(anomalies)} anomalies. "
                f"The most significant is a transaction of ${max_anom['amount']:,.2f} on "
                f"{max_anom['date']} categorized as '{max_anom['reason']}'."
            )
            insights.append({
                "title": "Operational Anomalies Flagged",
                "explanation": explanation_anom,
                "chart_type": "none",
                "chart_data": []
            })

        return {
            "recommendation": recommendation,
            "insights": insights
        }

    @classmethod
    def _get_fallback_insights(cls, computed_stats: Dict[str, Any], error_msg: str) -> Dict[str, Any]:
        """Safe default fallback in case of processing/parsing failures."""
        summary = computed_stats.get("summary", {})
        return {
            "recommendation": "Review backend log traces. Re-sync sheets to retrigger Claude profiling.",
            "insights": [
                {
                    "title": "Profile Sync Active",
                    "explanation": (
                        f"Processed {summary.get('total_transactions', 0)} transactions. "
                        f"A parsing exception occurred during AI processing: {error_msg[:100]}."
                    ),
                    "chart_type": "none",
                    "chart_data": []
                }
            ]
        }
