"""Unit tests for the DATABASE_URL scheme normaliser in app.db."""
import pytest
from app.db import normalize_db_url


@pytest.mark.parametrize("input_url, expected", [
    # Render gives postgres:// → must become postgresql+psycopg://
    (
        "postgres://user:pass@host:5432/db",
        "postgresql+psycopg://user:pass@host:5432/db",
    ),
    # Plain postgresql:// (no driver suffix) → normalised
    (
        "postgresql://user:pass@host:5432/db",
        "postgresql+psycopg://user:pass@host:5432/db",
    ),
    # Already correct → unchanged
    (
        "postgresql+psycopg://user:pass@host:5432/db",
        "postgresql+psycopg://user:pass@host:5432/db",
    ),
    # Other schemes → passed through unchanged
    (
        "sqlite:///./test.db",
        "sqlite:///./test.db",
    ),
    # Empty string → unchanged (caller handles missing var)
    ("", ""),
])
def test_normalize_db_url(input_url: str, expected: str) -> None:
    assert normalize_db_url(input_url) == expected


def test_normalize_db_url_preserves_query_string() -> None:
    url = "postgres://user:pass@host:5432/db?sslmode=require"
    result = normalize_db_url(url)
    assert result == "postgresql+psycopg://user:pass@host:5432/db?sslmode=require"


def test_normalize_db_url_no_mutation_on_already_correct() -> None:
    url = "postgresql+psycopg://localhost/intentlock"
    assert normalize_db_url(url) is url or normalize_db_url(url) == url
