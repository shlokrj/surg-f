# Backend

FastAPI service for `GET /search?q=<label>`, returning `{"results": [...]}` in the shape of [shared/search.fixture.json](../shared/search.fixture.json) and [CONTRACTS.md](../agent-kit/CONTRACTS.md).

## Run (Windows PowerShell)

```powershell
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000
Invoke-RestMethod "http://localhost:8000/search?q=clipper" | ConvertTo-Json -Depth 4
```

`GET /health` reports `mode`: `databricks` or `fixture`.

## Modes

- **Databricks:** used when the repo-root `.env` (or the process environment) sets `DATABRICKS_SERVER_HOSTNAME` (or `DATABRICKS_HOST`), `DATABRICKS_HTTP_PATH`, and `DATABRICKS_TOKEN`. Queries `workspace.default.surgf_clips` with a bound `:label` parameter, excludes `fixture` rows, and orders by `case_id, start_sec`.
- **Fixture:** used when any credential is missing. Serves `shared/search.fixture.json`, whose single row is labeled `clipper` like the real data, so `clipper` works in both modes.

Matching is an exact label match after lowercasing and collapsing whitespace. Use dataset labels such as `clipper`, `grasper`, or `hook`. A blank `q`, or one longer than 100 characters, returns 422. A Databricks failure returns 503.

CORS allows `http://localhost:5173` and `http://127.0.0.1:5173` by default. Override it with a comma-separated `SURGF_CORS_ORIGINS`. Each request writes one JSON log line to stdout with `request_id` (taken from `X-Request-ID` or generated, and echoed back in the response), `status`, `duration_ms`, and `mode`.

## Check

```powershell
uv run ruff check .
uv run pytest -q
```

Layout: `app/routes.py` (thin route) → `app/service.py` (normalization) → `app/repository.py` (Databricks and fixture repositories).
