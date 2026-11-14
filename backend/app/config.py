"""Settings loaded from the repo-root .env, with process environment taking precedence."""

import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

from dotenv import dotenv_values

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
ENV_FILE = REPO_ROOT / ".env"
FIXTURE_FILE = REPO_ROOT / "shared" / "search.fixture.json"
FIXTURES_DIR = BACKEND_ROOT / "fixtures"
QUIZ_BANK_FILE = BACKEND_ROOT / "data" / "quiz_bank.json"
CLIPS_TABLE = "workspace.default.surgf_clips"
DEFAULT_CORS_ORIGINS = ("http://localhost:5173", "http://127.0.0.1:5173")


@dataclass(frozen=True)
class DatabricksCredentials:
    server_hostname: str
    http_path: str
    access_token: str


@dataclass(frozen=True)
class Settings:
    databricks: DatabricksCredentials | None
    cors_origins: tuple[str, ...]
    fixture_file: Path = FIXTURE_FILE
    fixtures_dir: Path = FIXTURES_DIR
    quiz_bank_file: Path = QUIZ_BANK_FILE
    warmup: bool = True


def _hostname(values: Mapping[str, str | None]) -> str:
    hostname = values.get("DATABRICKS_SERVER_HOSTNAME") or ""
    if not hostname:
        host = values.get("DATABRICKS_HOST") or ""
        hostname = host.removeprefix("https://").removeprefix("http://")
    return hostname.strip().rstrip("/")


def settings_from(values: Mapping[str, str | None]) -> Settings:
    """Build settings from a mapping; Databricks is None when any credential is missing."""
    hostname = _hostname(values)
    http_path = (values.get("DATABRICKS_HTTP_PATH") or "").strip()
    token = (values.get("DATABRICKS_TOKEN") or "").strip()
    databricks = (
        DatabricksCredentials(hostname, http_path, token)
        if hostname and http_path and token
        else None
    )
    origins_raw = values.get("SURGF_CORS_ORIGINS") or ""
    origins = tuple(o.strip() for o in origins_raw.split(",") if o.strip())
    warmup = (values.get("SURGF_WARMUP") or "1").strip().lower() not in ("0", "false", "no")
    return Settings(
        databricks=databricks, cors_origins=origins or DEFAULT_CORS_ORIGINS, warmup=warmup
    )


def load_settings(env_file: Path = ENV_FILE) -> Settings:
    values: dict[str, str | None] = dict(dotenv_values(env_file)) if env_file.exists() else {}
    values.update(os.environ)
    return settings_from(values)
