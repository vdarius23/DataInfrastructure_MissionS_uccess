"""Runtime configuration, read from environment variables.

All settings have local-development defaults so the API can start without a .env file.
Docker Compose and CI override them explicitly.
"""

import os
from dataclasses import dataclass
from functools import lru_cache

DEFAULT_DATABASE_URL = (
    "postgresql+psycopg://drivesense:drivesense_local_dev@localhost:5432/drivesense"
)
DEFAULT_CORS_ORIGINS = "http://localhost:3000,http://localhost:5173"


def _get_positive_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise ValueError(f"Environment variable {name} must be an integer, got {raw!r}") from exc
    if value < 1:
        raise ValueError(f"Environment variable {name} must be >= 1, got {value}")
    return value


def _get_csv(name: str, default: str) -> tuple[str, ...]:
    raw = os.getenv(name) or default
    return tuple(item.strip() for item in raw.split(",") if item.strip())


@dataclass(frozen=True)
class Settings:
    database_url: str
    cors_origins: tuple[str, ...]
    events_default_limit: int
    events_max_limit: int
    db_connect_timeout_seconds: int


@lru_cache
def get_settings() -> Settings:
    default_limit = _get_positive_int("EVENTS_DEFAULT_LIMIT", 100)
    max_limit = _get_positive_int("EVENTS_MAX_LIMIT", 500)
    if default_limit > max_limit:
        raise ValueError(
            f"EVENTS_DEFAULT_LIMIT ({default_limit}) must not exceed EVENTS_MAX_LIMIT ({max_limit})"
        )
    return Settings(
        database_url=os.getenv("DATABASE_URL") or DEFAULT_DATABASE_URL,
        cors_origins=_get_csv("CORS_ORIGINS", DEFAULT_CORS_ORIGINS),
        events_default_limit=default_limit,
        events_max_limit=max_limit,
        db_connect_timeout_seconds=_get_positive_int("DB_CONNECT_TIMEOUT_SECONDS", 60),
    )