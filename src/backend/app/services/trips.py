"""Trip analytics: stored events (repository) + pure processing functions."""

from collections import defaultdict
from collections.abc import Sequence

from sqlalchemy.orm import Session

from app import repository
from app.models import SensorEvent
from app.processing.driving_events import detect_driving_events
from app.processing.scoring import smoothness_score
from app.schemas import (
    DrivingEventRead,
    ScoreDeductionRead,
    SensorEventRead,
    TripDetailResponse,
    TripSummary,
)


def analyse_trip(session_id: str, events: Sequence[SensorEvent]) -> TripDetailResponse:
    """Full analysis of one trip. ``events`` must not be empty."""
    driving_events = detect_driving_events(events)
    score = smoothness_score(driving_events)
    started_at = min(event.timestamp for event in events)
    ended_at = max(event.timestamp for event in events)
    speeds = [event.speed_mps for event in events]

    return TripDetailResponse(
        session_id=session_id,
        device_id=events[0].device_id,
        started_at=started_at,
        ended_at=ended_at,
        duration_seconds=(ended_at - started_at).total_seconds(),
        event_count=len(events),
        max_speed_mps=max(speeds),
        avg_speed_mps=round(sum(speeds) / len(speeds), 2),
        harsh_braking_count=sum(e.kind == "harsh_braking" for e in driving_events),
        harsh_acceleration_count=sum(e.kind == "harsh_acceleration" for e in driving_events),
        smoothness_score=score.score,
        driving_events=[DrivingEventRead.model_validate(e) for e in driving_events],
        score_deductions=[ScoreDeductionRead.model_validate(d) for d in score.deductions],
        samples=[SensorEventRead.model_validate(event) for event in events],
    )


def list_trips(db: Session, limit: int) -> list[TripSummary]:
    session_ids = repository.list_recent_session_ids(db, limit)
    events_by_session: dict[str, list[SensorEvent]] = defaultdict(list)
    for event in repository.list_events_for_sessions(db, session_ids):
        events_by_session[event.session_id].append(event)

    summaries = []
    for session_id in session_ids:
        detail = analyse_trip(session_id, events_by_session[session_id])
        summaries.append(TripSummary.model_validate(detail.model_dump()))
    return summaries


def get_trip(db: Session, session_id: str) -> TripDetailResponse | None:
    events = repository.list_events_for_sessions(db, [session_id])
    if not events:
        return None
    return analyse_trip(session_id, events)
