"""Build trip metrics from stored phone sensor samples."""

from datetime import UTC, datetime

from app.models import SensorEvent
from app.schemas import (
    DrivingEvent,
    ScoreDeduction,
    SensorEventRead,
    TripDetail,
    TripSummary,
)

LONGITUDINAL_AXIS = "acceleration_y"
HARSH_BRAKING_THRESHOLD_MPS2 = -3.0
HARSH_ACCELERATION_THRESHOLD_MPS2 = 3.0
HARSH_BRAKING_PENALTY = 10
HARSH_ACCELERATION_PENALTY = 5
MAX_SMOOTHNESS_SCORE = 100


def _utc(value: datetime) -> datetime:
    """Treat naive database datetimes as UTC (SQLite drops timezone metadata)."""
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def _sensor_read(sample: SensorEvent) -> SensorEventRead:
    data = SensorEventRead.model_validate(sample).model_dump()
    data["timestamp"] = _utc(sample.timestamp)
    data["received_at"] = _utc(sample.received_at)
    return SensorEventRead.model_validate(data)


def _kind(event: SensorEvent) -> str | None:
    acceleration = getattr(event, LONGITUDINAL_AXIS)
    if acceleration <= HARSH_BRAKING_THRESHOLD_MPS2:
        return "harsh_braking"
    if acceleration >= HARSH_ACCELERATION_THRESHOLD_MPS2:
        return "harsh_acceleration"
    return None


def _driving_events(samples: list[SensorEvent]) -> list[DrivingEvent]:
    """Collapse adjacent over-threshold readings into one driving event."""
    episodes: list[tuple[str, int, int]] = []
    active_kind: str | None = None
    start_index = 0

    for index, sample in enumerate(samples):
        kind = _kind(sample)
        if kind == active_kind:
            continue
        if active_kind is not None:
            episodes.append((active_kind, start_index, index - 1))
        active_kind = kind
        start_index = index

    if active_kind is not None:
        episodes.append((active_kind, start_index, len(samples) - 1))

    result: list[DrivingEvent] = []
    for kind, first, last in episodes:
        episode_samples = samples[first : last + 1]
        accelerations = [getattr(sample, LONGITUDINAL_AXIS) for sample in episode_samples]
        peak = min(accelerations) if kind == "harsh_braking" else max(accelerations)
        before = samples[first - 1].speed_mps if first > 0 else samples[first].speed_mps
        after = samples[last + 1].speed_mps if last + 1 < len(samples) else samples[last].speed_mps
        result.append(
            DrivingEvent(
                kind=kind,
                start=_utc(episode_samples[0].timestamp),
                end=_utc(episode_samples[-1].timestamp),
                peak_acceleration_mps2=peak,
                speed_before_mps=before,
                speed_after_mps=after,
            )
        )
    return result


def _trip_metrics(
    samples: list[SensorEvent],
) -> tuple[TripSummary, list[DrivingEvent], list[ScoreDeduction]]:
    ordered = sorted(samples, key=lambda sample: (sample.timestamp, sample.id))
    if not ordered:
        raise ValueError("A trip requires at least one sensor sample.")

    started_at = _utc(ordered[0].timestamp)
    ended_at = _utc(ordered[-1].timestamp)
    speed_values = [sample.speed_mps for sample in ordered]
    driving_events = _driving_events(ordered)
    deductions = [
        ScoreDeduction(
            kind=event.kind,
            at=event.start,
            points=(
                HARSH_BRAKING_PENALTY
                if event.kind == "harsh_braking"
                else HARSH_ACCELERATION_PENALTY
            ),
        )
        for event in driving_events
    ]
    braking_count = sum(event.kind == "harsh_braking" for event in driving_events)
    acceleration_count = sum(event.kind == "harsh_acceleration" for event in driving_events)
    score = max(0, MAX_SMOOTHNESS_SCORE - sum(item.points for item in deductions))
    summary = TripSummary(
        session_id=ordered[0].session_id,
        device_id=ordered[0].device_id,
        started_at=started_at,
        ended_at=ended_at,
        duration_seconds=max(0.0, (ended_at - started_at).total_seconds()),
        event_count=len(ordered),
        max_speed_mps=max(speed_values),
        avg_speed_mps=sum(speed_values) / len(speed_values),
        harsh_braking_count=braking_count,
        harsh_acceleration_count=acceleration_count,
        smoothness_score=score,
    )
    return summary, driving_events, deductions


def build_trip_summary(samples: list[SensorEvent]) -> TripSummary:
    """Calculate a summary without serializing the trip's sensor samples."""
    summary, _, _ = _trip_metrics(samples)
    return summary


def build_trip_detail(samples: list[SensorEvent]) -> TripDetail:
    """Calculate one trip summary and preserve its complete sensor sample set."""
    ordered = sorted(samples, key=lambda sample: (sample.timestamp, sample.id))
    summary, driving_events, deductions = _trip_metrics(ordered)
    return TripDetail(
        **summary.model_dump(),
        driving_events=driving_events,
        score_deductions=deductions,
        samples=[_sensor_read(sample) for sample in ordered],
    )
