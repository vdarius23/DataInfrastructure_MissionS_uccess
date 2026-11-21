"""Test fixtures.

Tests run against a dedicated, disposable PostgreSQL database given by TEST_DATABASE_URL.
They never touch the development database. Start one locally with:

    docker compose --profile test up -d db-test

or run the whole suite in Docker:

    docker compose --profile test run --rm backend-tests
"""

import os
from collections.abc import Iterator

import pytest
from sqlalchemy.engine import make_url

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "").strip()
if not TEST_DATABASE_URL:
    pytest.exit(
        "TEST_DATABASE_URL is not set. Start the disposable test database with "
        "'docker compose --profile test up -d db-test' and set TEST_DATABASE_URL "
        "(see .env.example), or run 'docker compose --profile test run --rm backend-tests'.",
        returncode=2,
    )
if "test" not in (make_url(TEST_DATABASE_URL).database or ""):
    pytest.exit(
        "Refusing to run: the TEST_DATABASE_URL database name must contain 'test' "
        "because the test suite drops and truncates tables.",
        returncode=2,
    )

# Configure the application before it is imported. Fixed limits keep tests deterministic.
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["EVENTS_DEFAULT_LIMIT"] = "20"
os.environ["EVENTS_MAX_LIMIT"] = "50"
os.environ["DB_CONNECT_TIMEOUT_SECONDS"] = "30"
os.environ["CORS_ORIGINS"] = "http://localhost:5173"

from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import Base, SessionLocal, engine, wait_for_database
from app.main import app


@pytest.fixture(scope="session")
def api_client() -> Iterator[TestClient]:
    wait_for_database(timeout_seconds=30)
    Base.metadata.drop_all(bind=engine)  # start from a clean schema
    with TestClient(app) as client:  # runs the app lifespan -> init_db()
        yield client
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client(api_client: TestClient) -> TestClient:
    """A client whose database is empty at the start of every test."""
    with engine.begin() as connection:
        connection.execute(text("TRUNCATE TABLE sensor_events RESTART IDENTITY"))
    return api_client


@pytest.fixture
def db_session(client: TestClient) -> Iterator[Session]:
    with SessionLocal() as session:
        yield session
