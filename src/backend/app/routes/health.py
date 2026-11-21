"""Health endpoint used by Docker, CI and the dashboard connection indicator."""

from fastapi import APIRouter, Response, status

from app import __version__
from app.database import ping_database
from app.schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get(
    "/health",
    response_model=HealthResponse,
    responses={503: {"model": HealthResponse, "description": "Database unavailable"}},
)
def health(response: Response) -> HealthResponse:
    database_ok = ping_database()
    if not database_ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return HealthResponse(
        status="ok" if database_ok else "degraded",
        database="ok" if database_ok else "unavailable",
        version=__version__,
    )
