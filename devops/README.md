# DriveSense — DevOps

**Owner:** Member 2 — Infrastructure & DevOps
(also owns `.github/workflows/`, `docker-compose.yml`, `src/backend/Dockerfile`, `src/frontend/Dockerfile`)

## Local orchestration (Docker Compose)

| Service                            | Image / build                       | Host port     | Internal address      | Health check                 |
| ---------------------------------- | ----------------------------------- | ------------- | --------------------- | ---------------------------- |
| `db`                               | `postgres:16-alpine`                | not published | `db:5432`             | `pg_isready`                 |
| `backend`                          | `src/backend` (target `runtime`)    | `8000`        | `http://backend:8000` | `GET /health` returns 200    |
| `frontend`                         | `src/frontend` (Vite build → nginx) | `3000`        | `http://frontend:80`  | `GET /`                      |
| `db-test` _(profile `test`)_       | `postgres:16-alpine` on tmpfs       | `5433`        | `db-test:5432`        | `pg_isready`                 |
| `backend-tests` _(profile `test`)_ | `src/backend` (target `test`)       | —             | —                     | runs Ruff + pytest and exits |

Start-up order is enforced with `depends_on: condition: service_healthy`:
`db` (healthy) → `backend` (healthy) → `frontend`. The backend also retries the database
connection for `DB_CONNECT_TIMEOUT_SECONDS` itself, so it works without Compose too.

**Networking:** the browser only talks to `http://localhost:3000`. nginx in the frontend container
serves the React build and reverse-proxies `/api/*` and `/health` to `BACKEND_URL`
(`http://backend:8000`, the Compose service name). This avoids CORS issues and hard-coded hosts.
The backend is also published on `localhost:8000` for the simulator, Swagger UI and debugging.

**Persistence:** PostgreSQL data lives in the named volume `drivesense_pgdata`.
`docker compose down` keeps it; `docker compose down -v` deletes it.

### Commands

```powershell
docker compose up --build              # start everything (foreground)
docker compose up --build -d --wait    # start in background and wait until healthy
docker compose ps                      # status + health
docker compose logs -f backend         # follow logs
docker compose down                    # stop (keep data)
docker compose down -v                 # stop and delete database volume

docker compose --profile test run --rm backend-tests   # Ruff + pytest on a disposable DB
docker compose --profile test down                     # stop the test database
```

## Configuration

All configuration is via environment variables. See [`../.env.example`](../.env.example).
Compose has local-only defaults for every variable, so `.env` is optional. Real
credentials must never be committed; in Azure they will come from Container Apps secrets.

## Container images

- **Backend:** multi-stage `python:3.12-slim`. `runtime` stage contains only runtime dependencies and the
  `app/` package, and runs as non-root user `appuser` (uid 10001). `test` stage adds pytest/Ruff and the tests.
- **Frontend:** `node:22-alpine` build stage (`npm ci` + `npm run build`) → `nginx:1.27-alpine`.
  The nginx config is a template rendered with `envsubst` at start-up (`BACKEND_URL`).

## CI pipeline (`.github/workflows/ci.yml`)

Triggers: pull requests targeting `main`, pushes to `main`, manual dispatch.

| Job                                  | Steps                                                                                                                                                                        |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Backend · Ruff + pytest**          | checkout → Python 3.12 → `pip install -r requirements-dev.txt` → `ruff check` → `ruff format --check` → lint simulator → `pytest` against a PostgreSQL 16 service container  |
| **Frontend · build**                 | checkout → Node 22 → `npm ci` → `npm run build` (TypeScript type-check + Vite build)                                                                                         |
| **Docker · images + Compose config** | `docker compose config` (default + test profile) → build backend image → build frontend image                                                                                |
| **Terraform · fmt + validate**       | `terraform fmt -check` → `terraform init -backend=false` → `terraform validate` (no Azure credentials needed)                                                                |
| **End-to-end smoke test**            | (after the first three) `docker compose up --wait` → simulator sends 10 events → verifies `GET /api/events` through the nginx proxy returns 10 → logs on failure → `down -v` |

**Code owners:** `.github/CODEOWNERS` requests a review from the owner of every area a PR touches.

Recommended GitHub settings for `main` (Settings → Branches → Branch protection):
require a pull request, require the CI checks above to pass, require 1 approval, disallow force pushes.

## Planned (not implemented yet)

- **Images in a registry:** on push to `main`, build both images and publish them to GitHub Container Registry,
  tagged with the commit.
- **Azure deployment:** Azure Container Apps + PostgreSQL Flexible Server, defined in Terraform
  (`infrastructure/terraform`). Deployed by hand first; automatic deployment from CI later.
- **Monitoring:** Container Apps logs → Log Analytics; alert on `/health` failures.
- **Image scanning** (e.g. Trivy) and Dependabot updates.
