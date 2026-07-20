from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter()

@router.get("/history")
def get_chat_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve chat history for the user."""
    return {"history": []}
