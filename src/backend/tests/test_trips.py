"""API tests for /api/trips."""

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

START = datetime(2026, 11, 20, 18, 30, tzinfo=UTC)


def send_trip(client: TestClient, session_id: str, speeds: list[float], start=START) -> None:
    """Post one event per second with the given speeds."""
    for index, speed in enumerate(speeds):
        response = client.post(
            "/api/events",
            json={
                "event_id": f"{session_id}_evt_{index}",
                "device_id": "phone_01",
                "session_id": session_id,
                "timestamp": (start + timedelta(seconds=index)).isoformat(),
                "latitude": 46.7712,
                "longitude": 23.6236,
                "speed_mps": speed,
                "acceleration_x": 0.0,
                "acceleration_y": 0.0,
                "acceleration_z": 9.81,
            },
        )
        assert response.status_code == 201, response.text


def test_no_trips_when_database_is_empty(client: TestClient) -> None:
    response = client.get("/api/trips")

    assert response.status_code == 200
    assert response.json() == {"count": 0, "trips": []}


def test_trip_summary_counts_harsh_braking(client: TestClient) -> None:
    send_trip(client, "trip_a", [10, 12, 13, 8, 8])  # 13 -> 8 is -5 m/s^2

    response = client.get("/api/trips")

    trip = response.json()["trips"][0]
    assert response.status_code == 200
    assert trip["session_id"] == "trip_a"
    assert trip["event_count"] == 5
    assert trip["duration_seconds"] == 4
    assert trip["max_speed_mps"] == 13
    assert trip["harsh_braking_count"] == 1
    assert trip["harsh_acceleration_count"] == 0
    assert trip["smoothness_score"] == 90


def test_trips_are_listed_most_recent_first(client: TestClient) -> None:
    send_trip(client, "trip_old", [10, 10], start=START)
    send_trip(client, "trip_new", [10, 10], start=START + timedelta(hours=1))

    sessions = [trip["session_id"] for trip in client.get("/api/trips").json()["trips"]]

    assert sessions == ["trip_new", "trip_old"]


def test_trip_detail_explains_the_score(client: TestClient) -> None:
    send_trip(client, "trip_b", [15, 10, 10, 14])

    response = client.get("/api/trips/trip_b")

    body = response.json()
    assert response.status_code == 200
    assert body["smoothness_score"] == 85
    assert [event["kind"] for event in body["driving_events"]] == [
        "harsh_braking",
        "harsh_acceleration",
    ]
    assert [deduction["points"] for deduction in body["score_deductions"]] == [10, 5]


def test_unknown_trip_returns_404(client: TestClient) -> None:
    response = client.get("/api/trips/does_not_exist")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "trip_not_found"
