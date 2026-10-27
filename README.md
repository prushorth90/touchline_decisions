# Fantasy Premier League Recommendation App

Full-stack FPL analysis application with live team, squad, player, fixture, deterministic recommendation, and AI Coach data.

## Stack

- Frontend: React 19, TypeScript, Vite 8, React Router, and Tailwind CSS 4
- Backend: Python 3.13, FastAPI, httpx, SQLAlchemy, and Alembic
- Infrastructure: PostgreSQL 17, Redis 8, and Docker Compose
- API documentation: Swagger UI and OpenAPI

## Project Structure

```text
.
├── .github/agents/       Runtime-validated Coach agent definitions
├── backend/
│   ├── app/              FastAPI application and deterministic FPL logic
│   ├── migrations/       Alembic database migrations
│   └── tests/            Pytest backend tests
├── lambda/
│   └── gameweek_analysis/ Standalone Python 3.13 FPL form-ranking Lambda
├── infra/                Independent AWS CDK v2 Lambda deployment
└── frontend/             React application
```

The [gameweek analysis Lambda](lambda/gameweek_analysis/README.md) runs and tests
independently of the backend, databases, and AWS. Its guide includes local
invocation and a statement-by-statement execution walkthrough.

To deploy only this Lambda to AWS, see the separate
[CDK infrastructure guide](infra/README.md). This does not deploy or modify
the Docker Compose application.

## Prerequisites

- Docker Desktop for the recommended workflow
- Python 3.13 for standalone backend development
- Node.js 22 and npm 10 for standalone frontend development

## Docker Development

Create the local environment file and start the complete stack:

```bash
cp .env.example .env
docker compose up --build
```

Services are exposed at:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:5082`
- Health: `http://localhost:5082/health`
- Swagger: `http://localhost:5082/swagger`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

The development containers bind-mount both source trees. Vite and Uvicorn reload changes automatically. Alembic upgrades run before Uvicorn starts.

```bash
docker compose ps
docker compose logs -f backend
docker compose down
```

Use `docker compose down --volumes` only when the PostgreSQL and Redis data may be discarded.

### Existing database password mismatch

PostgreSQL applies `POSTGRES_USER`, `POSTGRES_DB`, and `POSTGRES_PASSWORD` only when
initializing an empty data volume. Changing `.env` does not change existing database
credentials. If PostgreSQL is unhealthy or the backend reports `password authentication
failed`, restore the original password in `.env`, or explicitly update the stored
password to match the current configuration.

For the development container, the following preserves existing data and updates the
configured user's password through its local administrative connection:

```bash
docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

At the `psql` prompt, run the following and enter the current `.env` password twice:

```text
\password
\q
```

Then rebuild and wait for all services to become healthy:

```bash
docker compose up --build -d --wait
```

The PostgreSQL health check verifies password authentication over the container
network, not just whether the server accepts connections.

## Backend Development

Create and activate a Python 3.13 virtual environment, then install the project:

```bash
cd backend
python3.13 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
```

Set values from `backend/.env.example`, ensure PostgreSQL and Redis are running, and start the API:

```bash
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 5082
```

Run backend checks:

```bash
ruff check app tests migrations
mypy app
pytest --cov=app --cov-report=term-missing
alembic heads
```

The backend accepts both Python-native environment names and the existing double-underscore deployment names such as `ConnectionStrings__PostgreSQL`, `Redis__ConnectionString`, and `Security__RequestLimitPerMinute`.

## Frontend Development

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

For standalone development, set `VITE_API_BASE_URL=http://localhost:5082` in `frontend/.env`.

Run frontend checks:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## API Contracts

The React application uses these preserved endpoints:

- `GET /api/fpl/team/{teamId}`
- `GET /api/fpl/team/{teamId}/squad`
- `GET /api/fpl/players`
- `GET /api/fpl/fixtures`
- `GET /api/fpl/leagues/{leagueId}/standings`
- `GET /api/recommendations/{teamId}/captain`
- `GET /api/recommendations/{teamId}/lineup`
- `GET /api/recommendations/{teamId}/transfers`
- `GET /api/recommendations/{teamId}/history`
- `POST /api/coach/chat`
- `POST /api/coach/chat/stream`
- `GET`, `POST`, and `PUT /api/profiles`
- `GET /health`
- `GET /api/insights/gameweek`

Existing response fields remain camelCase. Insights preserve the Lambda report's mixed naming (`generatedAt` and `total_points`). The Coach streaming endpoint emits `progress`, then `complete`, or an `error` event after streaming has started. Validation and operational errors use `application/problem+json`.

FastAPI handlers declare Pydantic request and response models and resolve application services through `Depends`. A lifespan-created container owns the shared `httpx` client, Redis connection, SQLAlchemy engine/session factory, persistence service, recommendation service, and Coach orchestrator. Tests replace dependencies with `app.dependency_overrides`.

## Gameweek Insights

`GET /api/insights/gameweek` returns the last published report, not a live FPL
calculation. The S3 contract is the object written by the Lambda handler, rather
than its invocation response (which uses `generated_at`):

```json
{
  "generatedAt": "2026-10-27T12:00:00Z",
  "players": [
    {"name": "Sample Player 1", "form": 9.5, "total_points": 80}
  ]
}
```

