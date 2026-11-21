"""Pydantic schemas: the public API contract.

Changing these models changes the API used by the simulator and the dashboard.
Coordinate such changes with the frontend/mobile owner (see TEAM_WORKFLOW.md).
"""

from datetime import UTC, datetime
from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StringConstraints, field_validator

# Letters, digits and _ . : - ; must start with a letter or digit; 1-64 characters.
IDENTIFIER_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9_.:\-]{0,63}$"

Identifier = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, min_length=1, max_length=64, pattern=IDENTIFIER_PATTERN
    ),
]


def _measurement(ge: float, le: float, description: str):
    # strict=True rejects strings and booleans; finite values only.
    return Field(ge=ge, le=le, strict=True, allow_inf_nan=False, description=description)


EXAMPLE_EVENT = {
    "event_id": "evt_001",
    "device_id": "phone_01",
    "session_id": "trip_001",
    "timestamp": "2026-11-20T18:30:00Z",
    "latitude": 46.7712,
    "longitude": 23.6236,
    "speed_mps": 12.5,
    "acceleration_x": 0.2,
    "acceleration_y": -0.4,
    "acceleration_z": 9.7,
}


class SensorEventCreate(BaseModel):
    """Payload accepted by ``POST /api/events``."""

    model_config = ConfigDict(extra="forbid", json_schema_extra={"examples": [EXAMPLE_EVENT]})

    event_id: Identifier = Field(description="Globally unique event identifier.")
    device_id: Identifier = Field(description="Identifier of the sending phone.")
    session_id: Identifier = Field(description="Identifier of the trip/session.")
    timestamp: AwareDatetime = Field(
        description="Time of measurement, ISO 8601 with timezone (stored as UTC)."
    )
    latitude: float = _measurement(-90, 90, "WGS84 latitude in degrees.")
    longitude: float = _measurement(-180, 180, "WGS84 longitude in degrees.")
    speed_mps: float = _measurement(0, 150, "Ground speed in metres per second.")
    acceleration_x: float = _measurement(-200, 200, "Accelerometer X axis in m/s^2.")
    acceleration_y: float = _measurement(-200, 200, "Accelerometer Y axis in m/s^2.")
    acceleration_z: float = _measurement(-200, 200, "Accelerometer Z axis in m/s^2.")

    @field_validator("timestamp")
    @classmethod
    def normalise_to_utc(cls, value: datetime) -> datetime:
        return value.astimezone(UTC)


class SensorEventRead(BaseModel):
    """A stored sensor event as returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    event_id: str
    device_id: str
    session_id: str
    timestamp: datetime
    received_at: datetime
    latitude: float
    longitude: float
    speed_mps: float
    acceleration_x: float
    acceleration_y: float
    acceleration_z: float


class EventListResponse(BaseModel):
    """Response of ``GET /api/events``: recent events plus dataset-wide summary figures."""

    total_events: int = Field(description="Number of events stored in the database.")
    unique_devices: int = Field(description="Number of distinct device_id values stored.")
    unique_sessions: int = Field(description="Number of distinct session_id values stored.")
    limit: int = Field(description="Maximum number of events requested.")
    count: int = Field(description="Number of events in this response.")
    events: list[SensorEventRead] = Field(description="Events, newest timestamp first.")


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    database: Literal["ok", "unavailable"]
    version: str


class ErrorDetail(BaseModel):
    field: str | None = None
    message: str
    type: str | None = None


class ErrorBody(BaseModel):
    code: str
    message: str
    details: list[ErrorDetail] = Field(default_factory=list)


class ErrorResponse(BaseModel):
    """Shape of every error response returned by the API."""

    error: ErrorBody
