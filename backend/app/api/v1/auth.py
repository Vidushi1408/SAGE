import secrets
from datetime import timedelta
from app.core.clock import utcnow

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.core.config import settings
from app.core.security import hash_password, verify_password, create_access_token, normalize_email, password_fingerprint
from app.core.rate_limit import login_account_limiter, login_ip_limiter, demo_ip_limiter
from app.models.user import User
from app.schemas.user import (
    UserCreate, UserResponse, Token,
    ForgotPasswordRequest, ResetPasswordRequest, UpdateMeRequest, ChangePasswordRequest
)
from app.api.deps import get_current_user
from app.services.email import EmailService
from app.services.demo import DEMO_OWNER_EMAIL, DEMO_OWNER_DEV_PASSWORD, ensure_demo_workspace, is_demo_account

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

    # The demo accounts are not password-login accounts outside local development: visitors enter the
    # sandbox through POST /auth/demo, and a published password must never open an admin account.
    if is_demo_account(email) and not settings.dev_demo_login_allowed:
        user = None
    elif not user and email == DEMO_OWNER_EMAIL:
        # Local development convenience: auto-create the demo user so tests and docs can sign in immediately
        user = User(
            email=DEMO_OWNER_EMAIL,
            hashed_password=hash_password(DEMO_OWNER_DEV_PASSWORD)
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

@router.post("/demo", response_model=Token)
def demo_login(request: Request, db: Session = Depends(get_db)):
    """Enter the read-only demo workspace without an account. 404s unless demo mode is enabled."""
    if not settings.demo_enabled:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Demo mode isn't available on this server.")

    client_ip = request.client.host if request.client else "unknown"
    wait = demo_ip_limiter.retry_after(client_ip)
    if wait:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many demo sessions from this address. Try again in {max(1, wait // 60)} minute(s).",
            headers={"Retry-After": str(wait)},
        )
    demo_ip_limiter.record_failure(client_ip)  # counts every start, so the window caps total demo sessions per address

    guest = ensure_demo_workspace(db)
    access_token = create_access_token(subject=guest.id, pw_fingerprint=password_fingerprint(guest.hashed_password))
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


@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Change the signed-in user's password. Other sessions are revoked; a fresh token is returned for this one."""
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Your current password is incorrect.")
    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose a password different from your current one.")

    current_user.hashed_password = hash_password(payload.new_password)
    db.commit()
    token = create_access_token(
        subject=current_user.id,
        pw_fingerprint=password_fingerprint(current_user.hashed_password),
    )
    return {"access_token": token, "token_type": "bearer"}


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
        user.password_reset_expires_at = utcnow() + timedelta(minutes=PASSWORD_RESET_EXPIRE_MINUTES)
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

    if not user or not user.password_reset_expires_at or user.password_reset_expires_at < utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This reset link is invalid or has expired. Please request a new one."
        )

    user.hashed_password = hash_password(payload.new_password)
    user.password_reset_token = None
    user.password_reset_expires_at = None
    db.commit()

    return {"status": "success", "message": "Password has been reset. You can now log in."}
