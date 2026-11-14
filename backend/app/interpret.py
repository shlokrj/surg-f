"""Turn what the user typed into concrete actions the frontend can carry out.

Two layers:
1. Rules (instant, offline): slash commands, keywords, instrument and case names.
2. Genie (optional, slow): free-form data questions the rules cannot express. Genie's
   result rows are converted back into the same action shapes.

A Genie failure never fails the request; the rules' best guess is returned instead.
"""

import re
from dataclasses import dataclass
from urllib.parse import quote

from .genie import GenieAnswer, GenieClient, GenieError
from .models import Action, Clip, GenieTrace, InterpretResponse, LabelSummary

ACTION_TYPES = ("timestamp", "chart", "quiz", "model")
LABELS = ("grasper", "hook", "irrigator", "bipolar", "clipper", "scissors")

# Phrases that name each dataset instrument. Bare "clip" is left out on purpose: it also
# means a video clip ("show me clips of the hook").
SYNONYMS: dict[str, tuple[str, ...]] = {
    "clipper": ("clippers", "clipper", "clip appliers", "clip applier", "clip applicator"),
    "hook": ("hooks", "hook", "l-hook", "l hook"),
    "grasper": ("graspers", "grasper", "grasping forceps"),
    "irrigator": ("irrigators", "irrigator", "irrigation", "suction"),
    "bipolar": ("bipolar forceps", "bipolar"),
    "scissors": ("scissors", "scissor", "shears"),
}
LABEL_PATTERNS = {
    label: re.compile(r"\b(?:" + "|".join(re.escape(p) for p in phrases) + r")\b")
    for label, phrases in SYNONYMS.items()
}

COMMAND = re.compile(r"(?<!\S)/(timestamp|quiz|chart|model)\b")
CASE = re.compile(r"\b(?:vid|video|case)\s*0*(\d{1,2})\b")
QUIZ = re.compile(r"\b(quiz|test me|practice questions?|study questions?|question me)\b")
CHART = re.compile(
    r"\b(chart|graph|plot|distribution|breakdown|how many|how often|count|frequency|"
    r"summary|summari[sz]e|usage)\b"
)
MODEL = re.compile(r"\b(3d|3-d|anatomy|anatomical)\b")
TIMESTAMP = re.compile(
    r"\b(when|timestamps?|show me|find|where|used|occur\w*|happen\w*|appear\w*|jump to|moments?)\b"
)
# Wording the fixed endpoints cannot express; these questions go to Genie when it is set up.
COMPLEX = re.compile(
    r"\b(after|before|between|first|last|longest|shortest|most|least|more than|less than|"
    r"longer|shorter|minutes?|seconds?|compare|versus|vs|together|same time|while|during|"
    r"average|total|how long|predict\w*)\b"
)

SUGGESTIONS = ["/timestamp clipper", "/chart", "/quiz", "when was the hook used?"]
CLIP_COLUMNS = {"case_id", "start_sec", "end_sec", "label"}
SUMMARY_COLUMNS = {"count", "total_sec", "first_sec"}


@dataclass
class Parsed:
    intents: list[str]  # action types, in display order
    labels: list[str]  # dataset instrument labels mentioned
    case_id: str | None
    confident: bool  # False when Genie should take a look
    free_text: bool  # the user wrote more than slash commands


def parse(query: str, case_id: str | None) -> Parsed:
    """Rules layer: pure, deterministic, no network."""
    lower = " ".join(query.lower().split())
    labels = [label for label in LABELS if LABEL_PATTERNS[label].search(lower)]
    case_match = CASE.search(lower)
    if case_match:
        case_id = f"VID{int(case_match.group(1)):02d}"
    commands = list(dict.fromkeys(COMMAND.findall(lower)))
    rest = COMMAND.sub(" ", lower).strip()
    complex_wording = bool(COMPLEX.search(rest))

    if commands:
        needs_label = "timestamp" in commands and not labels
        return Parsed(
            intents=commands,
            labels=labels,
            case_id=case_id,
            # "/timestamp" alone is a complete command; "/timestamp <question>" may not be.
            confident=not (rest and (needs_label or complex_wording)),
            free_text=bool(rest),
        )

    intents = []
    if QUIZ.search(lower):
        intents.append("quiz")
    if CHART.search(lower):
        intents.append("chart")
    if MODEL.search(lower) or ("model" in lower and "predict" not in lower):
        intents.append("model")
    guessed = not intents and not TIMESTAMP.search(lower) and not labels
    if TIMESTAMP.search(lower) or (labels and not intents) or guessed:
        intents.insert(0, "timestamp")
    data_question = "timestamp" in intents or "chart" in intents
    confident = (
        not guessed
        and not (data_question and complex_wording)
        and not ("timestamp" in intents and not labels)
    )
    return Parsed(intents, labels, case_id, confident, free_text=True)


