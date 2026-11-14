"""Regenerate backend/fixtures/ from live Databricks data and the quiz bank.

Run from backend/ with the repo-root .env present:
    python -m uv run python scripts/export_fixtures.py
"""

import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.config import FIXTURES_DIR, QUIZ_BANK_FILE, load_settings  # noqa: E402
from app.quiz import QuizBank, QuizService  # noqa: E402
from app.repository import DatabricksClipRepository  # noqa: E402
from app.service import TimelineService  # noqa: E402

CASES = ("VID01", "VID02")
QUIZ_SEED = 1


def write(name: str, payload: dict) -> None:
    path = FIXTURES_DIR / name
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"wrote {path.relative_to(BACKEND)}")


def main() -> None:
    FIXTURES_DIR.mkdir(exist_ok=True)
    quiz = QuizService(QuizBank.load(QUIZ_BANK_FILE)).quiz(QUIZ_SEED)
    write(f"quiz.seed-{QUIZ_SEED}.json", quiz.model_dump(mode="json"))

    settings = load_settings()
    if settings.databricks is None:
        sys.exit("Databricks credentials missing; timeline fixtures not regenerated.")
    service = TimelineService(DatabricksClipRepository(settings.databricks))
    for case_id in CASES:
        write(f"timeline.{case_id}.json", service.timeline(case_id).model_dump(mode="json"))


if __name__ == "__main__":
    main()
