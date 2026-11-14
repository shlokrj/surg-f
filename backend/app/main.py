"""FastAPI app: CORS, JSON request logging, repository selection, and warm-up."""

import json
import logging
import sys
import threading
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .config import Settings, load_settings
from .quiz import QuizBank, QuizService
from .repository import ClipRepository, DatabricksClipRepository, FixtureClipRepository
from .routes import router
from .service import SearchService, TimelineService

access_log = logging.getLogger("surgf.access")

API_DESCRIPTION = """Study-tool API for laparoscopic cholecystectomy videos.

- **Search:** `GET /search?q=clipper` finds instrument clips.
- **Chart:** `GET /cases/VID01/timeline` returns segments and a per-instrument summary.
- **Quiz:** `GET /quiz?seed=1` returns 5 general questions about the operation.

Without Databricks credentials the API serves local fixtures; `GET /health` shows the mode.
Errors use `{"detail": "..."}`. Frontend guide: `backend/docs/FRONTEND_GUIDE.md`.
"""


def warm_up(repository: ClipRepository) -> None:
    """Start the SQL warehouse early. Logs one JSON line and never raises."""
    start = time.perf_counter()
    entry = {"event": "warmup", "mode": repository.mode}
    try:
        repository.warm_up()
        entry["status"] = "ok"
    except Exception as exc:  # warm-up is best effort
        entry.update(status="error", error=type(exc).__name__)
    entry["duration_ms"] = round((time.perf_counter() - start) * 1000, 2)
    access_log.info(json.dumps(entry))


def _configure_logging() -> None:
    if not access_log.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(logging.Formatter("%(message)s"))
        access_log.addHandler(handler)
        access_log.setLevel(logging.INFO)
        access_log.propagate = False


def build_repository(settings: Settings) -> ClipRepository:
    if settings.databricks is None:
        return FixtureClipRepository(settings.fixture_file, settings.fixtures_dir)
    return DatabricksClipRepository(settings.databricks)


def create_app(
    settings: Settings | None = None, repository: ClipRepository | None = None
) -> FastAPI:
    settings = settings or load_settings()
    repository = repository or build_repository(settings)
    _configure_logging()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # A daemon thread, so a cold warehouse (about 45 s) never delays startup.
        if settings.warmup and repository.mode == "databricks":
            threading.Thread(target=warm_up, args=(repository,), daemon=True).start()
        yield

    app = FastAPI(
        title="Surg+F API", version="0.2.0", description=API_DESCRIPTION, lifespan=lifespan
    )
    app.state.search_service = SearchService(repository)
    app.state.timeline_service = TimelineService(repository)
    app.state.quiz_service = QuizService(QuizBank.load(settings.quiz_bank_file))
    app.include_router(router)

    @app.middleware("http")
    async def log_request(request: Request, call_next):
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
        start = time.perf_counter()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
            response.headers["X-Request-ID"] = request_id
            return response
        finally:
            entry = {
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "query": request.url.query,
                "status": status,
                "duration_ms": round((time.perf_counter() - start) * 1000, 2),
                "mode": repository.mode,
            }
            error = getattr(request.state, "error", None)
            if error:
                entry["error"] = error
            access_log.info(json.dumps(entry))

    # Added last so it wraps the logger and also answers preflight requests.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["GET"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
    )
    return app


app = create_app()
