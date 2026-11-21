"""Detect harsh acceleration and harsh braking in one trip.

Method (kept simple on purpose so it can be explained in one sentence each):

1. Sort the samples by time.
2. For every pair of consecutive samples, longitudinal acceleration = change in GPS speed
   divided by the time between them (m/s^2). We use GPS speed rather than the raw
   accelerometer because we do not know how the phone is oriented in the car.
3. A pair at or below -3.0 m/s^2 is harsh braking; at or above +3.0 m/s^2 is harsh
   acceleration. Consecutive harsh pairs of the same kind are merged into one event.
4. Pairs more than 5 seconds apart are ignored (lost GPS signal, phone asleep).
"""

from collections.abc import Sequence
from dataclasses import dataclass, replace
from datetime import datetime
from itertools import pairwise
from typing import Literal, Protocol

HARSH_BRAKING_THRESHOLD_MPS2 = 3.0
HARSH_ACCELERATION_THRESHOLD_MPS2 = 3.0
MAX_GAP_SECONDS = 5.0

EventKind = Literal["harsh_braking", "harsh_acceleration"]


class SpeedSample(Protocol):
    """Anything with a timestamp and a speed: an ORM row, a test object, ..."""

    timestamp: datetime
    speed_mps: float


@dataclass(frozen=True)
class DrivingEvent:
    kind: EventKind
    start: datetime
    end: datetime
    peak_acceleration_mps2: float  # most extreme value; negative for braking
    speed_before_mps: float
    speed_after_mps: float


def classify_acceleration(acceleration_mps2: float) -> EventKind | None:
    if acceleration_mps2 <= -HARSH_BRAKING_THRESHOLD_MPS2:
        return "harsh_braking"
    if acceleration_mps2 >= HARSH_ACCELERATION_THRESHOLD_MPS2:
        return "harsh_acceleration"
    return None


def detect_driving_events(samples: Sequence[SpeedSample]) -> list[DrivingEvent]:
    """Return harsh braking / acceleration events, in time order."""
    ordered = sorted(samples, key=lambda sample: sample.timestamp)
    events: list[DrivingEvent] = []
    current: DrivingEvent | None = None

    for previous, sample in pairwise(ordered):
        seconds = (sample.timestamp - previous.timestamp).total_seconds()
        kind = None
        acceleration = 0.0
        if 0 < seconds <= MAX_GAP_SECONDS:
            acceleration = (sample.speed_mps - previous.speed_mps) / seconds
            kind = classify_acceleration(acceleration)

        if kind is None:
            if current is not None:
                events.append(current)
                current = None
            continue

        continues_current = (
            current is not None and current.kind == kind and current.end == previous.timestamp
        )
        if continues_current:
            current = replace(
                current,
                end=sample.timestamp,
                peak_acceleration_mps2=max(current.peak_acceleration_mps2, acceleration, key=abs),
                speed_after_mps=sample.speed_mps,
            )
        else:
            if current is not None:
                events.append(current)
            current = DrivingEvent(
                kind=kind,
                start=previous.timestamp,
                end=sample.timestamp,
                peak_acceleration_mps2=acceleration,
                speed_before_mps=previous.speed_mps,
                speed_after_mps=sample.speed_mps,
            )

    if current is not None:
        events.append(current)
    return events
