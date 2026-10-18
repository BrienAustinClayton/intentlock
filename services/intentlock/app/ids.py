"""Prefixed ULID ID generator."""
from ulid import ULID


def new_id(prefix: str) -> str:
    """Return a prefixed ULID string, e.g. new_id('usr') -> 'usr_01H...'."""
    return f"{prefix}_{ULID()}"
