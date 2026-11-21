"""Unit tests for the smoothness score. Events are built by hand, so only scoring is tested."""

from datetime import UTC, datetime, timedelta

from app.processing.driving_events import DrivingEvent, EventKind
from app.processing.scoring import smoothness_score

START = datetime(2026, 11, 20, 18, 30, tzinfo=UTC)


def event(kind: EventKind, second: int = 0) -> DrivingEvent:
    return DrivingEvent(
        kind=kind,
        start=START + timedelta(seconds=second),
        end=START + timedelta(seconds=second + 1),
        peak_acceleration_mps2=-5.0 if kind == "harsh_braking" else 4.0,
        speed_before_mps=15.0,
        speed_after_mps=10.0,
    )


def test_score_is_100_without_events() -> None:
    result = smoothness_score([])

    assert result.score == 100
    assert result.deductions == ()


def test_score_subtracts_points_per_event() -> None:
    result = smoothness_score([event("harsh_braking", 1), event("harsh_acceleration", 5)])

    assert result.score == 85
    assert [deduction.points for deduction in result.deductions] == [10, 5]
    assert result.deductions[0].at == START + timedelta(seconds=1)


def test_score_never_goes_below_zero() -> None:
    assert smoothness_score([event("harsh_braking")] * 12).score == 0
