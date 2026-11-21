"""Migration tests: the migrations must build exactly the schema the models describe."""

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from fastapi.testclient import TestClient
from sqlalchemy import text

from app import models  # noqa: F401
from app.database import Base, engine, init_db


def current_revision() -> str | None:
    with engine.connect() as connection:
        return MigrationContext.configure(connection).get_current_revision()


def test_migrations_match_the_models(client: TestClient) -> None:
    with engine.connect() as connection:
        differences = compare_metadata(MigrationContext.configure(connection), Base.metadata)

    assert differences == [], f"Models and migrations differ; create a new migration: {differences}"


def test_database_is_at_latest_revision(client: TestClient) -> None:
    assert current_revision() == "0001"


@pytest.mark.parametrize("with_empty_version_table", [False, True])
def test_database_from_old_create_all_code_is_baselined(
    client: TestClient, empty_database: None, with_empty_version_table: bool
) -> None:
    # Simulate a database created by v0.1 (create_all, no migration history) holding data.
    Base.metadata.create_all(bind=engine)
    if with_empty_version_table:
        # Running "alembic revision --autogenerate" against a database leaves this behind.
        with engine.begin() as connection:
            connection.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32))"))
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO sensor_events (event_id, device_id, session_id, event_timestamp, "
                "latitude, longitude, speed_mps, acceleration_x, acceleration_y, acceleration_z) "
                "VALUES ('evt_old', 'phone_01', 'trip_old', now(), 46.77, 23.62, 10, 0, 0, 9.81)"
            )
        )

    init_db()  # what the app does on start-up

    assert current_revision() == "0001"
    assert client.get("/api/events").json()["total_events"] == 1  # the old data survived
