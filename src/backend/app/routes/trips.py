"""Trip summaries and sensor-backed trip detail."""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, status
from sqlalchemy.orm import Session

from app import repository
from app.database import get_db
from app.errors import ApiError
from app.schemas import ErrorResponse, TripDetail, TripListResponse
from app.trip_analysis import build_trip_detail, build_trip_summary

router = APIRouter(prefix="/api/trips", tags=["trips"])

DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=TripListResponse)
def list_trips(
    db: DbSession,
    limit: Annotated[
        int | None,
        Query(ge=1, description="Maximum number of trips to return."),
    ] = None,
) -> TripListResponse:
    total, grouped_samples = repository.list_trip_events(db, limit)
    return TripListResponse(
        count=total,
        trips=[build_trip_summary(samples) for samples in grouped_samples],
    )


@router.get(
    "/{session_id}",
    response_model=TripDetail,
    responses={404: {"model": ErrorResponse, "description": "Trip not found"}},
)
def get_trip(
    session_id: Annotated[str, Path(min_length=1, max_length=64)],
    db: DbSession,
) -> TripDetail:
    samples = repository.list_session_events(db, session_id)
    if not samples:
        raise ApiError(
            status.HTTP_404_NOT_FOUND,
            "trip_not_found",
            f"No sensor events were found for trip '{session_id}'.",
        )
    return build_trip_detail(samples)
