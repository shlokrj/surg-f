"""Search use case: normalize the query and ask the repository for matching clips."""

from .models import SearchResponse
from .repository import ClipRepository


def normalize_label(query: str) -> str:
    """Lowercase and collapse whitespace, so ' Clip  Applier ' matches 'clip applier'."""
    return " ".join(query.split()).lower()


class SearchService:
    def __init__(self, repository: ClipRepository):
        self.repository = repository

    def search(self, query: str) -> SearchResponse:
        label = normalize_label(query)
        if not label:
            raise ValueError("q must contain a label")
        return SearchResponse(results=self.repository.find_by_label(label))
