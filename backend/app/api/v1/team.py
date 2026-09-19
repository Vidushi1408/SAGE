import html
import secrets
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, field_validator
from typing import List, Optional
from uuid import UUID, uuid4
from datetime import datetime, timedelta

from app.core.db import get_db
from app.core.config import settings
from app.core.security import hash_password, normalize_email, validate_password_strength
from app.api.deps import get_current_user, get_workspace_owner_id
from app.models.user import User
from app.services.email import EmailService

router = APIRouter()

INVITE_EXPIRE_HOURS = 48

# --- Pydantic Schemas ---
class TeamMemberInvite(BaseModel):
    email: EmailStr
    name: Optional[str] = None
    role: str  # 'admin', 'analyst', 'viewer'

    @field_validator("email")
    @classmethod
    def lowercase_email(cls, v):
        return normalize_email(v)

class AcceptInviteRequest(BaseModel):
    token: str
    name: str
    password: str

    @field_validator("password")
    @classmethod
    def strong_enough(cls, v):
        return validate_password_strength(v)

class TeamMemberResponse(BaseModel):
    id: UUID
    email: EmailStr
    name: Optional[str] = None
    role: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

# --- API Routes ---

@router.get("/", response_model=List[TeamMemberResponse])
def list_team_members(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all team members (including the owner) for this workspace."""
    owner_id = get_workspace_owner_id(current_user)
    
    # Query all users belonging to this workspace context
    members = db.query(User).filter(
        (User.id == owner_id) | (User.workspace_owner_id == owner_id)
    ).order_by(User.created_at.asc()).all()
    
    return members


def _issue_invite(member: User, inviter: User, db: Session) -> None:
    """(Re)generate the member's invite token and email them the accept link."""
    member.invite_token = secrets.token_urlsafe(32)
    member.invite_token_expires_at = datetime.utcnow() + timedelta(hours=INVITE_EXPIRE_HOURS)
    db.commit()
    db.refresh(member)

    accept_url = f"{settings.FRONTEND_URL}/accept-invite?token={member.invite_token}"
    inviter_label = html.escape(inviter.name or inviter.email)
    EmailService.send(
        to=member.email,
        subject="You've been invited to a SAGE workspace",
        html=(
            f"<p>{inviter_label} invited you to join their SAGE workspace "
            f"as a <strong>{html.escape(member.role)}</strong>.</p>"
            f"<p><a href='{accept_url}'>Click here to accept the invite</a> and set up your account. "
            f"This link expires in {INVITE_EXPIRE_HOURS} hours.</p>"
        )
    )


def _require_admin(current_user: User, action: str) -> None:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Only admin users can {action}."
        )


@router.post("/invite", response_model=TeamMemberResponse, status_code=status.HTTP_201_CREATED)
def invite_team_member(
    member_in: TeamMemberInvite,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Invite a new team member. Re-inviting someone whose invite is still pending resends it."""
    _require_admin(current_user, "invite team members to this workspace")
    owner_id = get_workspace_owner_id(current_user)

    if member_in.role not in ("admin", "analyst", "viewer"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid role. Must be one of 'admin', 'analyst', or 'viewer'."
        )

    existing_user = db.query(User).filter(func.lower(User.email) == member_in.email).first()
    if existing_user:
        pending_here = (not existing_user.is_active) and existing_user.workspace_owner_id == owner_id
        if not pending_here:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A user with this email address already exists."
            )
        # Same person, still pending (e.g. the link expired): refresh their details and resend.
        existing_user.role = member_in.role
        if member_in.name:
            existing_user.name = member_in.name
        _issue_invite(existing_user, current_user, db)
        return existing_user

    # Placeholder password: unusable until the invite is accepted and a real one is set.
    member = User(
        email=member_in.email,
        hashed_password=hash_password(secrets.token_urlsafe(32)),
        name=member_in.name,
        role=member_in.role,
        workspace_owner_id=owner_id,
        is_active=False,
    )
    db.add(member)
    db.commit()
    _issue_invite(member, current_user, db)
    return member


@router.post("/{member_id}/resend-invite", response_model=TeamMemberResponse)
def resend_invite(
    member_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Send a fresh invite link to a member who hasn't accepted yet (e.g. the old link expired)."""
    _require_admin(current_user, "resend invites")
    owner_id = get_workspace_owner_id(current_user)

    member = db.query(User).filter(User.id == member_id, User.workspace_owner_id == owner_id).first()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team member not found in your workspace.")
    if member.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This member has already accepted their invite.")

    _issue_invite(member, current_user, db)
    return member


@router.post("/accept-invite", response_model=TeamMemberResponse)
def accept_invite(payload: AcceptInviteRequest, db: Session = Depends(get_db)):
    """Accept a team invite by setting a name/password and activating the account."""
    member = db.query(User).filter(User.invite_token == payload.token).first()

    if not member or not member.invite_token_expires_at or member.invite_token_expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This invite link is invalid or has expired. Ask your admin to send a new one."
        )

    member.name = payload.name
    member.hashed_password = hash_password(payload.password)
    member.is_active = True
    member.invite_token = None
    member.invite_token_expires_at = None
    db.commit()
    db.refresh(member)

    return member


@router.delete("/{member_id}")
def delete_team_member(
    member_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Remove a team member from the workspace. Only Admins can remove."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admin users can delete team members."
        )

    owner_id = get_workspace_owner_id(current_user)

    # Prevent owner from deleting themselves
    if member_id == owner_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot remove the primary workspace owner."
        )

    member = db.query(User).filter(
        User.id == member_id,
        User.workspace_owner_id == owner_id
    ).first()

    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team member not found in your workspace."
        )

    db.delete(member)
    db.commit()

    return {"status": "success", "detail": "Team member successfully removed"}
