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


# --- interpret (typed input -> actions) ---------------------------------------


class Action(BaseModel):
    type: Literal["timestamp", "chart", "quiz", "model"] = Field(
        description="timestamp: list moments for one instrument. chart: instrument usage for "
        "one video. quiz: start the general quiz. model: open the 3D model view."
    )
    case_id: str | None = Field(
        default=None, description="Video the action applies to (timestamp and chart only)."
    )
    label: str | None = Field(
        default=None, description="Instrument label for a timestamp action.", examples=["clipper"]
    )
    request: str | None = Field(
        default=None,
        description="Backend path that carries out the action, for example /search?q=clipper. "
        "null when no call is needed: the data is attached, or the action is model.",
    )
    results: list[Clip] | None = Field(
        default=None,
        description="Clips already found by Genie for a timestamp action. Show these instead "
        "of calling `request`.",
    )
    summary: list[LabelSummary] | None = Field(
        default=None, description="Per-instrument totals already computed by Genie for a chart."
    )


class GenieTrace(BaseModel):
    conversation_id: str | None = None
    sql: str | None = Field(default=None, description="The SQL Genie wrote and ran.")
    description: str | None = Field(default=None, description="Genie's summary of that SQL.")
    columns: list[str] = Field(default_factory=list)
    rows: list[list] = Field(default_factory=list, description="Raw result rows (max 500).")
    error: str | None = Field(default=None, description="Set when Genie failed or timed out.")


class InterpretResponse(BaseModel):
    query: str = Field(description="The text that was interpreted, with spaces collapsed.")
    interpreter: Literal["rules", "genie"] = Field(
        description="rules: decided instantly by keyword rules. genie: answered by Databricks "
        "Genie from the clip table."
    )
    actions: list[Action] = Field(
        description="What to do, in display order. Empty when the request was not understood."
    )
    message: str = Field(description="One short reply to show in the chat panel.")
    suggestions: list[str] = Field(
        default_factory=list, description="Example inputs to offer when the request was unclear."
    )
    genie: GenieTrace | None = Field(
        default=None, description="Details of the Genie call, when one was made."
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "query": "when was the clipper used?",
                "interpreter": "rules",
                "actions": [
                    {
                        "type": "timestamp",
                        "case_id": "VID01",
                        "label": "clipper",
                        "request": "/search?q=clipper",
                        "results": None,
                        "summary": None,
                    }
                ],
                "message": "Showing moments with the clipper in VID01.",
                "suggestions": [],
                "genie": None,
            }
        }
    )


# --- chat (one typed message -> one action with its data) ---------------------

ChatAction = Literal["search", "quiz", "timeline", "answer", "none"]
ChatRouter = Literal["llm", "rules", "genie"]


class ChatRequest(BaseModel):
    message: str = Field(
        min_length=1,
        max_length=300,
        description="What the user typed in the chat box.",
        examples=["show me when the clipper is used"],
    )
    case_id: str = Field(
        default="VID01",
        pattern=r"^[A-Za-z0-9_-]{1,32}$",
        description="Video currently open. Used unless the message names another video.",
        examples=["VID01"],
    )


class AnswerData(BaseModel):
    """A small result table for the `answer` action, computed here or by Genie."""

    columns: list[str] = Field(description="Column names of the result table.")
    rows: list[list] = Field(description="Result rows (max 500), in column order.")
    sql: str | None = Field(default=None, description="The SQL Genie wrote and ran.")


class ChatResponse(BaseModel):
    reply: str = Field(description="One or two short sentences to show in the chat.")
    action: ChatAction = Field(
        description="search: `data` is a GET /search payload, already limited to the open "
        "video. quiz: `data` is a GET /quiz payload. timeline: `data` is a "
        "GET /cases/{case_id}/timeline payload. answer: `data` is a small result table (or "
        "null), computed by the backend or by Genie. "
        "none: nothing to render besides `reply`; `data` is null."
    )
    data: SearchResponse | QuizResponse | TimelineResponse | AnswerData | None = Field(
        description="The payload for `action`, or null."
    )
    router: ChatRouter = Field(
        description="Which path decided: llm (Databricks chat model picked a tool), rules "
        "(keyword rules) or genie (Databricks Genie answered a data question)."
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "reply": "Found 5 moments with the clipper in VID01. The first starts at 11:14.",
                "action": "search",
                "data": {
                    "results": [
                        {
                            "case_id": "VID01",
                            "start_sec": 674.0,
                            "end_sec": 690.0,
                            "label": "clipper",
                            "source": "annotation",
                        }
                    ]
                },
                "router": "rules",
            }
        }
    )


# --- steps (operation phases for one video) -----------------------------------


class Step(BaseModel):
    order: int = Field(description="Position in the video, starting at 1.", examples=[3])
    key: str = Field(description="Phase name in the source dataset.", examples=["ClippingCutting"])
    label: str = Field(
        description="Plain-language name to display.", examples=["Clipping and cutting"]
    )
    start_sec: float = Field(description="Start, in seconds from the video start.", examples=[673])
    end_sec: float = Field(description="End, in seconds (exclusive).", examples=[887])


class StepsResponse(BaseModel):
    case_id: str = Field(description="The requested case.", examples=["VID01"])
    source: str = Field(
        description="Where the steps come from. cholec80_phase: the dataset's phase annotations."
    )
    steps: list[Step] = Field(description="Steps of the operation in time order, without gaps.")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "case_id": "VID01",
                "source": "cholec80_phase",
                "steps": [
                    {
                        "order": 3,
                        "key": "ClippingCutting",
                        "label": "Clipping and cutting",
                        "start_sec": 673.0,
                        "end_sec": 887.0,
                    }
                ],
            }
        }
    )
