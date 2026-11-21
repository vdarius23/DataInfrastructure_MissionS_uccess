"""Explainable driving-smoothness score from 0 (rough) to 100 (smooth).

Every trip starts at 100. Each harsh event subtracts a fixed number of points, and the
API returns the list of deductions, so a driver can see exactly why they lost points.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from app.processing.driving_events import DrivingEvent, EventKind

PENALTY_POINTS: dict[EventKind, int] = {
    "harsh_braking": 10,
    "harsh_acceleration": 5,
}


@dataclass(frozen=True)
class ScoreDeduction:
    kind: EventKind
    at: datetime
    points: int


@dataclass(frozen=True)
class SmoothnessScore:
    score: int
    deductions: tuple[ScoreDeduction, ...]


def smoothness_score(events: Sequence[DrivingEvent]) -> SmoothnessScore:
    deductions = tuple(
        ScoreDeduction(kind=event.kind, at=event.start, points=PENALTY_POINTS[event.kind])
        for event in events
    )
    total_penalty = sum(deduction.points for deduction in deductions)
    return SmoothnessScore(score=max(0, 100 - total_penalty), deductions=deductions)
