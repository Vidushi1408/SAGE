import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.core.config import settings
from app.core.security import hash_password, verify_password, create_access_token, normalize_email, password_fingerprint
from app.core.rate_limit import login_account_limiter, login_ip_limiter
from app.models.user import User
from app.schemas.user import (
    UserCreate, UserResponse, Token,
    ForgotPasswordRequest, ResetPasswordRequest, UpdateMeRequest
)
from app.api.deps import get_current_user
from app.services.email import EmailService

router = APIRouter()

PASSWORD_RESET_EXPIRE_MINUTES = 60

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user_in: UserCreate, db: Session = Depends(get_db)):
    """Register a new user."""
    # Check if user already exists
    existing_user = db.query(User).filter(func.lower(User.email) == user_in.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists."
        )
    
    hashed = hash_password(user_in.password)
    user = User(
        email=user_in.email,
        hashed_password=hashed
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@router.post("/login", response_model=Token)
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """Log in user and return access token. Auto-creates demo@sage.ai user if missing."""
    email = normalize_email(form_data.username)
    client_ip = request.client.host if request.client else "unknown"
    account_key = f"{client_ip}:{email}"

    wait = max(login_account_limiter.retry_after(account_key), login_ip_limiter.retry_after(client_ip))
    if wait:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed sign-in attempts. Try again in {max(1, wait // 60)} minute(s).",
            headers={"Retry-After": str(wait)},
        )

    user = db.query(User).filter(func.lower(User.email) == email).first()

    # Auto-seed the demo user for testing ease
    if not user and email == "demo@sage.ai":
        hashed_demo_pw = hash_password("sage_demo_pass")
        user = User(
            email="demo@sage.ai",
            hashed_password=hashed_demo_pw
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    if not user or not verify_password(form_data.password, user.hashed_password):
        login_account_limiter.record_failure(account_key)
        login_ip_limiter.record_failure(client_ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    login_account_limiter.reset(account_key)

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has a pending invite. Please accept your invite email before logging in."
        )

    access_token = create_access_token(subject=user.id, pw_fingerprint=password_fingerprint(user.hashed_password))
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Get profile of current logged-in user."""
    return current_user


@router.patch("/me", response_model=UserResponse)
def update_me(
    update_in: UpdateMeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update mutable profile settings for the current user (e.g. alert preferences)."""
    if update_in.alert_email_enabled is not None:
        current_user.alert_email_enabled = update_in.alert_email_enabled
    if update_in.name is not None:
        current_user.name = update_in.name
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """
    Request a password reset link. Always returns a generic success response,
    regardless of whether the email exists, to avoid account enumeration.
    """
    user = db.query(User).filter(func.lower(User.email) == payload.email).first()
    if user:
        token = secrets.token_urlsafe(32)
        user.password_reset_token = token
        user.password_reset_expires_at = datetime.utcnow() + timedelta(minutes=PASSWORD_RESET_EXPIRE_MINUTES)
        db.commit()

        reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
        EmailService.send(
            to=user.email,
            subject="Reset your SAGE password",
            html=(
                f"<p>We received a request to reset your SAGE password.</p>"
                f"<p><a href='{reset_url}'>Click here to reset your password</a>. "
                f"This link expires in {PASSWORD_RESET_EXPIRE_MINUTES} minutes.</p>"
                f"<p>If you did not request this, you can safely ignore this email.</p>"
            )
        )

    return {"status": "success", "message": "If an account exists for that email, a reset link has been sent."}


@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Reset a user's password using a valid reset token."""
    user = db.query(User).filter(User.password_reset_token == payload.token).first()

    if not user or not user.password_reset_expires_at or user.password_reset_expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This reset link is invalid or has expired. Please request a new one."
        )

    user.hashed_password = hash_password(payload.new_password)
    user.password_reset_token = None
    user.password_reset_expires_at = None
    db.commit()

    return {"status": "success", "message": "Password has been reset. You can now log in."}
