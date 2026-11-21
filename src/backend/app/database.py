"""Database engine, session management and schema initialisation."""

import logging
import time
from collections.abc import Iterator

from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    """Base class for all ORM models."""


engine = create_engine(
    get_settings().database_url,
    pool_pre_ping=True,
    # Every connection works in UTC so timestamps are returned consistently.
    connect_args={"options": "-c timezone=utc", "connect_timeout": 5},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """FastAPI dependency that yields a database session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ping_database() -> bool:
    """Return True when the database accepts a trivial query."""
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError:
        return False
    return True


def wait_for_database(timeout_seconds: int, interval_seconds: float = 1.0) -> None:
    """Block until the database is reachable, or raise after ``timeout_seconds``."""
    deadline = time.monotonic() + timeout_seconds
    attempt = 0
    while True:
        attempt += 1
        if ping_database():
            logger.info("Database reachable after %d attempt(s)", attempt)
            return
        if time.monotonic() >= deadline:
            raise RuntimeError(f"Database not reachable after {timeout_seconds} seconds")
        logger.warning("Database not reachable yet (attempt %d); retrying", attempt)
        time.sleep(interval_seconds)


def init_db() -> None:
    """Create tables that do not exist yet. Idempotent and safe to run on every start."""
    from app import models  # noqa: F401  (registers models on Base.metadata)

    Base.metadata.create_all(bind=engine)
