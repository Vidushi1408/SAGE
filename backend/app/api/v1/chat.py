from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field, field_validator

from app.core.db import get_db
from app.api.deps import get_current_user, get_workspace_owner_id
from app.models.user import User
from app.models.computed_stat import ComputedStat
from app.models.chat_history import ChatHistory
from app.services.chat import ChatService

router = APIRouter()

MAX_HISTORY_TURNS_FOR_CONTEXT = 10


class ChatMessageRequest(BaseModel):
    message: str = Field(max_length=2000)

    @field_validator("message")
    @classmethod
    def not_blank(cls, v):
        v = v.strip()
        if not v:
            raise ValueError("Message cannot be empty")
        return v


@router.get("/history")
def get_chat_history(
    limit: int = Query(default=50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve the current user's own chat history (conversations are private per user)."""
    records = db.query(ChatHistory).filter(
        ChatHistory.user_id == current_user.id
    ).order_by(ChatHistory.created_at.asc()).limit(limit).all()

    return {"history": [
        {"id": r.id, "role": r.role, "content": r.content, "created_at": r.created_at}
        for r in records
    ]}


@router.post("/message")
def send_chat_message(
    payload: ChatMessageRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Ask SAGE a natural-language question about the workspace's computed stats."""
    owner_id = get_workspace_owner_id(current_user)

    latest_stat = db.query(ComputedStat).filter(
        ComputedStat.user_id == owner_id
    ).order_by(ComputedStat.created_at.desc()).first()

    if not latest_stat:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No synced data to chat about yet. Sync a data source and run analysis first."
        )

    # Recent turns, formatted for the Anthropic Messages API, for light conversational context
    recent = db.query(ChatHistory).filter(
        ChatHistory.user_id == current_user.id
    ).order_by(ChatHistory.created_at.desc()).limit(MAX_HISTORY_TURNS_FOR_CONTEXT).all()
    history = [{"role": r.role, "content": r.content} for r in reversed(recent)]

    user_turn = ChatHistory(user_id=current_user.id, role="user", content=payload.message)
    db.add(user_turn)
    db.commit()

    result = ChatService.respond(latest_stat.metrics, payload.message, history)

    assistant_turn = ChatHistory(
        user_id=current_user.id,
        role="assistant",
        content=result["content"],
        query_used=result.get("query_used"),
        query_result=result.get("query_result")
    )
    db.add(assistant_turn)
    db.commit()
    db.refresh(assistant_turn)

    return {
        "id": assistant_turn.id,
        "role": "assistant",
        "content": assistant_turn.content,
        "chart": result.get("chart"),
        "created_at": assistant_turn.created_at
    }
