"""
"Export my data": a ZIP of everything SAGE holds for a workspace, in open formats (CSV and JSON).

Secrets are deliberately left out: no password hashes, OAuth tokens, invite or reset tokens, or Slack webhook URLs.
"""
import csv
import io
import json
import zipfile
from typing import Any, Dict, List

from sqlalchemy.orm import Session

from app.api.deps import get_workspace_owner_id
from app.core.clock import utcnow
from app.models.chat_history import ChatHistory
from app.models.computed_stat import ComputedStat
from app.models.insight import Insight
from app.models.synced_data import SyncedData
from app.models.user import User

README = """SAGE data export
================
transactions.csv   Every row SAGE has imported for this workspace, as it was imported.
stats.json         The most recent computed statistics (totals, periods, categories, anomalies).
insights.json      Every saved set of AI insights, newest first.
chat_history.json  Your own conversations with SAGE (other members' chats are private to them).
team.json          Workspace members and their roles (included for admins only).
account.json       Your account details.

Sign-in credentials, connection tokens and webhook URLs are never included.
"""


def _csv_safe(value: Any) -> Any:
    """Stop spreadsheet apps from running a cell such as =HYPERLINK(...) when the CSV is opened."""
    if isinstance(value, str) and value[:1] in ("=", "+", "-", "@") and not _is_number(value):
        return "'" + value
    return value


def _is_number(text: str) -> bool:
    try:
        float(text.replace(",", ""))
        return True
    except ValueError:
        return False


def _json(data: Any) -> str:
    return json.dumps(data, indent=2, default=str, ensure_ascii=False)


def _transactions_csv(rows: List[SyncedData]) -> str:
    columns: List[str] = []
    for r in rows:
        for key in (r.raw_payload or {}):
            if key not in columns:
                columns.append(key)
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(columns + ["_source", "_synced_at"])
    for r in rows:
        payload = r.raw_payload or {}
        writer.writerow([_csv_safe(payload.get(c, "")) for c in columns] + [r.source, r.synced_at])
    return out.getvalue()


def build_export(db: Session, user: User) -> bytes:
    owner_id = get_workspace_owner_id(user)
    transactions = db.query(SyncedData).filter(SyncedData.user_id == owner_id).order_by(SyncedData.synced_at).all()
    latest_stat = db.query(ComputedStat).filter(ComputedStat.user_id == owner_id).order_by(ComputedStat.created_at.desc()).first()
    insights = db.query(Insight).filter(Insight.user_id == owner_id).order_by(Insight.created_at.desc()).all()
    chats = db.query(ChatHistory).filter(ChatHistory.user_id == user.id).order_by(ChatHistory.created_at).all()

    files: Dict[str, str] = {
        "README.txt": README,
        "account.json": _json({
            "email": user.email, "name": user.name, "role": user.role,
            "created_at": user.created_at, "exported_at": utcnow(),
        }),
        "transactions.csv": _transactions_csv(transactions),
        "stats.json": _json(latest_stat.metrics if latest_stat else {}),
        "insights.json": _json([{"created_at": i.created_at, **(i.insight_data or {})} for i in insights]),
        "chat_history.json": _json([{"role": c.role, "content": c.content, "created_at": c.created_at} for c in chats]),
    }
    if user.role == "admin":
        members = db.query(User).filter((User.id == owner_id) | (User.workspace_owner_id == owner_id)).all()
        files["team.json"] = _json([{"email": m.email, "name": m.name, "role": m.role,
                                     "is_active": m.is_active, "created_at": m.created_at} for m in members])

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    return buffer.getvalue()
