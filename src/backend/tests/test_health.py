from fastapi.testclient import TestClient

from app import __version__


def test_health_returns_ok(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok", "version": __version__}


def test_health_reports_degraded_when_database_unavailable(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr("app.routes.health.ping_database", lambda: False)

    response = client.get("/health")

    assert response.status_code == 503
    assert response.json()["status"] == "degraded"
    assert response.json()["database"] == "unavailable"


def test_unknown_route_returns_json_error(client: TestClient) -> None:
    response = client.get("/does-not-exist")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"
