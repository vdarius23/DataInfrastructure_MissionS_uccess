"""Sensor event ingestion and retrieval."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app import repository
from app.config import Settings, get_settings
from app.database import get_db
from app.errors import ApiError
from app.schemas import ErrorResponse, EventListResponse, SensorEventCreate, SensorEventRead

router = APIRouter(prefix="/api/events", tags=["events"])

DbSession = Annotated[Session, Depends(get_db)]
AppSettings = Annotated[Settings, Depends(get_settings)]


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=SensorEventRead,
    responses={
        403: {"model": ErrorResponse, "description": "HTTP ingestion is disabled here"},
        409: {"model": ErrorResponse, "description": "An event with this event_id exists"},
        422: {"model": ErrorResponse, "description": "Validation failed"},
    },
)
def ingest_event(
    payload: SensorEventCreate, db: DbSession, settings: AppSettings
) -> SensorEventRead:
    # Validation has already run at this point, so invalid data still gets a 422 with the field.
    if not settings.http_ingest_enabled:
        raise ApiError(
            status.HTTP_403_FORBIDDEN,
            "http_ingest_disabled",
            "Sending readings over HTTP is disabled here. Devices send through Azure IoT Hub.",
        )
    try:
        event = repository.create_event(db, payload)
    except repository.DuplicateEventError as exc:
        raise ApiError(
            status.HTTP_409_CONFLICT,
            "duplicate_event",
            f"An event with event_id '{exc.event_id}' has already been stored.",
            [{"field": "body.event_id", "message": "Duplicate event_id", "type": "duplicate"}],
        ) from exc
    return SensorEventRead.model_validate(event)


@router.get(
    "",
    response_model=EventListResponse,
    responses={422: {"model": ErrorResponse, "description": "Invalid query parameters"}},
)
def list_events(
    db: DbSession,
    settings: AppSettings,
    limit: Annotated[
        int | None,
        Query(ge=1, description="Maximum events to return (default and maximum are configurable)."),
    ] = None,
) -> EventListResponse:
    effective_limit = settings.events_default_limit if limit is None else limit
    if effective_limit > settings.events_max_limit:
        raise ApiError(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "limit_too_large",
            f"limit must be less than or equal to {settings.events_max_limit}.",
            [{"field": "query.limit", "message": "Exceeds EVENTS_MAX_LIMIT", "type": "too_large"}],
        )

    events = repository.list_recent_events(db, effective_limit)
    total, unique_devices, unique_sessions = repository.get_event_summary(db)
    return EventListResponse(
        total_events=total,
        unique_devices=unique_devices,
        unique_sessions=unique_sessions,
        limit=effective_limit,
        count=len(events),
        events=[SensorEventRead.model_validate(event) for event in events],
    )
