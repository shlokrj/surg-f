"""Operation steps (surgical phases) per video, from saved Cholec80 phase annotations.

The clip table in Databricks only records instruments, so steps are served from static
files in backend/fixtures/ in both modes. Regenerate them with scripts/export_steps.py.
"""

import json
from pathlib import Path

from .models import StepsResponse
from .service import CaseNotFoundError


class StepsService:
    def __init__(self, fixtures_dir: Path):
        self._cases: dict[str, StepsResponse] = {}
        for path in sorted(fixtures_dir.glob("steps.*.json")):
            steps = StepsResponse.model_validate(json.loads(path.read_text(encoding="utf-8")))
            self._cases[steps.case_id] = steps

    def steps(self, case_id: str) -> StepsResponse:
        try:
            return self._cases[case_id]
        except KeyError:
            raise CaseNotFoundError(case_id) from None
