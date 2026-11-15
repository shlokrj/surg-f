from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, Query, Request

from .models import (
    ErrorResponse,
    InterpretResponse,
    QuizResponse,
    SearchResponse,
    StepsResponse,
    TimelineResponse,
    TimelineSource,
)
from .quiz import MAX_SEED
from .repository import RepositoryError
from .service import CaseNotFoundError

router = APIRouter()

UNAVAILABLE = {503: {"model": ErrorResponse, "description": "Databricks query failed."}}
INVALID = {422: {"description": "Invalid parameter. FastAPI returns `detail` as a list."}}


def _unavailable(request: Request, exc: RepositoryError) -> HTTPException:
    request.state.error = str(exc)
    return HTTPException(status_code=503, detail="Clip search is unavailable")


@router.get(
    "/search",
    response_model=SearchResponse,
    summary="Find clips by instrument label",
    description="Exact label match after lowercasing and collapsing spaces, for example "
    "`clipper`, `grasper`, `hook`, `irrigator`, `bipolar`, `scissors`. Returns "
    '`{"results": []}` when nothing matches. Excludes fixture rows in Databricks mode.',
    responses={**INVALID, **UNAVAILABLE},
    tags=["search"],
)
def search(
    request: Request,
    q: Annotated[
        str, Query(min_length=1, max_length=100, description="Clip label", examples=["clipper"])
    ],
) -> SearchResponse:
    try:
        return request.app.state.search_service.search(q)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RepositoryError as exc:
        raise _unavailable(request, exc) from exc


@router.get(
    "/cases/{case_id}/timeline",
    response_model=TimelineResponse,
    summary="Instrument timeline and usage summary for one video",
    description="`segments` feeds a timeline chart; `summary` feeds an instrument-usage chart. "
    "Uses `annotation` rows by default; pass `source=prediction` for model output. A known "
    "case with no rows for that source returns empty lists.",
    responses={
        404: {"model": ErrorResponse, "description": "No rows exist for this case_id."},
        **INVALID,
        **UNAVAILABLE,
    },
    tags=["chart"],
)
def timeline(
    request: Request,
    case_id: Annotated[
        str,
        Path(
            pattern=r"^[A-Za-z0-9_-]{1,32}$",
            description="Video ID (case sensitive)",
            examples=["VID01"],
        ),
    ],
    source: Annotated[
        TimelineSource, Query(description="Which rows to chart", examples=["annotation"])
    ] = "annotation",
) -> TimelineResponse:
    try:
        return request.app.state.timeline_service.timeline(case_id, source)
    except CaseNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"Unknown case_id: {case_id}") from exc
    except RepositoryError as exc:
        raise _unavailable(request, exc) from exc


@router.get(
    "/cases/{case_id}/steps",
    response_model=StepsResponse,
    summary="Steps of the operation in one video",
    description="The surgical phases of the video in time order, for the default timeline. "
    "They come from the Cholec80 phase annotations saved in `backend/fixtures/`, so the "
    "response is the same with or without Databricks. Available for VID01 and VID02.",
    responses={
        404: {"model": ErrorResponse, "description": "No steps are saved for this case_id."},
        **INVALID,
    },
    tags=["chart"],
)
def steps(
    request: Request,
    case_id: Annotated[
        str,
        Path(
            pattern=r"^[A-Za-z0-9_-]{1,32}$",
            description="Video ID (case sensitive)",
            examples=["VID01"],
        ),
    ],
) -> StepsResponse:
    try:
        return request.app.state.steps_service.steps(case_id)
    except CaseNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"No steps for case_id: {case_id}") from exc


@router.get(
    "/quiz",
    response_model=QuizResponse,
    summary="Five-question quiz about the operation in general",
    description="Always 5 questions: 3 `next_step`, then 2 `which_tool`. Not tied to any "
    "video, and identical in fixture and Databricks modes. The same `seed` returns the same "
    "quiz. The answer is included on purpose; grade on the client. Content is not yet "
    "medically reviewed while `reviewed` is false.",
    responses=INVALID,
    tags=["quiz"],
)
def quiz(
    request: Request,
    seed: Annotated[
        int | None,
        Query(ge=0, le=MAX_SEED, description="Omit for a random quiz", examples=[1]),
    ] = None,
) -> QuizResponse:
    return request.app.state.quiz_service.quiz(seed)


@router.get(
    "/interpret",
    response_model=InterpretResponse,
    summary="Turn typed input into actions",
    description="Send whatever the user typed in the search bar. Returns `actions`, each "
    "with a `type` (`timestamp`, `chart`, `quiz` or `model`) and the backend `request` that "
    "carries it out. Slash commands and simple questions are decided instantly by rules. "
    "Free-form data questions go to Databricks Genie when a Genie space is configured, "
    "which can take 5 to 30 seconds. If Genie is not configured or fails, the rules' best "
    "guess is returned, so this endpoint does not fail because of Genie.",
    responses=INVALID,
    tags=["interpret"],
)
def interpret(
    request: Request,
    q: Annotated[
        str,
        Query(
            min_length=1,
            max_length=300,
            description="What the user typed",
            examples=["when was the clipper used?"],
        ),
    ],
    case_id: Annotated[
        str | None,
        Query(
            pattern=r"^[A-Za-z0-9_-]{1,32}$",
            description="Video currently open, used when the text names no video",
            examples=["VID01"],
        ),
    ] = None,
) -> InterpretResponse:
    try:
        response = request.app.state.interpret_service.interpret(q, case_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if response.genie and response.genie.error:
        request.state.error = f"genie: {response.genie.error}"
    return response


@router.get(
    "/health",
    summary="Liveness and data mode",
    description="`mode` is `databricks` when credentials are set, otherwise `fixture`.",
    tags=["meta"],
)
def health(request: Request) -> dict[str, str]:
    return {"status": "ok", "mode": request.app.state.search_service.repository.mode}
