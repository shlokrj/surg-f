"""Clip repositories: Databricks SQL for real data, the shared fixture for offline development."""

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


class FixtureClipRepository:
    mode = "fixture"

    def __init__(self, fixture_file: Path):
        data = json.loads(fixture_file.read_text(encoding="utf-8"))
        self._clips = [Clip.model_validate(row) for row in data["results"]]

    def find_by_label(self, label: str) -> list[Clip]:
        return [clip for clip in self._clips if clip.label.lower() == label]


# The table name is a fixed constant, never user input; the label is a bound parameter.
# Fixture rows stay out of real searches (CONTRACTS.md).
SEARCH_SQL = f"""
SELECT case_id, start_sec, end_sec, label, source
FROM {CLIPS_TABLE}
WHERE lower(label) = :label
  AND source IN ('annotation', 'prediction')
ORDER BY case_id, start_sec
"""


class DatabricksClipRepository:
    mode = "databricks"

    def __init__(self, credentials: DatabricksCredentials):
        self._credentials = credentials

    def find_by_label(self, label: str) -> list[Clip]:
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
                cursor.execute(SEARCH_SQL, {"label": label})
                rows = cursor.fetchall()
        except Exception as exc:  # connector raises several unrelated types
            raise RepositoryError(type(exc).__name__) from exc
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
