from pydantic import BaseModel, EmailStr, Field, field_validator
from app.core.security import normalize_email, validate_password_strength
from uuid import UUID
from datetime import datetime
from typing import Optional

class UserBase(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def lowercase_email(cls, v):
        return normalize_email(v)

class UserCreate(UserBase):
    password: str

    @field_validator("password")
    @classmethod
    def strong_enough(cls, v):
        return validate_password_strength(v)

class UserResponse(UserBase):
    id: UUID
    name: Optional[str] = None
    role: str
    workspace_owner_id: Optional[UUID] = None
    is_active: bool
    alert_email_enabled: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    user_id: Optional[str] = None

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def lowercase_email(cls, v):
        return normalize_email(v)

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def strong_enough(cls, v):
        return validate_password_strength(v)

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def strong_enough(cls, v):
        return validate_password_strength(v)

class UpdateMeRequest(BaseModel):
    alert_email_enabled: Optional[bool] = None
    name: Optional[str] = Field(default=None, max_length=100)

    @field_validator("name")
    @classmethod
    def clean_name(cls, v):
        return v.strip() if v is not None else v
