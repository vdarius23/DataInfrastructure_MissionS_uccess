# DriveSense — DevOps

**Owner:** Member 2 — Infrastructure & DevOps
(also owns `.github/workflows/`, `docker-compose.yml`, `src/backend/Dockerfile`, `src/frontend/Dockerfile`)

**Live on Azure:** https://ca-drivesense-dev-web.purplegrass-72d50f53.francecentral.azurecontainerapps.io
(infrastructure: [`../infrastructure/terraform/README.md`](../infrastructure/terraform/README.md))

## The whole chain

```text
pull request ──► CI (5 jobs) ──► merge to main ──► CI on main ──► Release images ──► ghcr.io
                                                                                       │
                                     terraform apply -var image_tag=sha-<commit>  ◄────┘
                                                        │
                                                        ▼
phone / simulator ──MQTT──► Azure IoT Hub ──► ingestor ──► PostgreSQL ◄── API ◄── nginx ◄── dashboard
```

## Local orchestration (Docker Compose)

| Service                            | Image / build                         | Host port     | Internal address      | Health check                 |
| ---------------------------------- | ------------------------------------- | ------------- | --------------------- | ---------------------------- |
| `db`                               | `postgres:16-alpine`                  | not published | `db:5432`             | `pg_isready`                 |
| `backend`                          | `src/backend` (target `runtime`)      | `8000`        | `http://backend:8000` | `GET /health` returns 200    |
| `frontend`                         | `src/frontend` (Vite build → nginx)   | `3000`        | `http://frontend:80`  | `GET /`                      |
| `ingestor` _(profile `iothub`)_    | `src/backend` (runtime, `python -m app.ingest`) | —   | —                     | logs every stored reading    |
| `db-test` _(profile `test`)_       | `postgres:16-alpine` on tmpfs         | `5433`        | `db-test:5432`        | `pg_isready`                 |
| `backend-tests` _(profile `test`)_ | `src/backend` (target `test`)         | —             | —                     | runs Ruff + pytest and exits |

Start-up order is enforced with `depends_on: condition: service_healthy`:
`db` (healthy) → `backend` (healthy) → `frontend`. The backend also retries the database
connection for `DB_CONNECT_TIMEOUT_SECONDS` itself, and applies the database migrations (Alembic) at start-up.

**Networking:** the browser only talks to `http://localhost:3000`. nginx in the frontend container
serves the React build and reverse-proxies `/api/*` and `/health` to `BACKEND_URL`
(`http://backend:8000`, the Compose service name). This avoids CORS issues and hard-coded hosts.
The backend is also published on `localhost:8000` for Swagger UI and debugging.

**The ingestor** reads the IoT Hub stream and stores readings. It needs `IOTHUB_EVENTS_CONNECTION_STRING`
in `.env` (`terraform output -raw iothub_events_connection_string`) and reads with the `$Default` consumer group,
so it never competes with the ingestor on Azure. Without IoT Hub, use **replay mode**: it feeds the same handler
from a file. CI and the offline demo use it.

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

docker compose --profile iothub up -d ingestor          # read the real IoT Hub stream
docker compose --profile test run --rm backend-tests   # Ruff + pytest on a disposable DB
docker compose --profile test down                     # stop the test database

# Replay simulated readings through the ingestor (no Azure needed)
py src\mobile\simulator\send_events.py --dry-run --count 10 > events.json
Get-Content events.json -Raw | docker compose run --rm -T ingestor python -m app.ingest --replay -
```

## Configuration

All configuration is via environment variables. See [`../.env.example`](../.env.example).
Compose has local-only defaults for every variable, so `.env` is optional. Real
credentials (device connection strings, the IoT Hub connection string) are never committed;
in Azure they are Container Apps secrets.

## Container images

- **Backend:** multi-stage `python:3.12-slim`. `runtime` stage contains only runtime dependencies and the
  `app/` package (including the migrations and the ingestor), and runs as non-root user `appuser` (uid 10001).
  `test` stage adds pytest/Ruff and the tests. The same image runs the API and the ingestor.
- **Frontend:** `node:22-alpine` build stage (`npm ci` + `npm run build`) → `nginx:1.27-alpine`.
  The nginx config is a template rendered with `envsubst` at start-up (`BACKEND_URL`).

## CI pipeline (`.github/workflows/ci.yml`)

Triggers: pull requests targeting `main`, pushes to `main`, manual dispatch.

| Job                                  | Steps                                                                                                                                                                         |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Backend · Ruff + pytest**          | checkout → Python 3.12 → `pip install -r requirements-dev.txt` → `ruff check` → `ruff format --check` → lint simulator → `pytest` against a PostgreSQL 16 service container   |
| **Frontend · build**                 | checkout → Node 22 → `npm ci` → `npm run build` (TypeScript type-check + Vite build)                                                                                          |
| **Docker · images + Compose config** | `docker compose config` (default + test profile) → build backend image → build frontend image                                                                                 |
| **Terraform · fmt + validate**       | `terraform fmt -check` → `terraform init -backend=false` → `terraform validate` (no Azure credentials needed)                                                                 |
| **End-to-end smoke test**            | (after the first three) `docker compose up --wait` → simulator readings replayed through the ingestor → verifies `GET /api/events` through the nginx proxy returns 10 → logs on failure → `down -v` |

## Release images (`.github/workflows/release.yml`)

When CI succeeds on `main`, the exact commit CI tested is built and pushed to GitHub Container Registry as
`ghcr.io/vdarius23/datainfrastructure_missions_uccess/{backend,frontend}`, tagged `sha-<commit>` (never changes,
used to deploy and roll back) and `latest`. It logs in with the workflow's own `GITHUB_TOKEN`: no stored password.
The packages are public, so Azure pulls them without registry credentials.

## Deploying to Azure

Deployment is done by hand, by the owner of the Terraform state, after **Release images** is green:

```powershell
cd infrastructure\terraform
$tag = "sha-" + (git rev-parse --short=7 HEAD)
terraform apply -var image_tag=$tag
```

Details, regions and the Azure limits we hit are in [`../infrastructure/terraform/README.md`](../infrastructure/terraform/README.md).

## Repository rules

- **Branch protection on `main`:** pull request required, 1 approval, all five CI checks must pass, no force pushes.
- **Code owners:** `.github/CODEOWNERS` requests a review from the owner of every area a PR touches.
- **Pull request template:** every PR says what changed, which area, and how it was tested.

## Planned (not implemented yet)

- **Automatic deployment** from CI with a GitHub OIDC login to Azure (no stored secrets).
- **Remote Terraform state** in Azure Storage, so more than one person can deploy.
- **Monitoring:** alert on `/health` failures from the Container Apps logs in Log Analytics.
- **Image scanning** (e.g. Trivy) and Dependabot updates.