def _action(kind: str, case_id: str | None, label: str | None = None) -> Action:
    request = {
        "timestamp": f"/search?q={quote(label)}" if label else None,
        "chart": f"/cases/{quote(case_id)}/timeline" if case_id else None,
        "quiz": "/quiz",
        "model": None,
    }[kind]
    return Action(
        type=kind,
        case_id=case_id if kind in ("timestamp", "chart") else None,
        label=label,
        request=request,
    )


def rule_actions(parsed: Parsed) -> list[Action]:
    actions = []
    for kind in parsed.intents:
        if kind == "timestamp":
            actions += [_action(kind, parsed.case_id, label) for label in parsed.labels]
        else:
            actions.append(_action(kind, parsed.case_id))
    return actions


def rule_message(parsed: Parsed, actions: list[Action]) -> str:
    where = f" in {parsed.case_id}" if parsed.case_id else ""
    parts = []
    for action in actions:
        if action.type == "timestamp":
            parts.append(f"moments with the {action.label}{where}")
        elif action.type == "chart":
            parts.append(f"the instrument chart{where}")
        elif action.type == "quiz":
            parts.append("a five-question quiz on the operation")
        else:
            parts.append("the 3D model view")
    if "timestamp" in parsed.intents and not parsed.labels:
        ask = "Which instrument? Try clipper, hook, grasper, irrigator, bipolar or scissors."
        return f"Showing {' and '.join(parts)}. {ask}" if parts else ask
    return f"Showing {' and '.join(parts)}." if parts else "I could not tell what to show."


def genie_actions(answer: GenieAnswer, case_id: str | None) -> list[Action]:
    """Convert Genie's result table into actions, based on its column names."""
    columns = [c.lower() for c in answer.columns]
    rows = [dict(zip(columns, row, strict=False)) for row in answer.rows]
    if not rows:
        return []
    try:
        if CLIP_COLUMNS <= set(columns):
            clips = [
                Clip(
                    case_id=r["case_id"],
                    start_sec=r["start_sec"],
                    end_sec=r["end_sec"],
                    label=r["label"],
                    source=r.get("source") or "annotation",
                )
                for r in rows
            ]
            labels = {c.label for c in clips}
            cases = {c.case_id for c in clips}
            action = _action("timestamp", cases.pop() if len(cases) == 1 else case_id)
            action.label = labels.pop() if len(labels) == 1 else None
            action.results = clips
            return [action]
        if "label" in columns and SUMMARY_COLUMNS & set(columns):
            action = _action("chart", case_id)
            action.request = None  # the data is already attached
            action.summary = [
                LabelSummary(
                    label=r["label"],
                    count=r.get("count") or 0,
                    total_sec=r.get("total_sec") or 0,
                    first_sec=r.get("first_sec") or 0,
                )
                for r in rows
            ]
            return [action]
    except (KeyError, TypeError, ValueError):
        return []  # unexpected cell values; fall back to showing Genie's text and table
    return []


class InterpretService:
    def __init__(self, genie: GenieClient | None = None):
        self.genie = genie

    def interpret(self, query: str, case_id: str | None = None) -> InterpretResponse:
        query = " ".join(query.split())
        if not query:
            raise ValueError("q must contain a question or command")
        parsed = parse(query, case_id)
        actions = rule_actions(parsed)
        response = InterpretResponse(
            query=query,
            interpreter="rules",
            actions=actions,
            message=rule_message(parsed, actions),
            suggestions=[] if parsed.confident else SUGGESTIONS,
        )
        if parsed.confident or self.genie is None:
            return response

        scoped = f"For case_id '{parsed.case_id}': {query}" if parsed.case_id else query
        try:
            answer = self.genie.ask(scoped)
        except GenieError as exc:
            response.genie = GenieTrace(error=str(exc))
            return response

        response.genie = GenieTrace(
            conversation_id=answer.conversation_id,
            sql=answer.sql,
            description=answer.description,
            columns=answer.columns,
            rows=answer.rows,
        )
        from_genie = genie_actions(answer, parsed.case_id)
        if from_genie or answer.text or answer.rows:
            response.interpreter = "genie"
            # Keep non-data actions the rules found (for example "/quiz" in the same message).
            response.actions = from_genie + [a for a in actions if a.type in ("quiz", "model")]
            response.message = answer.text or answer.description or response.message
            response.suggestions = []
        return response
