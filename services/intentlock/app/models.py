"""SQLAlchemy 2 ORM models for IntentLock."""
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    ARRAY,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, relationship
from sqlalchemy.sql import func


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    paypal_payment_token = Column(String, nullable=True)
    email = Column(String, nullable=True, unique=True)
    email_verified_at = Column(DateTime(timezone=True), nullable=True)
    google_sub = Column(String, nullable=True, unique=True)
    avatar_url = Column(String, nullable=True)
    country = Column(String(2), nullable=True)
    currency = Column(String(3), nullable=True)
    company = Column(String, nullable=True)
    onboarding = Column(JSONB, nullable=True)
    signup_completed_at = Column(DateTime(timezone=True), nullable=True)
    onboarded_at = Column(DateTime(timezone=True), nullable=True)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    agents = relationship("Agent", back_populates="user")
    intents = relationship("Intent", back_populates="user")
    orders = relationship("Order", back_populates="user")


class Agent(Base):
    __tablename__ = "agents"

    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    public_key = Column(String, nullable=False)
    device_id = Column(String, nullable=False)
    verified = Column(Boolean, nullable=False, default=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    user = relationship("User", back_populates="agents")
    mandates = relationship("Mandate", back_populates="agent")
    intents = relationship("Intent", back_populates="agent")
    orders = relationship("Order", back_populates="agent")
    schedule_events = relationship("ScheduleEvent", back_populates="agent")
    nonces = relationship("Nonce", back_populates="agent")


class Mandate(Base):
    __tablename__ = "mandates"

    id = Column(String, primary_key=True)
    agent_id = Column(String, ForeignKey("agents.id"), nullable=False)
    categories = Column(ARRAY(Text), nullable=False)
    merchants = Column(ARRAY(Text), nullable=False)
    budget_amount = Column(Numeric(12, 2), nullable=False)
    budget_period = Column(String, nullable=False)
    currency = Column(String, nullable=False)
    starts_at = Column(DateTime(timezone=True), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    signed_json = Column(JSONB, nullable=False)
    signature = Column(String, nullable=False)

    __table_args__ = (
        CheckConstraint(
            "budget_period IN ('week', 'month', 'once')",
            name="ck_mandates_budget_period",
        ),
    )

    agent = relationship("Agent", back_populates="mandates")


class Intent(Base):
    __tablename__ = "intents"

    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    agent_id = Column(String, ForeignKey("agents.id"), nullable=False)
    request_text = Column(Text, nullable=False)
    signed_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    signature = Column(String, nullable=False)

    user = relationship("User", back_populates="intents")
    agent = relationship("Agent", back_populates="intents")
    orders = relationship("Order", back_populates="intent")


class Order(Base):
    __tablename__ = "orders"

    id = Column(String, primary_key=True)
    intent_id = Column(String, ForeignKey("intents.id"), nullable=False)
    agent_id = Column(String, ForeignKey("agents.id"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    merchant = Column(String, nullable=False)
    cart_json = Column(JSONB, nullable=False)
    total = Column(Numeric(12, 2), nullable=False)
    currency = Column(String, nullable=False)
    paypal_order_id = Column(String, nullable=True)
    authorization_id = Column(String, nullable=True)
    capture_id = Column(String, nullable=True)
    status = Column(String, nullable=False)
    decision = Column(String, nullable=True)
    reasons = Column(JSONB, nullable=True)
    page_urls = Column(JSONB, nullable=True)
    shipping_address = Column(JSONB, nullable=True)
    trace_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint(
            "status IN ('received', 'rejected', 'authorized', 'checking', 'captured', 'voided', 'pending_approval', 'failed')",
            name="ck_orders_status",
        ),
        CheckConstraint(
            "decision IS NULL OR decision IN ('reject', 'void', 'hold', 'capture')",
            name="ck_orders_decision",
        ),
    )

    intent = relationship("Intent", back_populates="orders")
    agent = relationship("Agent", back_populates="orders")
    user = relationship("User", back_populates="orders")
    checks = relationship("Check", back_populates="order")
    approval = relationship("Approval", back_populates="order", uselist=False)
    proof = relationship("Proof", back_populates="order", uselist=False)
    schedule_events = relationship("ScheduleEvent", back_populates="order")


class Check(Base):
    __tablename__ = "checks"

    id = Column(String, primary_key=True)
    order_id = Column(String, ForeignKey("orders.id"), nullable=False)
    step = Column(String, nullable=False)
    result = Column(String, nullable=False)
    score = Column(Numeric(5, 2), nullable=True)
    details_json = Column(JSONB, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        CheckConstraint(
            "step IN ('verify_agent', 'check_mandate', 'authorize_payment', 'scan_injection', 'intent_diff', 'graph_risk', 'decide', 'capture_or_void', 'build_proof')",
            name="ck_checks_step",
        ),
        CheckConstraint(
            "result IN ('pass', 'fail', 'flag', 'error', 'skipped')",
            name="ck_checks_result",
        ),
    )

    order = relationship("Order", back_populates="checks")


class Approval(Base):
    __tablename__ = "approvals"

    id = Column(String, primary_key=True)
    order_id = Column(String, ForeignKey("orders.id"), nullable=False, unique=True)
    requested_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    decided_at = Column(DateTime(timezone=True), nullable=True)
    decision = Column(String, nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        CheckConstraint(
            "decision IS NULL OR decision IN ('approve', 'decline')",
            name="ck_approvals_decision",
        ),
    )

    order = relationship("Order", back_populates="approval")


class Proof(Base):
    __tablename__ = "proofs"

    id = Column(String, primary_key=True)
    order_id = Column(String, ForeignKey("orders.id"), nullable=False, unique=True)
    bundle_json = Column(JSONB, nullable=False)
    sha256 = Column(String, nullable=False)
    signature = Column(String, nullable=False)
    astropods_trace_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    order = relationship("Order", back_populates="proof")


class ScheduleEvent(Base):
    __tablename__ = "schedule_events"

    id = Column(String, primary_key=True)
    agent_id = Column(String, ForeignKey("agents.id"), nullable=False)
    type = Column(String, nullable=False)
    title = Column(String, nullable=False)
    start = Column(DateTime(timezone=True), nullable=False)
    end = Column(DateTime(timezone=True), nullable=False)
    status = Column(String, nullable=False)
    order_id = Column(String, ForeignKey("orders.id"), nullable=True)

    __table_args__ = (
        CheckConstraint(
            "type IN ('mandate_window', 'planned_purchase', 'order')",
            name="ck_schedule_events_type",
        ),
        CheckConstraint(
            "status IN ('tentative', 'confirmed', 'captured', 'pending_approval', 'voided', 'rejected')",
            name="ck_schedule_events_status",
        ),
    )

    agent = relationship("Agent", back_populates="schedule_events")
    order = relationship("Order", back_populates="schedule_events")


class Nonce(Base):
    __tablename__ = "nonces"

    agent_id = Column(String, ForeignKey("agents.id"), primary_key=True)
    nonce = Column(String, primary_key=True)
    seen_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    agent = relationship("Agent", back_populates="nonces")


class CatalogCache(Base):
    __tablename__ = "catalog_cache"

    key = Column(String, primary_key=True)
    payload = Column(JSONB, nullable=False)
    fetched_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class LLMUsage(Base):
    __tablename__ = "llm_usage"

    id = Column(String, primary_key=True)
    profile = Column(String, nullable=False)
    model = Column(String, nullable=False)
    step = Column(String, nullable=False)
    input_tokens = Column(Integer, nullable=False)
    output_tokens = Column(Integer, nullable=False)
    cost_usd = Column(Numeric(10, 6), nullable=False)
    cached = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class LLMCache(Base):
    __tablename__ = "llm_cache"

    key = Column(String, primary_key=True)
    profile = Column(String, nullable=False)
    model = Column(String, nullable=False)
    response = Column(JSONB, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class AuthCode(Base):
    """Email one-time sign-in code. Only an HMAC of the code is stored."""
    __tablename__ = "auth_codes"

    id = Column(String, primary_key=True)
    email = Column(String, nullable=False, index=True)
    code_hash = Column(String, nullable=False)
    attempts = Column(Integer, nullable=False, default=0)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    consumed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class UserSession(Base):
    """Login session. Only a SHA-256 of the bearer token is stored."""
    __tablename__ = "user_sessions"

    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String, nullable=False, unique=True)
    user_agent = Column(String(300), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
