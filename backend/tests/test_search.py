import json
import logging
from collections import namedtuple

import pytest
from fastapi.testclient import TestClient

from app.config import FIXTURE_FILE, settings_from
from app.main import build_repository, create_app
from app.repository import (
    SEARCH_SQL,
    DatabricksClipRepository,
    FixtureClipRepository,
    RepositoryError,
)
from app.service import normalize_label

FIXTURE = json.loads(FIXTURE_FILE.read_text(encoding="utf-8"))


@pytest.fixture
def client():
    settings = settings_from({})
    with TestClient(create_app(settings=settings)) as test_client:
        yield test_client


# --- fixture mode -----------------------------------------------------------


def test_missing_credentials_select_fixture_mode():
    settings = settings_from({"DATABRICKS_SERVER_HOSTNAME": "example.cloud.databricks.com"})
    assert settings.databricks is None
    assert isinstance(build_repository(settings), FixtureClipRepository)


def test_full_credentials_select_databricks_mode():
    settings = settings_from(
        {
            "DATABRICKS_HOST": "https://example.cloud.databricks.com/",
            "DATABRICKS_HTTP_PATH": "/sql/1.0/warehouses/abc",
            "DATABRICKS_TOKEN": "t",
        }
    )
    assert settings.databricks.server_hostname == "example.cloud.databricks.com"
    assert isinstance(build_repository(settings), DatabricksClipRepository)


def test_fixture_search_matches_shared_fixture(client):
    response = client.get("/search", params={"q": "clipper"})
    assert response.status_code == 200
    assert response.json() == FIXTURE


def test_label_is_case_and_whitespace_insensitive(client):
    response = client.get("/search", params={"q": "  CLIPPER "})
    assert response.json() == FIXTURE
    assert normalize_label(" Clip   APPLIER ") == "clip applier"  # multi-word labels still collapse


def test_no_match_returns_empty_results(client):
    response = client.get("/search", params={"q": "scissors"})
    assert response.status_code == 200
    assert response.json() == {"results": []}


def test_health_reports_fixture_mode(client):
    assert client.get("/health").json() == {"status": "ok", "mode": "fixture"}


# --- input validation -------------------------------------------------------


@pytest.mark.parametrize("params", [{}, {"q": ""}, {"q": "   "}, {"q": "x" * 101}])
def test_invalid_query_is_rejected(client, params):
    assert client.get("/search", params=params).status_code == 422


# --- cross-cutting ----------------------------------------------------------


def test_cors_allows_frontend_dev_server(client):
    origin = "http://localhost:5173"
    response = client.get("/search", params={"q": "clipper"}, headers={"Origin": origin})
    assert response.headers["access-control-allow-origin"] == origin


def test_one_json_log_line_per_request(client, caplog):
    logger = logging.getLogger("surgf.access")
    logger.addHandler(caplog.handler)
    try:
        response = client.get("/search", params={"q": "clipper"}, headers={"X-Request-ID": "abc"})
    finally:
        logger.removeHandler(caplog.handler)
    assert response.headers["X-Request-ID"] == "abc"
    lines = [json.loads(r.getMessage()) for r in caplog.records if r.name == "surgf.access"]
    assert len(lines) == 1
    assert lines[0]["request_id"] == "abc"
    assert lines[0]["status"] == 200
    assert lines[0]["duration_ms"] >= 0


def test_repository_failure_returns_503():
    class Broken:
        mode = "databricks"

        def find_by_label(self, label):
            raise RepositoryError("ServerOperationError")

    with TestClient(create_app(settings=settings_from({}), repository=Broken())) as c:
        response = c.get("/search", params={"q": "clipper"})
    assert response.status_code == 503


# --- Databricks repository (connector faked) --------------------------------


def test_databricks_query_binds_label_as_parameter(monkeypatch):
    Row = namedtuple("Row", "case_id start_sec end_sec label source")
    calls = []

    class FakeCursor:
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def execute(self, sql, params):
            calls.append((sql, params))

        def fetchall(self):
            return [Row("VID01", 674.0, 690.0, "clipper", "annotation")]

    class FakeConnection(FakeCursor):
        def cursor(self):
            return FakeCursor()

    import databricks.sql

    monkeypatch.setattr(databricks.sql, "connect", lambda **kwargs: FakeConnection())
    settings = settings_from(
        {
            "DATABRICKS_SERVER_HOSTNAME": "h",
            "DATABRICKS_HTTP_PATH": "p",
            "DATABRICKS_TOKEN": "t",
        }
    )
    clips = DatabricksClipRepository(settings.databricks).find_by_label("clipper'; DROP --")
    assert calls == [(SEARCH_SQL, {"label": "clipper'; DROP --"})]
    assert "'fixture'" not in SEARCH_SQL
    assert clips[0].case_id == "VID01" and clips[0].start_sec == 674.0
