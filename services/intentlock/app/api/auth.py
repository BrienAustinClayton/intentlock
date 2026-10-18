"""Auth router: email codes, Google sign-in, session, signup details, onboarding."""
from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy.orm import Session

from app import auth
from app.auth import AuthError, current_session, current_user
from app.db import get_db
from app.models import User, UserSession

router = APIRouter(prefix="/auth", tags=["auth"])

CURRENCIES = ("USD", "EUR", "GBP", "INR", "CAD", "AUD", "SGD", "JPY", "AED")


class _Body(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class EmailStart(_Body):
    email: str = Field(max_length=254)


class EmailVerify(_Body):
    email: str = Field(max_length=254)
    code: str = Field(max_length=12)


class GoogleUrl(_Body):
    state: str = Field(max_length=128)
    code_challenge: str = Field(max_length=128)


class GoogleExchange(_Body):
    code: str = Field(max_length=2048)
    code_verifier: str = Field(max_length=128)


class Signup(_Body):
    full_name: str = Field(min_length=1, max_length=80)
    country: str = Field(pattern=r"^[A-Za-z]{2}$")
    currency: Literal[CURRENCIES]  # type: ignore[valid-type]
    company: Optional[str] = Field(default=None, max_length=120)

    @field_validator("country")
    @classmethod
    def _upper(cls, v: str) -> str:
        return v.upper()


UseCase = Literal["personal", "household", "business", "developer"]
Category = Literal["groceries", "electronics", "household", "fashion", "travel", "software", "office", "other"]
ApprovalMode = Literal["every", "above_limit", "within_mandate"]
AgentKind = Literal["chatgpt", "claude", "gemini", "custom", "none"]


class Onboarding(_Body):
    use_case: UseCase
    categories: list[Category] = Field(min_length=1, max_length=8)
    monthly_budget: int = Field(ge=0, le=1_000_000)
    approval_mode: ApprovalMode
    approval_limit: Optional[int] = Field(default=None, ge=1, le=1_000_000)
    agents: list[AgentKind] = Field(default_factory=list, max_length=5)
    referral: Optional[str] = Field(default=None, max_length=120)

    @model_validator(mode="after")
    def _check(self):
        if self.approval_mode == "above_limit" and self.approval_limit is None:
            raise ValueError("approval_limit is required when approval_mode is above_limit")
        if self.approval_mode != "above_limit":
            self.approval_limit = None
        self.categories = list(dict.fromkeys(self.categories))
        self.agents = list(dict.fromkeys(self.agents))
        return self


def _ua(request: Request) -> str | None:
    return request.headers.get("user-agent")


@router.post("/email/start")
def email_start(body: EmailStart, db: Session = Depends(get_db)):
    try:
        auth.start_email_code(db, body.email)
    except AuthError as e:
        raise e.http()
    return {"ok": True}


@router.post("/email/verify")
def email_verify(body: EmailVerify, request: Request, db: Session = Depends(get_db)):
    try:
        return auth.verify_email_code(db, body.email, body.code, _ua(request))
    except AuthError as e:
        raise e.http()


@router.post("/google/url")
def google_url(body: GoogleUrl):
    try:
        return {"url": auth.google_auth_url(body.state, body.code_challenge)}
    except AuthError as e:
        raise e.http()


@router.post("/google")
def google_exchange(body: GoogleExchange, request: Request, db: Session = Depends(get_db)):
    try:
        return auth.google_login(db, body.code, body.code_verifier, _ua(request))
    except AuthError as e:
        raise e.http()


@router.get("/me")
def me(user: User = Depends(current_user)):
    return auth.user_dto(user)


@router.post("/logout")
def logout(sess: UserSession = Depends(current_session), db: Session = Depends(get_db)):
    auth.logout(db, sess)
    return {"ok": True}


@router.post("/signup")
def signup(body: Signup, user: User = Depends(current_user), db: Session = Depends(get_db)):
    user.name = body.full_name
    user.country = body.country
    user.currency = body.currency
    user.company = body.company or None
    if user.signup_completed_at is None:
        user.signup_completed_at = auth.utcnow()
    db.commit()
    return auth.user_dto(user)


@router.post("/onboarding")
def onboarding(body: Onboarding, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.signup_completed_at is None:
        raise AuthError(409, "signup_required", "Complete your details first.").http()
    user.onboarding = body.model_dump()
    if user.onboarded_at is None:
        user.onboarded_at = auth.utcnow()
    db.commit()
    return auth.user_dto(user)
