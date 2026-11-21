from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import SensorEvent


def make_event(**overrides: Any) -> dict[str, Any]:
    event = {
        "event_id": "evt_001",
        "device_id": "phone_01",
        "session_id": "trip_001",
        "timestamp": "2026-11-20T18:30:00Z",
        "latitude": 46.7712,
        "longitude": 23.6236,
        "speed_mps": 12.5,
        "acceleration_x": 0.2,
        "acceleration_y": -0.4,
        "acceleration_z": 9.7,
    }
    event.update(overrides)
    return event


def parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def error_fields(response) -> list[str]:
    return [detail["field"] for detail in response.json()["error"]["details"]]


# --- Retrieval -------------------------------------------------------------------------------


def test_empty_database_returns_empty_event_list(client: TestClient) -> None:
    response = client.get("/api/events")

    assert response.status_code == 200
    assert response.json() == {
        "total_events": 0,
        "unique_devices": 0,
        "unique_sessions": 0,
        "limit": 20,
        "count": 0,
        "events": [],
    }


def test_retrieves_stored_events_newest_first(client: TestClient) -> None:
    client.post("/api/events", json=make_event(event_id="evt_a", timestamp="2026-11-20T18:30:00Z"))
    client.post("/api/events", json=make_event(event_id="evt_b", timestamp="2026-11-20T18:30:02Z"))
    client.post(
        "/api/events",
        json=make_event(event_id="evt_c", device_id="phone_02", timestamp="2026-11-20T18:30:01Z"),
    )

    response = client.get("/api/events")

    assert response.status_code == 200
    body = response.json()
    assert body["total_events"] == 3
    assert body["unique_devices"] == 2
    assert body["unique_sessions"] == 1
    assert body["count"] == 3
    assert [event["event_id"] for event in body["events"]] == ["evt_b", "evt_c", "evt_a"]
    first = body["events"][0]
    assert first["latitude"] == 46.7712
    assert first["acceleration_z"] == 9.7
    assert "received_at" in first


def test_limit_restricts_returned_events_but_not_totals(client: TestClient) -> None:
    for index in range(3):
        client.post("/api/events", json=make_event(event_id=f"evt_{index}"))

    response = client.get("/api/events", params={"limit": 2})

    body = response.json()
    assert response.status_code == 200
    assert body["count"] == 2
    assert body["limit"] == 2
    assert body["total_events"] == 3


def test_limit_above_configured_maximum_is_rejected(client: TestClient) -> None:
    response = client.get("/api/events", params={"limit": 51})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "limit_too_large"


# --- Ingestion -------------------------------------------------------------------------------


def test_ingests_valid_event(client: TestClient, db_session: Session) -> None:
    response = client.post("/api/events", json=make_event())

    assert response.status_code == 201
    body = response.json()
    assert body["event_id"] == "evt_001"
    assert body["device_id"] == "phone_01"
    assert parse_time(body["timestamp"]) == datetime(2026, 11, 20, 18, 30, tzinfo=UTC)
    assert parse_time(body["received_at"]).tzinfo is not None

    stored = db_session.scalars(select(SensorEvent)).all()
    assert len(stored) == 1
    assert stored[0].event_id == "evt_001"
    assert stored[0].speed_mps == 12.5


def test_timestamp_is_normalised_to_utc(client: TestClient) -> None:
    response = client.post("/api/events", json=make_event(timestamp="2026-11-20T20:30:00+02:00"))

    assert response.status_code == 201
    assert parse_time(response.json()["timestamp"]) == datetime(2026, 11, 20, 18, 30, tzinfo=UTC)


@pytest.mark.parametrize("latitude", [90.0001, -90.5, 180])
def test_rejects_invalid_latitude(client: TestClient, latitude: float) -> None:
    response = client.post("/api/events", json=make_event(latitude=latitude))

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert "body.latitude" in error_fields(response)


@pytest.mark.parametrize("longitude", [180.0001, -181, 360])
def test_rejects_invalid_longitude(client: TestClient, longitude: float) -> None:
    response = client.post("/api/events", json=make_event(longitude=longitude))

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert "body.longitude" in error_fields(response)


def test_rejects_duplicate_event_id(client: TestClient) -> None:
    first = client.post("/api/events", json=make_event())
    second = client.post("/api/events", json=make_event(speed_mps=3.0))

    assert first.status_code == 201
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "duplicate_event"
    assert client.get("/api/events").json()["total_events"] == 1


def test_rejects_timestamp_without_timezone(client: TestClient) -> None:
    response = client.post("/api/events", json=make_event(timestamp="2026-11-20T18:30:00"))

    assert response.status_code == 422
    assert "body.timestamp" in error_fields(response)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("event_id", ""),
        ("device_id", "   "),
        ("session_id", "trip 001"),
        ("speed_mps", -1),
        ("speed_mps", "12.5"),
        ("acceleration_x", True),
    ],
)
def test_rejects_invalid_values(client: TestClient, field: str, value: Any) -> None:
    response = client.post("/api/events", json=make_event(**{field: value}))

    assert response.status_code == 422
    assert f"body.{field}" in error_fields(response)


def test_rejects_missing_required_field(client: TestClient) -> None:
    payload = make_event()
    del payload["device_id"]

    response = client.post("/api/events", json=payload)

    assert response.status_code == 422
    assert "body.device_id" in error_fields(response)


def test_rejects_unknown_fields(client: TestClient) -> None:
    response = client.post("/api/events", json=make_event(unexpected="value"))

    assert response.status_code == 422


def test_rejects_malformed_json(client: TestClient) -> None:
    response = client.post(
        "/api/events", content=b"{not json", headers={"Content-Type": "application/json"}
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
