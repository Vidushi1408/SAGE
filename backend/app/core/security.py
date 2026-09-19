import bcrypt
import hashlib
from datetime import datetime, timedelta
from typing import Union, Any
from jose import jwt, JWTError
from app.core.config import settings

def hash_password(password: str) -> str:
    """Hash password using bcrypt."""
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password using bcrypt."""
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"), 
            hashed_password.encode("utf-8")
        )
    except Exception:
        return False

MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_BYTES = 72  # bcrypt's hard limit


def normalize_email(email: str) -> str:
    """Emails are case-insensitive: always compare and store them trimmed + lowercased."""
    return email.strip().lower()


def validate_password_strength(password: str) -> str:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters long")
    if len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise ValueError("Password is too long (maximum 72 bytes)")
    if not password.strip():
        raise ValueError("Password cannot be only whitespace")
    return password


def password_fingerprint(hashed_password: str) -> str:
    """Short digest of the current password hash; tokens carrying an old one die on password change."""
    return hashlib.sha256(hashed_password.encode("utf-8")).hexdigest()[:16]


def create_access_token(subject: Union[str, Any], expires_delta: timedelta = None, pw_fingerprint: str = None) -> str:
    """Create a signed JWT token."""
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
    to_encode = {"exp": expire, "sub": str(subject)}
    if pw_fingerprint:
        to_encode["pwd"] = pw_fingerprint
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def create_oauth_state(owner_id: Any, minutes: int = 10) -> str:
    """Signed, short-lived OAuth `state` binding the callback to the workspace that started it."""
    payload = {
        "uid": str(owner_id),
        "purpose": "oauth_state",
        "exp": datetime.utcnow() + timedelta(minutes=minutes),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def verify_oauth_state(state: str) -> Union[str, None]:
    """Return the workspace owner id from a valid signed state, else None."""
    try:
        payload = jwt.decode(state, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None
    if payload.get("purpose") != "oauth_state":
        return None
    return payload.get("uid")


def decode_access_token(token: str) -> Union[dict, None]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None
    if payload.get("purpose"):  # oauth-state and other special-purpose tokens are not sessions
        return None
    return payload


def verify_token(token: str) -> Union[str, None]:
    """Verify JWT token and return the subject (user ID) if valid."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None
