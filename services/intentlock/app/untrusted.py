"""Hygiene for third-party text (product titles, brands, chat replies) before it is shown, stored or sent to a
model. Text from stores and models is data: hidden characters are stripped, and text that talks to an AI
agent is flagged so callers can drop or block it.
"""
from __future__ import annotations

import re
import unicodedata

# Zero-width, bidi overrides and other invisible format characters used to hide instructions.
_INVISIBLE = re.compile(r"[​-‏‪-‮⁠-⁤⁦-⁩﻿­]")

# Phrases aimed at an AI agent rather than a shopper. Narrower than the page scanner's list on purpose:
# product titles legitimately say "gift card" or "Google Assistant", so those go to Jev, not a hard block.
_AGENT_DIRECTED = (
    re.compile(r"\b(?:ai|llm|shopping)\s+(?:agent|assistant|model)s?\b", re.I),
    re.compile(r"\bignore\s+(?:(?:all|any|the|previous|prior|above|earlier|your)\s+)*(?:instructions|rules|prompts?)", re.I),
    re.compile(r"\b(?:system|developer)\s+(?:prompt|message|instructions)\b", re.I),
    re.compile(r"\b(?:the\s+)?user\s+(?:has\s+)?(?:already\s+)?(?:approved|authori[sz]ed|confirmed)\b", re.I),
    re.compile(r"\bdo\s+not\s+(?:tell|mention|show|inform)\b", re.I),
    re.compile(r"\badd\s+.{1,60}?\s+to\s+(?:the\s+|your\s+)?cart\b", re.I),
    re.compile(r"\b(?:apply|use)\s+(?:the\s+)?(?:coupon|promo|discount)\s+code\b", re.I),
    re.compile(r"\b(?:send|email|forward|reveal|share)\s+(?:the\s+|your\s+)?(?:card|payment|password|credentials|token|api\s*key)", re.I),
    re.compile(r"\byou\s+(?:must|should|are\s+required\s+to)\s+(?:buy|purchase|choose|select|recommend)\b", re.I),
    re.compile(r"</?(?:system|instructions?|assistant|tool)>", re.I),
)


def clean(text: object, limit: int = 300) -> str:
    """Printable, visible text: invisible/format characters removed, whitespace collapsed, truncated."""
    s = _INVISIBLE.sub("", str(text or ""))
    s = "".join(ch for ch in s if unicodedata.category(ch) not in ("Cc", "Cf", "Co", "Cs") or ch in " ")
    return " ".join(s.split())[:limit]


def had_hidden_chars(text: object) -> bool:
    return bool(_INVISIBLE.search(str(text or "")))


def talks_to_agent(text: object) -> bool:
    s = clean(text, 4000)
    return any(p.search(s) for p in _AGENT_DIRECTED)


# Fragments of the agent's own prompts and internals. A chat reply containing them is an extraction attempt
# that worked (or a confused model): it is replaced, never shown.
_LEAK_MARKERS = (
    "reply with json", "untrusted_data", "max_unit_price", "you pick the products", "you are sepilo, a shopping",
    "<conversation>", "<candidates>", "<latest>", "agent_run_secret", "agent_private_key", "authorization: bearer",
    "system prompt", "my instructions are", "i was instructed to", "x-admin-key", "channel3_api_key",
)
SAFE_REPLY = "I can help you find products and buy them within your spending rules. What would you like?"


def guard_reply(text: object, limit: int = 2000) -> str:
    """A chat reply fit to show the shopper: visible text only, and no prompt or secret leakage."""
    s = clean(text, limit)
    low = s.lower()
    return SAFE_REPLY if any(m in low for m in _LEAK_MARKERS) else s
