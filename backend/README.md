# Backend

FastAPI service for the Surg+F study tool. **Frontend developers: start with [docs/FRONTEND_GUIDE.md](docs/FRONTEND_GUIDE.md).**

| Endpoint | Feature |
|---|---|
| `GET /search?q=<label>` | Search. Shared contract in [CONTRACTS.md](../agent-kit/CONTRACTS.md), shape of [shared/search.fixture.json](../shared/search.fixture.json) |
| `GET /cases/{case_id}/timeline` | Chart: instrument segments and per-label summary for one video |
| `GET /cases/{case_id}/steps` | Timeline: the steps (surgical phases) of one video, from saved Cholec80 phase annotations. Same with or without Databricks |
| `GET /quiz?seed=<int>` | Quiz: 5 general questions about the operation |
| `GET /interpret?q=<text>&case_id=<id>` | Turns typed text into actions (`timestamp`, `chart`, `quiz`, `model`). Rules first; Databricks Genie for free-form questions when `DATABRICKS_GENIE_SPACE_ID` is set. See [docs/GENIE_PLAN.md](docs/GENIE_PLAN.md) |
| `POST /chat` | Chat box: body `{message, case_id}`; returns `{reply, action, data, router}`. A Databricks chat model picks the feature when `DATABRICKS_CHAT_ENDPOINT` is set; keyword rules answer otherwise or on any failure. See [docs/FRONTEND_GUIDE.md](docs/FRONTEND_GUIDE.md), section 7 |
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

- **Chat:** works in both modes. Set `DATABRICKS_CHAT_ENDPOINT` in the repo-root `.env` to the name of a Databricks serving endpoint that supports tool calling (verified 2026-11-14: `databricks-meta-llama-3-3-70b-instruct`) to route with a model. `SURGF_CHAT_TIMEOUT_SEC` (default 8) is the hard limit before the keyword rules take over. `/chat` never returns a 500 for a routing failure.

**Errors:** every error is `{"detail": "..."}`. They are 404 for an unknown case, 422 for invalid input (FastAPI validation errors return a list), and 503 for a Databricks failure.

**CORS** allows `http://localhost:5173` and `http://127.0.0.1:5173`. Override it with a comma-separated `SURGF_CORS_ORIGINS`.

**Logging:** each request writes one JSON log line to stdout with `request_id` (taken from `X-Request-ID` or generated, and echoed back), `status`, `duration_ms`, and `mode`. `/chat` lines also carry `router` and `action`, plus `error` (for example `llm: timeout`) when a router fell back. The token is never logged.

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
- `app/interpret.py`: typed text to actions (rules, then Genie).
- `app/genie.py`: Databricks Genie Conversation API client.
- `app/repository.py`: Databricks and fixture repositories.
- `app/models.py`: response shapes.
- `data/quiz_bank.json`: quiz content.
- `fixtures/`: saved responses.
- `docs/`: the frontend guide and the contract proposal.

## Stage 3: video localization

Spatial overlays are live (experimental) as a static frontend artifact, `frontend/public/overlays/VID01.json`; no backend route serves them and search is unchanged. A versioned backend response would only be needed if overlays move to Databricks storage; agree a schema first (see the plan).

See [Stage 3 localization plan](../ml/LOCALIZATION_PLAN.md) for the complete context and primary sources.
