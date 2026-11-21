"""Trip analytics endpoints: summaries, detected driving events and smoothness score."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.errors import ApiError
from app.schemas import ErrorResponse, TripDetailResponse, TripListResponse
from app.services import trips as trip_service

router = APIRouter(prefix="/api/trips", tags=["trips"])

DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=TripListResponse)
def list_trips(
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=100, description="Maximum trips to return.")] = 20,
) -> TripListResponse:
    trips = trip_service.list_trips(db, limit)
    return TripListResponse(count=len(trips), trips=trips)


@router.get(
    "/{session_id}",
    response_model=TripDetailResponse,
    responses={404: {"model": ErrorResponse, "description": "Unknown session_id"}},
)
def get_trip(session_id: str, db: DbSession) -> TripDetailResponse:
    trip = trip_service.get_trip(db, session_id)
    if trip is None:
        raise ApiError(
            status.HTTP_404_NOT_FOUND,
            "trip_not_found",
            f"No events found for session_id '{session_id}'.",
        )
    return trip
