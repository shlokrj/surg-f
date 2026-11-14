"""Response shapes. Search matches agent-kit/CONTRACTS.md and shared/search.fixture.json."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Source = Literal["annotation", "prediction", "fixture"]
TimelineSource = Literal["annotation", "prediction"]


class ErrorResponse(BaseModel):
    detail: str = Field(description="Human-readable reason for the error.")

    model_config = ConfigDict(json_schema_extra={"example": {"detail": "Unknown case_id: VID99"}})


# --- search (shared contract; do not change) ---------------------------------


class Clip(BaseModel):
    case_id: str = Field(description="Video ID, for example VID01.", examples=["VID01"])
    start_sec: float = Field(description="Start, in seconds from the video start.", examples=[674])
    end_sec: float = Field(description="End, in seconds (exclusive).", examples=[690])
    label: str = Field(description="Instrument label from the dataset.", examples=["clipper"])
    source: Source = Field(
        description="annotation (dataset), prediction (model), or fixture (test only)."
    )


class SearchResponse(BaseModel):
    results: list[Clip] = Field(description="Matches ordered by case_id, then start_sec.")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "results": [
                    {
                        "case_id": "VID01",
                        "start_sec": 674.0,
                        "end_sec": 690.0,
                        "label": "clipper",
                        "source": "annotation",
                    }
                ]
            }
        }
    )


# --- timeline (chart) --------------------------------------------------------


class Segment(BaseModel):
    label: str = Field(description="Instrument label.", examples=["clipper"])
    start_sec: float = Field(description="Start, in seconds.", examples=[674])
    end_sec: float = Field(description="End, in seconds (exclusive).", examples=[690])


class LabelSummary(BaseModel):
    label: str = Field(description="Instrument label.", examples=["clipper"])
    count: int = Field(description="Number of segments with this label.", examples=[5])
    total_sec: float = Field(description="Sum of end_sec - start_sec.", examples=[102])
    first_sec: float = Field(description="Earliest start_sec for this label.", examples=[674])


class TimelineResponse(BaseModel):
    case_id: str = Field(description="The requested case.", examples=["VID01"])
    source: TimelineSource = Field(description="Which rows were used.")
    segments: list[Segment] = Field(
        description="Ordered by start_sec, then label. Different labels can overlap in time."
    )
    summary: list[LabelSummary] = Field(
        description="One entry per label, ordered by total_sec descending, then label."
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "case_id": "VID01",
                "source": "annotation",
                "segments": [{"label": "clipper", "start_sec": 674.0, "end_sec": 690.0}],
                "summary": [
                    {"label": "clipper", "count": 5, "total_sec": 102.0, "first_sec": 674.0}
                ],
            }
        }
    )


# --- quiz --------------------------------------------------------------------


class QuizOption(BaseModel):
    id: str = Field(description="Option ID within the question: a, b, c or d.", examples=["a"])
    text: str = Field(description="Answer text to display.")


class QuizQuestion(BaseModel):
    id: str = Field(description="Stable question ID from the bank.", examples=["after-clip"])
    type: Literal["next_step", "which_tool"] = Field(
        description="next_step: what comes after a step. which_tool: pick the instrument."
    )
    prompt: str = Field(description="Question text to display.")
    options: list[QuizOption] = Field(description="Exactly 4 options, already shuffled.")
    correct_option_id: str = Field(description="ID of the correct option. Grade locally.")
    explanation: str = Field(description="Shown after the user answers.")
    search_q: str | None = Field(
        description="Instrument label to pass to GET /search for a 'watch examples' button, "
        "or null when there is no good term.",
        examples=["clipper"],
    )


class QuizResponse(BaseModel):
    seed: int = Field(description="Seed used. Pass it back as ?seed= to get the same quiz.")
    reviewed: bool = Field(
        description="false until a person with medical knowledge has verified the bank. "
        "Show a 'not yet medically reviewed' notice while false."
    )
    questions: list[QuizQuestion] = Field(
        description="Always 5: 3 next_step questions, then 2 which_tool questions."
    )
