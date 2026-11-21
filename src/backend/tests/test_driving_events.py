"""Unit tests for the pure processing functions. No database needed."""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.processing.driving_events import detect_driving_events

START = datetime(2026, 11, 20, 18, 30, tzinfo=UTC)


@dataclass
class Sample:
    timestamp: datetime
    speed_mps: float


def trip(*speeds: float, seconds_apart: float = 1.0) -> list[Sample]:
    """Build samples from a list of speeds, one per ``seconds_apart``."""
    return [
        Sample(START + timedelta(seconds=index * seconds_apart), speed)
        for index, speed in enumerate(speeds)
    ]


def test_smooth_driving_has_no_events() -> None:
    assert detect_driving_events(trip(10, 11, 12, 12.5, 12, 11)) == []


def test_detects_single_harsh_brake() -> None:
    events = detect_driving_events(trip(15, 15, 10, 10))  # -5 m/s^2 between t1 and t2

    assert len(events) == 1
    assert events[0].kind == "harsh_braking"
    assert events[0].peak_acceleration_mps2 == -5
    assert events[0].start == START + timedelta(seconds=1)
    assert events[0].end == START + timedelta(seconds=2)
    assert (events[0].speed_before_mps, events[0].speed_after_mps) == (15, 10)


def test_threshold_is_inclusive() -> None:
    assert detect_driving_events(trip(10, 7))[0].kind == "harsh_braking"  # exactly -3.0
    assert detect_driving_events(trip(10, 7.5)) == []  # -2.5 is fine


def test_consecutive_harsh_samples_are_merged_into_one_event() -> None:
    events = detect_driving_events(trip(20, 16, 11, 10))  # -4, -5, then -1

    assert len(events) == 1
    assert events[0].peak_acceleration_mps2 == -5
    assert events[0].end == START + timedelta(seconds=2)
    assert events[0].speed_after_mps == 11


def test_detects_harsh_acceleration() -> None:
    events = detect_driving_events(trip(5, 9, 10))

    assert [event.kind for event in events] == ["harsh_acceleration"]


def test_brake_then_acceleration_are_two_events() -> None:
    events = detect_driving_events(trip(15, 10, 10, 14))

    assert [event.kind for event in events] == ["harsh_braking", "harsh_acceleration"]


def test_ignores_gaps_longer_than_five_seconds() -> None:
    assert detect_driving_events(trip(30, 0, seconds_apart=10)) == []


def test_unsorted_samples_are_sorted_first() -> None:
    samples = trip(15, 10)
    assert len(detect_driving_events(list(reversed(samples)))) == 1
