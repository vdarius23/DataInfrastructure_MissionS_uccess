"""Turn one streamed message into a stored sensor event.

This is the only place where streamed data enters the database. It reuses the API's
contract (``SensorEventCreate``) and the repository, so a reading is validated and stored
exactly as ``POST /api/events`` would have done.
"""

import json
from dataclasses import dataclass
from typing import Literal

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app import repository
from app.schemas import SensorEventCreate

Outcome = Literal["stored", "duplicate", "rejected"]


@dataclass(frozen=True)
class IngestResult:
    outcome: Outcome
    event_id: str | None
    reason: str | None = None


def _validation_summary(exc: ValidationError) -> str:
    parts = []
    for error in exc.errors()[:3]:
        field = ".".join(str(item) for item in error["loc"]) or "body"
        parts.append(f"{field}: {error['msg']}")
    return "; ".join(parts)


def ingest_message(db: Session, body: str | bytes, hub_device_id: str | None) -> IngestResult:
    """Validate and store one message.

    ``hub_device_id`` is the identity IoT Hub authenticated the sender as. When it is set,
    the payload's ``device_id`` must match it, so one phone cannot write data as another.
    Duplicates are expected (IoT Hub delivers at least once) and are skipped, not errors.
    """
    try:
        payload = json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError):
        return IngestResult("rejected", None, "body is not valid JSON")
    if not isinstance(payload, dict):
        return IngestResult("rejected", None, "body must be a JSON object")

    event_id = payload.get("event_id") if isinstance(payload.get("event_id"), str) else None
    try:
        event = SensorEventCreate.model_validate(payload)
    except ValidationError as exc:
        return IngestResult("rejected", event_id, _validation_summary(exc))

    if hub_device_id is not None and event.device_id != hub_device_id:
        reason = f"device_id '{event.device_id}' does not match sender '{hub_device_id}'"
        return IngestResult("rejected", event.event_id, reason)

    try:
        repository.create_event(db, event)
    except repository.DuplicateEventError:
        return IngestResult("duplicate", event.event_id)
    return IngestResult("stored", event.event_id)


def split_replay(text: str) -> list[str]:
    """Split replay input into message bodies: a JSON array or one JSON object per line."""
    stripped = text.strip()
    if stripped.startswith("["):
        return [json.dumps(item) for item in json.loads(stripped)]
    return [line for line in stripped.splitlines() if line.strip()]
