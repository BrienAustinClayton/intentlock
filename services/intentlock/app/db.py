"""Database engine, session factory, and FastAPI dependency."""
import functools
import os
from pathlib import Path

from sqlalchemy import create_engine, Engine
from sqlalchemy.orm import sessionmaker, Session


def _load_env() -> None:
    """Load .env file if DATABASE_URL is not already in the environment."""
    if "DATABASE_URL" not in os.environ:
        try:
            from dotenv import load_dotenv
            _env_path = Path(__file__).parent.parent / ".env"
            load_dotenv(_env_path)
        except ImportError:
            pass


@functools.lru_cache(maxsize=1)
def get_engine() -> Engine:
    """Return (and cache) the SQLAlchemy engine, reading DATABASE_URL lazily."""
    _load_env()
    url: str = os.environ["DATABASE_URL"]
    return create_engine(url, pool_pre_ping=True)


@functools.lru_cache(maxsize=1)
def _get_session_factory() -> sessionmaker:
    return sessionmaker(autocommit=False, autoflush=False, bind=get_engine())


def get_db():
    """FastAPI dependency that yields a database session."""
    factory = _get_session_factory()
    db: Session = factory()
    try:
        yield db
    finally:
        db.close()


def new_session() -> Session:
    """A new Session from the shared factory (for workers outside FastAPI)."""
    return _get_session_factory()()
