from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import List, Optional
from uuid import UUID, uuid4
from datetime import datetime

from app.core.db import get_db
from app.core.security import hash_password
from app.api.deps import get_current_user, get_workspace_owner_id
from app.models.user import User

router = APIRouter()

# --- Pydantic Schemas ---
class TeamMemberInvite(BaseModel):
    email: EmailStr
    name: Optional[str] = None
    password: str
    role: str  # 'admin', 'analyst', 'viewer'

class TeamMemberResponse(BaseModel):
    id: UUID
    email: EmailStr
    name: Optional[str] = None
    role: str
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


@router.post("/invite", response_model=TeamMemberResponse, status_code=status.HTTP_201_CREATED)
def invite_team_member(
    member_in: TeamMemberInvite,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Invite/Create a new team member. Only Admins can invite."""
    # Ensure current user is admin
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admin users can invite team members to this workspace."
        )

    owner_id = get_workspace_owner_id(current_user)

    # Check if email is already taken
    existing_user = db.query(User).filter(User.email == member_in.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email address already exists."
        )

    if member_in.role not in ("admin", "analyst", "viewer"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid role. Must be one of 'admin', 'analyst', or 'viewer'."
        )

    hashed_pw = hash_password(member_in.password)
    member = User(
        email=member_in.email,
        hashed_password=hashed_pw,
        name=member_in.name,
        role=member_in.role,
        workspace_owner_id=owner_id
    )
    db.add(member)
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
