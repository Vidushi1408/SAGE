from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.core.security import decode_access_token, password_fingerprint
from app.models.user import User
from uuid import UUID

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    """Validate JWT token and return current User."""
    payload = decode_access_token(token)
    user_id = payload.get("sub") if payload else None
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        # User ID is UUID format in our database
        user = db.query(User).filter(User.id == UUID(user_id)).first()
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user ID format in token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # A password change/reset invalidates every session issued before it.
    if not user or not user.is_active or payload.get("pwd") != password_fingerprint(user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def require_writer(current_user: User = Depends(get_current_user)) -> User:
    """Allow admins and analysts; viewers are read-only."""
    if current_user.role not in ("admin", "analyst"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Viewers have read-only access. Ask a workspace admin for analyst access."
        )
    return current_user


def get_workspace_owner_id(user: User) -> UUID:
    """Return the owner user ID who holds the primary synced sheets/stats context."""
    return user.workspace_owner_id if user.workspace_owner_id else user.id
