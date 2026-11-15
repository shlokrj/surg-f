"""Clip repositories: Databricks SQL for real data, local fixtures for offline development."""

import json
from pathlib import Path
from typing import Protocol

from .config import CLIPS_TABLE, DatabricksCredentials
from .models import Clip


class RepositoryError(Exception):
    """The clip store could not be queried."""


class ClipRepository(Protocol):
    mode: str

    def find_by_label(self, label: str) -> list[Clip]:
        """Return clips whose label equals `label` (already normalized to lowercase)."""
        ...

    def find_by_case(self, case_id: str) -> list[Clip]:
        """Return all non-fixture clips for `case_id`, ordered by start_sec, then label."""
        ...

    def warm_up(self) -> None:
        """Run a trivial query so the first real request is fast. May raise."""
        ...


class FixtureClipRepository:
    """Search serves shared/search.fixture.json; timelines serve backend/fixtures/."""

    mode = "fixture"

    def __init__(self, fixture_file: Path, fixtures_dir: Path | None = None):
        data = json.loads(fixture_file.read_text(encoding="utf-8"))
        self._clips = [Clip.model_validate(row) for row in data["results"]]
        self._cases: dict[str, list[Clip]] = {}
        for path in sorted(fixtures_dir.glob("timeline.*.json")) if fixtures_dir else []:
            timeline = json.loads(path.read_text(encoding="utf-8"))
            self._cases[timeline["case_id"]] = [
                Clip(case_id=timeline["case_id"], source=timeline["source"], **segment)
                for segment in timeline["segments"]
            ]

    def find_by_label(self, label: str) -> list[Clip]:
        return [clip for clip in self._clips if clip.label.lower() == label]

    def find_by_case(self, case_id: str) -> list[Clip]:
        return list(self._cases.get(case_id, []))

    def warm_up(self) -> None:
        return None


# The table name is a fixed constant, never user input; values are bound parameters.
# Fixture rows stay out of real queries.
SEARCH_SQL = f"""
SELECT case_id, start_sec, end_sec, label, source
FROM {CLIPS_TABLE}
WHERE lower(label) = :label
  AND source IN ('annotation', 'prediction')
ORDER BY case_id, start_sec
"""

CASE_SQL = f"""
SELECT case_id, start_sec, end_sec, label, source
FROM {CLIPS_TABLE}
WHERE case_id = :case_id
  AND source IN ('annotation', 'prediction')
ORDER BY start_sec, label
"""

WARMUP_SQL = "SELECT 1"


class DatabricksClipRepository:
    mode = "databricks"

    def __init__(self, credentials: DatabricksCredentials):
        self._credentials = credentials

    def _query(self, statement: str, params: dict[str, str]) -> list:
        from databricks import sql

        creds = self._credentials
        try:
            with (
                sql.connect(
                    server_hostname=creds.server_hostname,
                    http_path=creds.http_path,
                    access_token=creds.access_token,
                ) as connection,
                connection.cursor() as cursor,
            ):
                cursor.execute(statement, params)
                return cursor.fetchall()
        except Exception as exc:  # connector raises several unrelated types
            raise RepositoryError(type(exc).__name__) from exc

    @staticmethod
    def _clips(rows: list) -> list[Clip]:
        return [
            Clip(
                case_id=row.case_id,
                start_sec=row.start_sec,
                end_sec=row.end_sec,
                label=row.label,
                source=row.source,
            )
            for row in rows
        ]

    def find_by_label(self, label: str) -> list[Clip]:
        return self._clips(self._query(SEARCH_SQL, {"label": label}))

    def find_by_case(self, case_id: str) -> list[Clip]:
        return self._clips(self._query(CASE_SQL, {"case_id": case_id}))

    def warm_up(self) -> None:
        self._query(WARMUP_SQL, {})
