"""Database access layer for sensor events.

Route handlers call these functions and never build SQL themselves. Future trip
processing and driver scoring should add their own repository functions here
(or in a sibling module) rather than querying inside routes.
"""

from sqlalchemy import distinct, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import SensorEvent
from app.schemas import SensorEventCreate

POSTGRES_UNIQUE_VIOLATION = "23505"


class DuplicateEventError(Exception):
    """Raised when an event with the same ``event_id`` is already stored."""

    def __init__(self, event_id: str) -> None:
        super().__init__(f"Event {event_id!r} already exists")
        self.event_id = event_id


def create_event(db: Session, data: SensorEventCreate) -> SensorEvent:
    """Insert one event. Uniqueness is enforced by the database constraint."""
    event = SensorEvent(**data.model_dump())
    db.add(event)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if getattr(exc.orig, "sqlstate", None) == POSTGRES_UNIQUE_VIOLATION:
            raise DuplicateEventError(data.event_id) from exc
        raise
    db.refresh(event)
    return event


def list_recent_events(db: Session, limit: int) -> list[SensorEvent]:
    """Return up to ``limit`` events, newest measurement first."""
    statement = (
        select(SensorEvent)
        .order_by(SensorEvent.timestamp.desc(), SensorEvent.id.desc())
        .limit(limit)
    )
    return list(db.scalars(statement))


def get_event_summary(db: Session) -> tuple[int, int, int]:
    """Return (total events, distinct devices, distinct sessions)."""
    statement = select(
        func.count(SensorEvent.id),
        func.count(distinct(SensorEvent.device_id)),
        func.count(distinct(SensorEvent.session_id)),
    )
    total, devices, sessions = db.execute(statement).one()
    return int(total), int(devices), int(sessions)


def list_recent_session_ids(db: Session, limit: int) -> list[str]:
    """Return up to ``limit`` session ids, the one with the newest event first."""
    statement = (
        select(SensorEvent.session_id)
        .group_by(SensorEvent.session_id)
        .order_by(func.max(SensorEvent.timestamp).desc())
        .limit(limit)
    )
    return list(db.scalars(statement))


def list_events_for_sessions(db: Session, session_ids: list[str]) -> list[SensorEvent]:
    """Return all events of the given sessions, oldest first."""
    if not session_ids:
        return []
    statement = (
        select(SensorEvent)
        .where(SensorEvent.session_id.in_(session_ids))
        .order_by(SensorEvent.timestamp, SensorEvent.id)
    )
    return list(db.scalars(statement))
