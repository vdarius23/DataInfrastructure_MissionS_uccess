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


def list_trip_events(db: Session, limit: int | None = None) -> tuple[int, list[list[SensorEvent]]]:
    """Return samples grouped by session, newest sessions first.

    The summaries are computed from full sessions, so the limit applies to trips,
    never to sensor samples inside a trip.
    """
    total = int(
        db.scalar(select(func.count(distinct(SensorEvent.session_id)))) or 0
    )
    session_statement = (
        select(SensorEvent.session_id)
        .group_by(SensorEvent.session_id)
        .order_by(func.max(SensorEvent.timestamp).desc(), func.max(SensorEvent.id).desc())
    )
    if limit is not None:
        session_statement = session_statement.limit(limit)
    session_ids = list(db.scalars(session_statement))
    if not session_ids:
        return total, []

    statement = (
        select(SensorEvent)
        .where(SensorEvent.session_id.in_(session_ids))
        .order_by(SensorEvent.session_id, SensorEvent.timestamp, SensorEvent.id)
    )
    grouped: dict[str, list[SensorEvent]] = {session_id: [] for session_id in session_ids}
    for event in db.scalars(statement):
        grouped[event.session_id].append(event)
    return total, [grouped[session_id] for session_id in session_ids]


def list_session_events(db: Session, session_id: str) -> list[SensorEvent]:
    """Return every sensor sample for one session, in measurement order."""
    statement = (
        select(SensorEvent)
        .where(SensorEvent.session_id == session_id)
        .order_by(SensorEvent.timestamp, SensorEvent.id)
    )
    return list(db.scalars(statement))
