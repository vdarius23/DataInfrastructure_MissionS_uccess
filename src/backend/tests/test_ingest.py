"""Tests for the IoT Hub ingestion handler. No Azure needed: messages are plain strings."""

import json

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.ingest.handler import ingest_message, split_replay
from app.schemas import EXAMPLE_EVENT


def message(**changes) -> str:
    return json.dumps({**EXAMPLE_EVENT, **changes})


def test_valid_message_is_stored_and_served_by_the_api(
    client: TestClient, db_session: Session
) -> None:
    result = ingest_message(db_session, message(), hub_device_id="phone_01")

    assert result.outcome == "stored"
    body = client.get("/api/events").json()
    assert body["total_events"] == 1
    assert body["events"][0]["event_id"] == EXAMPLE_EVENT["event_id"]


def test_redelivered_message_is_a_duplicate_not_an_error(db_session: Session) -> None:
    ingest_message(db_session, message(), hub_device_id="phone_01")

    result = ingest_message(db_session, message(), hub_device_id="phone_01")

    assert result.outcome == "duplicate"


def test_device_cannot_write_as_another_device(client: TestClient, db_session: Session) -> None:
    result = ingest_message(db_session, message(device_id="phone_99"), hub_device_id="phone_01")

    assert result.outcome == "rejected"
    assert "does not match" in (result.reason or "")
    assert client.get("/api/events").json()["total_events"] == 0


def test_invalid_reading_is_rejected_with_the_field(db_session: Session) -> None:
    result = ingest_message(db_session, message(latitude=95), hub_device_id="phone_01")

    assert result.outcome == "rejected"
    assert "latitude" in (result.reason or "")


def test_malformed_body_is_rejected(db_session: Session) -> None:
    assert ingest_message(db_session, b"not json", hub_device_id=None).outcome == "rejected"
    assert ingest_message(db_session, "[1, 2]", hub_device_id=None).outcome == "rejected"


def test_split_replay_accepts_array_and_json_lines() -> None:
    events = [EXAMPLE_EVENT, {**EXAMPLE_EVENT, "event_id": "evt_002"}]

    assert len(split_replay(json.dumps(events))) == 2
    assert len(split_replay("\n".join(json.dumps(e) for e in events) + "\n")) == 2


def test_split_replay_ignores_a_windows_byte_order_mark() -> None:
    # What Windows PowerShell pipes in: a BOM, then pretty-printed JSON with CRLF line ends.
    text = "\ufeff" + json.dumps([EXAMPLE_EVENT], indent=2).replace("\n", "\r\n")

    assert len(split_replay(text)) == 1
