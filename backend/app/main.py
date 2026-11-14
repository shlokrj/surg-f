"""FastAPI app: CORS, JSON request logging, and repository selection."""

import json
import logging
import sys
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .config import Settings, load_settings
from .repository import ClipRepository, DatabricksClipRepository, FixtureClipRepository
from .routes import router
from .service import SearchService

access_log = logging.getLogger("surgf.access")


def _configure_logging() -> None:
    if not access_log.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(logging.Formatter("%(message)s"))
        access_log.addHandler(handler)
        access_log.setLevel(logging.INFO)
        access_log.propagate = False


def build_repository(settings: Settings) -> ClipRepository:
    if settings.databricks is None:
        return FixtureClipRepository(settings.fixture_file)
    return DatabricksClipRepository(settings.databricks)


def create_app(
    settings: Settings | None = None, repository: ClipRepository | None = None
) -> FastAPI:
    settings = settings or load_settings()
    repository = repository or build_repository(settings)
    _configure_logging()

    app = FastAPI(title="Surg+F search API", version="0.1.0")
    app.state.search_service = SearchService(repository)
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
