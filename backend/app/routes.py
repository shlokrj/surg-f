from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request

from .models import SearchResponse
from .repository import RepositoryError

router = APIRouter()


@router.get("/search", response_model=SearchResponse)
def search(
    request: Request,
    q: Annotated[str, Query(min_length=1, max_length=100, description="Clip label")],
) -> SearchResponse:
    try:
        return request.app.state.search_service.search(q)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RepositoryError as exc:
        request.state.error = str(exc)
        raise HTTPException(status_code=503, detail="Clip search is unavailable") from exc


@router.get("/health")
def health(request: Request) -> dict[str, str]:
    return {"status": "ok", "mode": request.app.state.search_service.repository.mode}
