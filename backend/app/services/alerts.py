import html
import logging
from typing import Any, Dict, List
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.user import User
from app.models.connected_account import ConnectedAccount
from app.services.email import EmailService
from app.services.slack import SlackService

logger = logging.getLogger("sage.alerts")


def anomaly_key(anomaly: Dict[str, Any]) -> str:
    return f"{anomaly.get('transaction_id')}|{anomaly.get('date')}|{anomaly.get('amount')}"


def dispatch_alerts(db: Session, owner_id: UUID, insight_payload: Dict[str, Any], computed_stats: Dict[str, Any]) -> None:
    """
    Notify the workspace (email + Slack) about anomalies it hasn't already been told about.
    Called from the single generate_user_insights() funnel used by manual refresh,
    onboarding, uploads and the background scheduler -- so it must be idempotent: re-running
    the pipeline on unchanged data sends nothing.
    """
    anomalies: List[Dict[str, Any]] = computed_stats.get("anomalies", [])
    if not anomalies:
        return

    owner = db.query(User).filter(User.id == owner_id).first()
    already_alerted = set((owner.last_alerted_anomalies or []) if owner else [])
    new_anomalies = [a for a in anomalies if anomaly_key(a) not in already_alerted]
    if not new_anomalies:
        return

    recommendation = insight_payload.get("recommendation", "New insights are ready to review.")
    total, fresh = len(anomalies), len(new_anomalies)

    # Email the owner + any admins who have alerts enabled
    recipients = db.query(User).filter(
        ((User.id == owner_id) | (User.workspace_owner_id == owner_id)),
        User.role.in_(["admin"]),
        User.alert_email_enabled == True,  # noqa: E712
        User.is_active == True  # noqa: E712
    ).all()

    rows = "".join(
        f"<li>{html.escape(str(a.get('date')))} — ${a.get('amount', 0):,.2f} ({html.escape(str(a.get('reason')))})</li>"
        for a in new_anomalies[:5]
    )
    more = f"<p>…and {fresh - 5} more.</p>" if fresh > 5 else ""
    subject = f"SAGE flagged {fresh} new anomal{'y' if fresh == 1 else 'ies'} ({total} total)"
    for user in recipients:
        EmailService.send(
            to=user.email,
            subject=subject,
            html=(
                f"<p><strong>Recommendation:</strong> {html.escape(str(recommendation))}</p>"
                f"<p><strong>{fresh} new anomalies flagged</strong> ({total} in total this period):</p>"
                f"<ul>{rows}</ul>{more}"
            )
        )

    # Post to Slack if the workspace has a webhook connected
    slack_account = db.query(ConnectedAccount).filter(
        ConnectedAccount.user_id == owner_id,
        ConnectedAccount.service == "slack"
    ).first()
    if slack_account and slack_account.access_token:
        SlackService.send_alert(slack_account.access_token, recommendation, new_anomalies)

    if owner:
        owner.last_alerted_anomalies = sorted({anomaly_key(a) for a in anomalies})
        db.commit()