The timestamp is timezone-aware. Up to five players are returned in the Lambda's
descending-form order, including its stable ordering for ties. Reports with more
than five players or malformed fields are rejected, not silently truncated.

### Local mode (no AWS credentials)

`INSIGHTS_SOURCE=fixture` is the backend default and is explicitly set by
development Compose. The bundled
[fixture](backend/app/fixtures/gameweek.json) contains five **synthetic** players
and a fixed timestamp; it is not live advice. Optionally set
`INSIGHTS_FIXTURE_PATH` to another Lambda-compatible JSON file (inside the
container when using Docker). Both backend images include the bundled fixture.
No boto3 client, AWS credential lookup, or S3 request occurs in fixture mode.

```bash
curl http://localhost:5082/api/insights/gameweek
```

### S3 mode

Set `INSIGHTS_SOURCE=s3`, `REPORT_BUCKET` to the CDK stack's `ReportBucketName`
output, and `AWS_DEFAULT_REGION` to the deployed bucket's region. Production
Compose forwards these settings and defaults to S3; set `INSIGHTS_SOURCE=fixture`
in its environment file for a credential-free demo. No AWS credentials are needed
at application startup, even in S3 mode. An unconfigured S3 request returns 503
without affecting the other endpoints.

Use the standard boto3 credential chain (prefer an IAM workload role on AWS).
For standalone local S3 access, an AWS profile is also supported. Container S3
access requires explicitly supplying a role or credentials/profile mount through
your deployment configuration; Compose does not mount host credentials. Do not
commit AWS keys. The backend identity needs only `s3:GetObject` on
`arn:aws:s3:::<bucket>/reports/latest.json` (plus `kms:Decrypt` if using a
customer-managed KMS key). The existing Lambda's write-only role is separate and
is not changed by this integration.

### Request flow and errors

1. The existing FastAPI application routes the request to the insights router.
2. `Depends(get_insights_service)` resolves the lifespan-created insights service
   from `AppContainer`.
3. The synchronous route runs in FastAPI's worker pool, keeping blocking file and
   boto3 I/O off the async event loop.
4. The service reads either the fixture or S3's `reports/latest.json` using
   `get_object`, bounded connection/read timeouts, and at most three SDK attempts.
   The S3 client and response stream are closed after each request.
5. Pydantic validates the report and FastAPI serializes the timestamp and players.
   The generation time comes from the report, never the request time.

Missing reports return **404**. AWS/credential/configuration or local file I/O
failures return **503**. Invalid report JSON/schema returns **502**. All use the
existing sanitized `application/problem+json` error format. Logs record safe
failure categories without AWS messages, report contents, or credentials.
S3 failures never silently fall back to sample data.

Run the focused tests with `cd backend && pytest tests/test_insights.py`.
They exercise the fixture, lifespan/DI wiring, real boto3 requests stubbed with
botocore (no AWS traffic), validation, and sanitized failures.

## FPL Data And Caching

The backend calls the official public FPL API with a 15-second timeout. It uses in-process memory as L1 and Redis as L2 with the existing `fpl:api:v1:*` keys:

- Bootstrap data: 60 minutes
- Fixtures: 15 minutes
- Manager and squad: 5 minutes
- Player history: 30 minutes

Concurrent misses for one key are coalesced. Redis failures degrade to memory and upstream requests without taking the API offline.

## Recommendations

The Python backend preserves deterministic 1, 3, and 5 distinct-gameweek projections, including double gameweeks. It ranks captaincy, evaluates every legal FPL formation, and filters transfers by ownership, position, availability, expected minutes, actual selling value, bank, and the three-player club limit.

Current recommendation snapshots are stored in PostgreSQL for 15 minutes by default. Each calculation also appends an immutable history row. The Alembic baseline adopts the previous schema's exact table and column names, so existing Docker volumes remain compatible.

## AI Coach

The Coach is deterministic and requires no external model or credentials. Every request includes the connected public FPL Team ID. The backend validates and loads these unchanged runtime definitions:

- `.github/agents/fpl-coach.agent.md`
- `.github/agents/injury.agent.md`
- `.github/agents/fixture.agent.md`
- `.github/agents/transfer.agent.md`

Startup fails if a required definition, name, instruction body, or exact tool allowlist changes. Official FPL availability and fixture data plus the deterministic transfer engine remain authoritative for Coach answers.

## Production

Create an untracked production environment file:

```bash
cp .env.example .env.production
```

Set strong, different `POSTGRES_PASSWORD` and `REDIS_PASSWORD` values, then set `APP_ORIGIN` and optionally `APP_PORT`.

```bash
docker compose --env-file .env.production -f compose.production.yml up -d --build --wait
```

The production backend runs as a non-root user on a read-only filesystem. Nginx serves the React SPA and proxies `/api` and `/health` to Uvicorn. Security headers, exact-origin CORS, a 64 KiB request limit, per-client rate limiting, sanitized Problem Details, and production-disabled Swagger remain enabled.

Stop production while preserving data:

```bash
docker compose --env-file .env.production -f compose.production.yml down
```

## Continuous Integration

GitHub Actions runs:

- Frontend typecheck, lint, Vitest, and production build
- Backend Ruff, strict mypy, pytest with coverage, and Alembic head validation on Python 3.13
- Development and production Compose validation plus frontend/backend image builds