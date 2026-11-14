# Backend

FastAPI service for the Surg+F study tool. **Frontend developers: start with [docs/FRONTEND_GUIDE.md](docs/FRONTEND_GUIDE.md).**

| Endpoint | Feature |
|---|---|
| `GET /search?q=<label>` | Search. Shared contract in [CONTRACTS.md](../agent-kit/CONTRACTS.md), shape of [shared/search.fixture.json](../shared/search.fixture.json) |
| `GET /cases/{case_id}/timeline` | Chart: instrument segments and per-label summary for one video |
| `GET /quiz?seed=<int>` | Quiz: 5 general questions about the operation |
| `GET /health` | Shows `mode`: `databricks` or `fixture` |

The timeline and quiz endpoints are proposals until the team agrees: see [docs/CONTRACT_PROPOSAL.md](docs/CONTRACT_PROPOSAL.md).

## Run (Windows PowerShell)

```powershell
cd backend
python -m uv sync
python -m uv run uvicorn app.main:app --reload --port 8000
```

Interactive docs: http://localhost:8000/docs.

## Modes

- **Databricks:** used when the repo-root `.env` (or the process environment) sets `DATABRICKS_SERVER_HOSTNAME` (or `DATABRICKS_HOST`), `DATABRICKS_HTTP_PATH`, and `DATABRICKS_TOKEN`. Queries `workspace.default.surgf_clips` with bound parameters only and excludes `fixture` rows. At startup, a background `SELECT 1` wakes the SQL warehouse; it logs one `{"event": "warmup"}` line and never stops the server. Set `SURGF_WARMUP=0` to skip it.
- **Fixture:** used when any credential is missing. Search serves `shared/search.fixture.json` (only `clipper` matches). Timelines serve `fixtures/timeline.VID01.json` and `fixtures/timeline.VID02.json`, which are real data saved from Databricks.
- **Quiz:** identical in both modes. It reads [data/quiz_bank.json](data/quiz_bank.json), which is **not yet medically reviewed** (`"reviewed": false`).

**Errors:** every error is `{"detail": "..."}`. They are 404 for an unknown case, 422 for invalid input (FastAPI validation errors return a list), and 503 for a Databricks failure.

**CORS** allows `http://localhost:5173` and `http://127.0.0.1:5173`. Override it with a comma-separated `SURGF_CORS_ORIGINS`.

**Logging:** each request writes one JSON log line to stdout with `request_id` (taken from `X-Request-ID` or generated, and echoed back), `status`, `duration_ms`, and `mode`.

## Check

```powershell
python -m uv run ruff check .
python -m uv run pytest -q
```

Regenerate the fixtures after the data or the quiz bank changes. This needs `.env`:

```powershell
python -m uv run python scripts/export_fixtures.py
```

## Layout

- `app/routes.py`: thin routes and OpenAPI docs.
- `app/service.py`: search and timeline.
- `app/quiz.py`: quiz builder.
- `app/repository.py`: Databricks and fixture repositories.
- `app/models.py`: response shapes.
- `data/quiz_bank.json`: quiz content.
- `fixtures/`: saved responses.
- `docs/`: the frontend guide and the contract proposal.

## Planned stage 3: video localization

Stage 3 will need a separate versioned spatial-overlay response keyed by video asset and time/frame, after ML/data agree a schema. Search intervals alone cannot provide boxes. No localization endpoint is added by this plan, and existing search/timeline/quiz behavior is unchanged.

See [Stage 3 localization plan](../ml/LOCALIZATION_PLAN.md) for the complete context and primary sources.
