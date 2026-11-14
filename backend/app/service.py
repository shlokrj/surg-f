"""Use cases: search clips by label and build a per-case timeline."""

from .models import LabelSummary, SearchResponse, Segment, TimelineResponse, TimelineSource
from .repository import ClipRepository


class CaseNotFoundError(LookupError):
    """No annotation or prediction rows exist for the case."""


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


def summarize(segments: list[Segment]) -> list[LabelSummary]:
    """Per-label count, total duration and first start, largest total first."""
    by_label: dict[str, LabelSummary] = {}
    for seg in segments:
        item = by_label.get(seg.label)
        duration = seg.end_sec - seg.start_sec
        if item is None:
            by_label[seg.label] = LabelSummary(
                label=seg.label, count=1, total_sec=duration, first_sec=seg.start_sec
            )
        else:
            item.count += 1
            item.total_sec += duration
            item.first_sec = min(item.first_sec, seg.start_sec)
    return sorted(by_label.values(), key=lambda s: (-s.total_sec, s.label))


class TimelineService:
    def __init__(self, repository: ClipRepository):
        self.repository = repository

    def timeline(self, case_id: str, source: TimelineSource = "annotation") -> TimelineResponse:
        clips = self.repository.find_by_case(case_id)
        if not clips:
            raise CaseNotFoundError(case_id)
        segments = [
            Segment(label=c.label, start_sec=c.start_sec, end_sec=c.end_sec)
            for c in sorted(clips, key=lambda c: (c.start_sec, c.label))
            if c.source == source
        ]
        return TimelineResponse(
            case_id=case_id, source=source, segments=segments, summary=summarize(segments)
        )
