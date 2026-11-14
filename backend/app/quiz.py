"""General-knowledge quiz about laparoscopic cholecystectomy, built from a static bank.

The quiz never touches Databricks or a specific case, so it is identical in fixture and
real modes. Content lives in backend/data/quiz_bank.json, not in code.
"""

import json
import random
import secrets
from pathlib import Path

from .models import QuizOption, QuizQuestion, QuizResponse

NEXT_STEP_COUNT = 3
WHICH_TOOL_COUNT = 2
OPTION_IDS = ("a", "b", "c", "d")
MAX_SEED = 2**31 - 1


class QuizBank:
    def __init__(self, data: dict):
        self.reviewed: bool = bool(data["reviewed"])
        self.steps: dict[str, str] = data["steps"]
        self.tools: dict[str, str] = {k: v["text"] for k, v in data["tools"].items()}
        self._in_operation = {k: bool(v["in_operation"]) for k, v in data["tools"].items()}
        self.next_step: list[dict] = data["next_step"]
        self.which_tool: list[dict] = data["which_tool"]
        self._validate()

    @classmethod
    def load(cls, path: Path) -> "QuizBank":
        return cls(json.loads(path.read_text(encoding="utf-8")))

    def _validate(self) -> None:
        ids = [q["id"] for q in self.next_step + self.which_tool]
        if len(ids) != len(set(ids)):
            raise ValueError("quiz bank question IDs must be unique")
        for items, names, needed in (
            (self.next_step, self.steps, NEXT_STEP_COUNT),
            (self.which_tool, self.tools, WHICH_TOOL_COUNT),
        ):
            for q in items:
                choices = [q["answer"], *q["distractors"]]
                if len(choices) != len(OPTION_IDS) or len(set(choices)) != len(choices):
                    raise ValueError(f"{q['id']}: needs 1 answer and 3 distinct distractors")
                missing = [c for c in choices if c not in names]
                if missing:
                    raise ValueError(f"{q['id']}: unknown option IDs {missing}")
            if len({q["group"] for q in items}) < needed:
                raise ValueError(f"quiz bank needs at least {needed} distinct groups per type")
        for q in self.which_tool:
            if not self._in_operation[q["answer"]]:
                raise ValueError(f"{q['id']}: answer must be an instrument used in the operation")


def _pick(rng: random.Random, items: list[dict], count: int) -> list[dict]:
    """Pick `count` items with distinct groups, so no two questions share an answer topic."""
    chosen, groups = [], set()
    for item in rng.sample(items, len(items)):
        if item["group"] not in groups:
            chosen.append(item)
            groups.add(item["group"])
            if len(chosen) == count:
                break
    return chosen


class QuizService:
    def __init__(self, bank: QuizBank):
        self.bank = bank

    def _question(self, rng: random.Random, item: dict, kind: str) -> QuizQuestion:
        names = self.bank.steps if kind == "next_step" else self.bank.tools
        keys = [item["answer"], *item["distractors"]]
        rng.shuffle(keys)
        options = [
            QuizOption(id=oid, text=names[key]) for oid, key in zip(OPTION_IDS, keys, strict=True)
        ]
        return QuizQuestion(
            id=item["id"],
            type=kind,
            prompt=item["prompt"],
            options=options,
            correct_option_id=OPTION_IDS[keys.index(item["answer"])],
            explanation=item["explanation"],
            search_q=item["search_q"],
        )

    def quiz(self, seed: int | None = None) -> QuizResponse:
        if seed is None:
            seed = secrets.randbelow(MAX_SEED + 1)
        rng = random.Random(seed)
        questions = [
            self._question(rng, item, "next_step")
            for item in _pick(rng, self.bank.next_step, NEXT_STEP_COUNT)
        ] + [
            self._question(rng, item, "which_tool")
            for item in _pick(rng, self.bank.which_tool, WHICH_TOOL_COUNT)
        ]
        return QuizResponse(seed=seed, reviewed=self.bank.reviewed, questions=questions)
