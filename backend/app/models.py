"""Search hit shape from agent-kit/CONTRACTS.md and shared/search.fixture.json."""

from typing import Literal

from pydantic import BaseModel

Source = Literal["annotation", "prediction", "fixture"]


class Clip(BaseModel):
    case_id: str
    start_sec: float
    end_sec: float
    label: str
    source: Source


class SearchResponse(BaseModel):
    results: list[Clip]
