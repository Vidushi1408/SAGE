import logging
from typing import Any, Dict, List

import httpx

logger = logging.getLogger("sage.slack")


class SlackService:
    @classmethod
    def send_alert(cls, webhook_url: str, recommendation: str, anomalies: List[Dict[str, Any]]) -> bool:
        """Post a formatted anomaly/insight alert to a Slack Incoming Webhook."""
        blocks = [
            {
                "type": "header",
                "text": {"type": "plain_text", "text": "🔍 SAGE Insight Alert"}
            },
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": f"*Recommendation:*\n{recommendation}"}
            }
        ]

        if anomalies:
            anomaly_lines = "\n".join(
                f"• `{a.get('date')}` — ${a.get('amount'):,.2f} ({a.get('reason')})"
                for a in anomalies[:5]
            )
            blocks.append({
                "type": "section",
                "text": {"type": "mrkdwn", "text": f"*{len(anomalies)} anomalies flagged:*\n{anomaly_lines}"}
            })

        payload = {"blocks": blocks}

        try:
            response = httpx.post(webhook_url, json=payload, timeout=10.0)
            response.raise_for_status()
            return True
        except Exception as e:
            logger.error(f"Failed to post Slack alert: {str(e)}")
            return False
