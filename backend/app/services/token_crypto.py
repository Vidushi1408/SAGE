"""Encrypt third-party OAuth tokens at rest (Fernet, key derived from SECRET_KEY)."""
import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings

PREFIX = "enc:"


def _fernet() -> Fernet:
    key = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest())
    return Fernet(key)


def encrypt_token(value: str | None) -> str | None:
    if not value or value.startswith(PREFIX):
        return value
    return PREFIX + _fernet().encrypt(value.encode()).decode()


def decrypt_token(value: str | None) -> str | None:
    """Plain values (mock tokens, rows saved before encryption existed) pass through unchanged."""
    if not value or not value.startswith(PREFIX):
        return value
    try:
        return _fernet().decrypt(value[len(PREFIX):].encode()).decode()
    except InvalidToken:
        # SECRET_KEY changed: the stored token is unusable and the user must reconnect.
        return None
