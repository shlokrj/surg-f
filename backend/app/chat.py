"""Chat: one typed message in, one action with its data out.

Routing order:
1. LLM router (optional): a Databricks chat model picks one tool and its arguments. It
   never writes the reply and never answers from its own knowledge.
2. Rule-based router (always present): keyword rules. Used when the LLM is not configured,
   times out, errors, or returns an invalid tool call.
3. Genie (optional): offered to the LLM as the ask_data tool only when a Genie space is set.

Whichever router decides, the backend runs the existing services directly and writes the
reply itself, so a routing failure never fails the request.
"""

import json
import re
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from dataclasses import dataclass, field

import httpx

from .config import DatabricksCredentials
from .genie import GenieClient, GenieError
from .interpret import (
    CASE,
    CHART,
    COMPLEX,
    LABEL_PATTERNS,
    LABELS,
    QUIZ,
    SYNONYMS,
    genie_actions,
)
from .models import AnswerData, ChatResponse, Clip, SearchResponse, StudyQuiz, StudyQuizItem
from .quiz import QuizService
from .repository import RepositoryError
from .service import CaseNotFoundError, SearchService, TimelineService

CASE_ID = re.compile(r"^[A-Za-z0-9_-]{1,32}$")
# Words that ask for the instrument timeline, on top of the chart words /interpret knows.
TIMELINE = re.compile(
    r"\b(timeline|order|sequence|overview|tools used|instruments used|tools? were used|"
    r"instruments? were used)\b"
)
MODEL_COMMAND = re.compile(r"(?<!\S)/model\b")

STUDY_AID_REPLY = (
    "I'm a study aid, so I can't give medical advice, answer about a specific patient or "
    'judge how well this operation was done. Try an instrument name such as "clipper", '
    "a general question about the procedure, or ask for a quiz."
)

# Checked before any router. Personal advice, drugs and doses, patients, and judging the
# surgery in the video get the fixed reply; Genie is never asked.
DEFLECT = re.compile(
    r"\b(doses?|dosages?|dosing|mg|milligrams?|prescri\w*|medications?|drugs?|antibiotics?|"
    r"should i|i have|i'm having|my (doctor|surgery|operation|pain|symptoms?|gallbladder)|"
    r"(my|this|the) patient'?s?|achieved|adequate\w*|how well|good job|mistakes?|"
    r"(performed|done) (well|badly|poorly|correctly|right|wrong)|rate (the|this) \w+)\b"
)
# Sent straight to Genie when it is set up: it writes topic quizzes, knows the video's
# length and answers general surgery questions, none of which the tools below can do.
QUIZ_ASK = re.compile(QUIZ.pattern[:-3] + r"|flash ?cards?|make a quiz)\b")
VIDEO_LENGTH = re.compile(
    r"\b(how long is (the|this) (video|recording|operation|surgery|procedure)|"
    r"(length|duration) of (the|this) (video|recording|operation|surgery|procedure)|"
    r"video'?s? (length|duration)|"
    r"when does (the|this) (video|recording|operation|surgery|procedure) "
    r"(start|end|begin|finish)|"
    r"how long (does|did) (the|this) (video|operation|surgery|procedure) (take|last|run))\b"
)
EDUCATIONAL = re.compile(
    r"\b(typical(ly)?|usually|generally|in general|normally|commonly|explain|define|"
    r"definition|why (is|are|do|does|would)|purpose of|anatomy|anatomical|calot|"
    r"critical view)\b"
)
WHAT_IS = re.compile(r"\bwhat (is|are) (a|an|the)\b")
NO_MODEL_REPLY = "This video has no 3D model yet. Try an instrument name, a quiz or a chart."
DATA_DOWN_REPLY = "The clip data is unavailable right now. The quiz still works: try 'quiz me'."

SYSTEM_PROMPT = """You are a study-aid router for one operation: a laparoscopic \
cholecystectomy (gallbladder removal) video. Your only job is to pick one tool.

- search_clips(q): the user wants to see when an instrument is visible. q must be exactly \
one of: {labels}. Map synonyms: {synonyms}.
- make_quiz(): the user wants to be quizzed or to practise.
- show_timeline(case_id): the user wants a chart, timeline, order or overview of the tools \
used in a video. The open video is {case_id}.
- clips_in_range(q, after_sec, before_sec): moments for one instrument inside a time window. \
Give times in seconds from the start of the video: minute 10 is 600.
- rank_instruments(order): which instrument was used longest, shortest, most_often or \
least_often.
- instrument_usage(q): how long, or how many times, one instrument was used.
- instruments_together(a, b): when two instruments are visible at the same time.
{genie_line}
Rules:
- Never state medical facts and never answer from your own knowledge.
- If the user asks for medical advice, or for anything these tools cannot do, do not call \
a tool. Reply only: "This is a study aid. Try search, quiz or chart."
"""
GENIE_LINE = (
    "- ask_data(question): slow. Use it for a question about instrument timing that none "
    "of the tools above can answer, a topic quiz, the video's length, or a general "
    "educational question about surgery.\n"
)
RANK_ORDERS = ("longest", "shortest", "most_often", "least_often")


class LLMError(Exception):
    """The LLM router could not give a usable choice. The rules take over."""


@dataclass
class ToolChoice:
    name: str
    arguments: dict = field(default_factory=dict)


def tool_specs(with_genie: bool) -> list[dict]:
    def tool(name: str, description: str, properties: dict, required: list[str]) -> dict:
        parameters = {"type": "object", "properties": properties, "required": required}
        return {
            "type": "function",
            "function": {"name": name, "description": description, "parameters": parameters},
        }

    instrument = {"type": "string", "enum": list(LABELS), "description": "Instrument label"}
    tools = [
        tool(
            "search_clips",
            "Find the moments when one instrument is visible in the open video.",
            {"q": instrument},
            ["q"],
        ),
        tool("make_quiz", "Start a five-question quiz about the operation.", {}, []),
        tool(
            "show_timeline",
            "Show the timeline and usage chart of all instruments in one video.",
            {"case_id": {"type": "string", "description": "Video ID, for example VID01"}},
            [],
        ),
        tool(
            "clips_in_range",
            "Find the moments when one instrument is visible inside a time window.",
            {
                "q": instrument,
                "after_sec": {"type": "number", "description": "Window start, in seconds"},
                "before_sec": {"type": "number", "description": "Window end, in seconds"},
            },
            ["q"],
        ),
        tool(
            "rank_instruments",
            "Rank the instruments in the open video by total time or by number of uses.",
            {"order": {"type": "string", "enum": list(RANK_ORDERS)}},
            ["order"],
        ),
        tool(
            "instrument_usage",
            "How long and how many times one instrument was used in the open video.",
            {"q": instrument},
            ["q"],
        ),
        tool(
            "instruments_together",
            "Find the moments when two instruments are visible at the same time.",
            {"a": instrument, "b": instrument},
            ["a", "b"],
        ),
    ]
    if with_genie:
        tools.append(
            tool(
                "ask_data",
                "Answer an open-ended question about instrument timing from the clip table.",
                {"question": {"type": "string"}},
                ["question"],
            )
        )
    return tools


class LLMRouter:
    """Asks a Databricks serving endpoint (OpenAI-compatible chat completions) for a tool."""

    def __init__(
        self,
        credentials: DatabricksCredentials,
        endpoint: str,
        timeout_sec: float = 8.0,
        transport: httpx.BaseTransport | None = None,
    ):
        self.endpoint = endpoint
        self._http = httpx.Client(
            base_url=f"https://{credentials.server_hostname}",
            headers={"Authorization": f"Bearer {credentials.access_token}"},
            timeout=timeout_sec,
            transport=transport,
        )

    def choose(self, message: str, case_id: str, with_genie: bool = False) -> ToolChoice | None:
        """Return the chosen tool, or None when the model declined to call one."""
        tools = tool_specs(with_genie)
        system = SYSTEM_PROMPT.format(
            labels=", ".join(LABELS),
            synonyms="; ".join(f"{', '.join(p)} = {label}" for label, p in SYNONYMS.items()),
            case_id=case_id,
            genie_line=GENIE_LINE if with_genie else "",
        )
        body = {
            "model": self.endpoint,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": message},
            ],
            "tools": tools,
            "tool_choice": "auto",
            "max_tokens": 200,
            "temperature": 0,
        }
        try:
            response = self._http.post("/serving-endpoints/chat/completions", json=body)
            response.raise_for_status()
            reply = response.json()["choices"][0]["message"]
        except httpx.HTTPStatusError as exc:
            raise LLMError(f"HTTP {exc.response.status_code}") from exc
        except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError) as exc:
            raise LLMError(type(exc).__name__) from exc

        calls = reply.get("tool_calls") or []
        if not calls:
            return None
        try:
            function = calls[0]["function"]
            name = function["name"]
            arguments = json.loads(function.get("arguments") or "{}")
        except (KeyError, TypeError, ValueError) as exc:
            raise LLMError("invalid tool call") from exc
        if name not in {t["function"]["name"] for t in tools} or not isinstance(arguments, dict):
            raise LLMError("invalid tool call")
        return ToolChoice(name, arguments)


def canonical_label(text: str) -> str | None:
    """The dataset label named earliest in the text, through its synonyms. None if none."""
    lower = " ".join(str(text).lower().split())
    found = [(m.start(), label) for label in LABELS if (m := LABEL_PATTERNS[label].search(lower))]
    return min(found)[1] if found else None


def named_case(text: str, default: str) -> str:
    """'video 2' or 'VID02' in the text selects that video; otherwise the open one."""
    match = CASE.search(text.lower())
    return f"VID{int(match.group(1)):02d}" if match else default


SENTENCE_END = re.compile(r"(?<=[.!?])\s+")


LIST_MARK = re.compile(r"(?m)^\s*(?:[-*\u2022]|\d+\.)\s+")
HEADING = re.compile(r"(?m)^\s*#{1,6}\s+(.*?)\s*$")


def short_reply(text: str | None, prose: bool = False) -> str | None:
    """Genie writes long markdown. Data answers keep the first two sentences of the first
    paragraph; prose answers (no result table) keep four sentences across paragraphs."""
    if not text:
        return None
    text = text.strip().replace("**", "").replace("`", "")
    text = HEADING.sub(r"\1:", text)  # "## Typical tools" -> "Typical tools:"
    if prose:
        text = LIST_MARK.sub("\u2022 ", text)
    else:
        text = text.split("\n\n")[0]
    sentences = SENTENCE_END.split(" ".join(text.split()))
    return " ".join(sentences[: 4 if prose else 2]) or None


def study_quiz(columns: list[str], rows: list[list]) -> StudyQuiz | None:
    """Genie's quiz table (question, answer, ...) as quiz items. None if it is not one."""
    names = [c.lower() for c in columns]
    if not {"question", "answer"} <= set(names):
        return None
    items = []
    for number, row in enumerate(rows, 1):
        r = dict(zip(names, row, strict=False))
        if not r.get("question") or not r.get("answer"):
            continue
        try:
            start = float(r["start_sec"]) if r.get("start_sec") is not None else None
            end = float(r["end_sec"]) if r.get("end_sec") is not None else None
        except (TypeError, ValueError):
            start = end = None
        items.append(
            StudyQuizItem(
                question_number=int(r.get("question_number") or number),
                question=str(r["question"]),
                answer=str(r["answer"]),
                explanation=str(r["explanation"]) if r.get("explanation") else None,
                source=str(r.get("source") or "general"),
                case_id=str(r["case_id"]) if r.get("case_id") else None,
                start_sec=start,
                end_sec=end,
            )
        )
    return StudyQuiz(items=items) if items else None


def plural(count: int, noun: str) -> str:
    return f"{count} {noun}" if count == 1 else f"{count} {noun}s"


def clock(seconds: float) -> str:
    return f"{int(seconds) // 60}:{int(seconds) % 60:02d}"


def mentioned_labels(text: str) -> list[str]:
    """Every dataset label named in the text, in the order they appear."""
    lower = " ".join(str(text).lower().split())
    found = [(m.start(), label) for label in LABELS if (m := LABEL_PATTERNS[label].search(lower))]
    return [label for _, label in sorted(found)]


# "after minute 10", "before 12:30", "after 600 seconds", "after 10 minutes", "after 10".
TIME_BOUND = re.compile(
    r"\b(after|past|from|before|until)\s+(?:the\s+)?(?:(minute|min|second|sec)s?\s+)?"
    r"(\d{1,4})(?::(\d{2}))?\s*(minutes?|mins?|seconds?|secs?)?"
)
TOGETHER = re.compile(r"\b(together|same time|overlap\w*|simultaneous\w*|alongside)\b")
USAGE = re.compile(r"\b(how long|how many|how often|how much|total time|duration)\b")
RANK_WORDS = {
    "longest": re.compile(r"\b(longest|most time)\b"),
    "shortest": re.compile(r"\b(shortest|least time)\b"),
    "most_often": re.compile(r"\b(most often|most frequent\w*|most used|used the most|most)\b"),
    "least_often": re.compile(
        r"\b(least often|least frequent\w*|least used|used the least|least)\b"
    ),
}


def time_window(text: str) -> tuple[float | None, float | None]:
    """(after_sec, before_sec) named in the text. A bare number means minutes."""
    after = before = None
    for word, unit_before, number, seconds, unit_after in TIME_BOUND.findall(text.lower()):
        unit = unit_before or unit_after
        if seconds:
            value = int(number) * 60 + int(seconds)
        elif unit.startswith("sec"):
            value = int(number)
        else:
            value = int(number) * 60
        if word in ("before", "until"):
            before = float(value)
        else:
            after = float(value)
    return after, before


def window_phrase(after: float | None, before: float | None) -> str:
    if after is not None and before is not None:
        return f" between {clock(after)} and {clock(before)}"
    if after is not None:
        return f" after {clock(after)}"
    return f" before {clock(before)}" if before is not None else ""


def overlaps(first: list, second: list) -> list[tuple[float, float]]:
    """Time ranges where a segment of `first` and a segment of `second` are both visible."""
    found = [
        (max(a.start_sec, b.start_sec), min(a.end_sec, b.end_sec))
        for a in first
        for b in second
        if a.start_sec < b.end_sec and b.start_sec < a.end_sec
    ]
    return sorted(found)


class ChatService:
    def __init__(
        self,
        search: SearchService,
        timeline: TimelineService,
        quiz: QuizService,
        llm: LLMRouter | None = None,
        genie: GenieClient | None = None,
        llm_timeout_sec: float = 8.0,
    ):
        self.search, self.timeline, self.quiz = search, timeline, quiz
        self.llm, self.genie = llm, genie
        self.llm_timeout_sec = llm_timeout_sec
        self._pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="chat-llm")

    def chat(
        self, message: str, case_id: str = "VID01", duration_sec: float | None = None
    ) -> tuple[ChatResponse, str | None]:
        """Answer one message. Also returns a note for the log when a router fell back."""
        message = " ".join(message.split())
        if not message:
            raise ValueError("message must contain text")
        lower = message.lower()
        if DEFLECT.search(lower):
            response = ChatResponse(reply=STUDY_AID_REPLY, action="none", data=None, router="rules")
            return response, None
        if duration_sec and VIDEO_LENGTH.search(lower):
            reply = (
                f"{case_id} is {clock(duration_sec)} long: it starts at 0:00 and ends at "
                f"{clock(duration_sec)}."
            )
            return ChatResponse(reply=reply, action="none", data=None, router="rules"), None
        note = None
        if self.genie is not None and self._for_genie(lower):
            try:
                response = self._from_genie(message, case_id, duration_sec)
                if response.action == "study_quiz" or not QUIZ_ASK.search(lower):
                    return response, None
                note = "genie: no quiz table"  # e.g. Genie declined; use the bank quiz
            except GenieError as exc:
                note = f"genie: {exc}"  # quizzes still work from the bank below
        if self.llm is not None:
            try:
                return self._from_llm(message, case_id, duration_sec)
            except (LLMError, GenieError) as exc:
                note = f"{'genie' if isinstance(exc, GenieError) else 'llm'}: {exc}"
        response, data_note = self._from_rules(message, case_id)
        return response, note or data_note

    @staticmethod
    def _for_genie(lower: str) -> bool:
        """Quiz requests, video length and general surgery questions."""
        if QUIZ_ASK.search(lower) or VIDEO_LENGTH.search(lower) or EDUCATIONAL.search(lower):
            return True
        # "what is the Calot triangle" yes; "what is the total time of the hook" stays a tool.
        return bool(WHAT_IS.search(lower)) and not COMPLEX.search(lower)

    # --- routers -------------------------------------------------------------

    def _from_llm(
        self, message: str, case_id: str, duration_sec: float | None = None
    ) -> tuple[ChatResponse, str | None]:
        future = self._pool.submit(self.llm.choose, message, case_id, self.genie is not None)
        try:
            choice = future.result(timeout=self.llm_timeout_sec)  # hard wall-clock limit
        except FutureTimeout:
            future.cancel()
            raise LLMError("timeout") from None
        if choice is None:
            # The model's own words are never shown; the reply is fixed.
            response = ChatResponse(reply=STUDY_AID_REPLY, action="none", data=None, router="llm")
            return response, None

        if choice.name == "search_clips":
            label = canonical_label(choice.arguments.get("q", ""))
            if label is None:
                raise LLMError("invalid tool call: unknown instrument")
            return self._run("search", case_id, "llm", label)
        if choice.name == "make_quiz":
            return self._run("quiz", case_id, "llm")
        if choice.name == "show_timeline":
            wanted = str(choice.arguments.get("case_id") or case_id)
            return self._run("timeline", wanted if CASE_ID.match(wanted) else case_id, "llm")
        args = choice.arguments
        if choice.name == "clips_in_range":
            label = self._label(args.get("q"))
            after, before = (
                self._seconds(args.get("after_sec")),
                self._seconds(args.get("before_sec")),
            )
            return self._run("range", case_id, "llm", label, after=after, before=before)
        if choice.name == "rank_instruments":
            if args.get("order") not in RANK_ORDERS:
                raise LLMError("invalid tool call: unknown order")
            return self._run("rank", case_id, "llm", order=args["order"])
        if choice.name == "instrument_usage":
            return self._run("usage", case_id, "llm", self._label(args.get("q")))
        if choice.name == "instruments_together":
            first, second = self._label(args.get("a")), self._label(args.get("b"))
            if first == second:
                raise LLMError("invalid tool call: same instrument twice")
            return self._run("together", case_id, "llm", first, other=second)
        if choice.name == "ask_data" and self.genie is not None:
            question = str(choice.arguments.get("question") or message)
            return self._from_genie(question, case_id, duration_sec), None
        raise LLMError("invalid tool call")

    @staticmethod
    def _label(value) -> str:
        label = canonical_label(value or "")
        if label is None:
            raise LLMError("invalid tool call: unknown instrument")
        return label

    @staticmethod
    def _seconds(value) -> float | None:
        if value is None or value == "":
            return None
        try:
            seconds = float(value)
        except (TypeError, ValueError):
            raise LLMError("invalid tool call: bad time") from None
        if seconds < 0:
            raise LLMError("invalid tool call: bad time")
        return seconds

    def _from_genie(
        self, question: str, case_id: str, duration_sec: float | None = None
    ) -> ChatResponse:
        length = f" (video length {clock(duration_sec)})" if duration_sec else ""
        answer = self.genie.ask(f"For case_id '{case_id}'{length}: {question}")  # own timeout
        quiz = study_quiz(answer.columns, answer.rows)
        if quiz is not None:
            count = len(quiz.items)
            reply = f"Here is a {count}-question quiz. Reveal each answer when you are ready."
            return ChatResponse(reply=reply, action="study_quiz", data=quiz, router="genie")
        text = short_reply(answer.text or answer.description, prose=not answer.rows)
        actions = genie_actions(answer, case_id)
        if actions and actions[0].results:
            clips = actions[0].results
            reply = text or f"Found {len(clips)} matching moments."
            data = SearchResponse(results=clips)
            return ChatResponse(reply=reply, action="search", data=data, router="genie")
        if not text and not answer.rows:
            raise GenieError("empty answer")
        data = AnswerData(columns=answer.columns, rows=answer.rows, sql=answer.sql)
        if not text:
            # Genie gave a table without words: read out its first row.
            cells = zip(answer.columns, answer.rows[0], strict=False)
            top = ", ".join(f"{c} {v:g}" if isinstance(v, float) else f"{c} {v}" for c, v in cells)
            text = f"Top result: {top}."
        return ChatResponse(
            reply=text,
            action="answer",
            data=data if answer.rows else None,
            router="genie",
        )

    def _from_rules(self, message: str, case_id: str) -> tuple[ChatResponse, str | None]:
        lower = message.lower()
        case_id = named_case(message, case_id)
        if QUIZ_ASK.search(lower):
            return self._run("quiz", case_id, "rules")
        labels = mentioned_labels(lower)
        after, before = time_window(lower)
        if len(labels) >= 2 and TOGETHER.search(lower):
            return self._run("together", case_id, "rules", labels[0], other=labels[1])
        if labels and (after is not None or before is not None):
            return self._run("range", case_id, "rules", labels[0], after=after, before=before)
        if labels and USAGE.search(lower):
            return self._run("usage", case_id, "rules", labels[0])
        if not labels:
            for order, pattern in RANK_WORDS.items():
                if pattern.search(lower):
                    return self._run("rank", case_id, "rules", order=order)
        if TIMELINE.search(lower) or CHART.search(lower):
            return self._run("timeline", case_id, "rules")
        label = labels[0] if labels else None
        if label:
            return self._run("search", case_id, "rules", label)
        reply = NO_MODEL_REPLY if MODEL_COMMAND.search(lower) else STUDY_AID_REPLY
        return ChatResponse(reply=reply, action="none", data=None, router="rules"), None

    # --- actions: call the existing services directly ---------------------------

    def _run(
        self, kind: str, case_id: str, router: str, label: str | None = None, **options
    ) -> tuple[ChatResponse, str | None]:
        """Carry out one decision. `kind` is quiz, timeline, search, range, rank, usage or
        together; the last four are computed here from the same rows the timeline uses."""
        try:
            build = getattr(self, f"_do_{kind}")
            reply, action, data = build(case_id, label, **options)
        except CaseNotFoundError:
            reply = f"I have no annotations for {case_id}. Try VID01 or VID02."
            return ChatResponse(reply=reply, action="none", data=None, router=router), None
        except RepositoryError as exc:
            response = ChatResponse(reply=DATA_DOWN_REPLY, action="none", data=None, router=router)
            return response, f"repository: {exc}"
        return ChatResponse(reply=reply, action=action, data=data, router=router), None

    def _do_quiz(self, case_id, label):
        return "Here is a five-question quiz on the operation.", "quiz", self.quiz.quiz(None)

    def _do_timeline(self, case_id, label):
        data = self.timeline.timeline(case_id)
        reply = (
            f"Here is the instrument timeline for {case_id}: {len(data.segments)} "
            f"segments across {len(data.summary)} instruments."
        )
        return reply, "timeline", data

    def _do_search(self, case_id, label):
        return self._do_range(case_id, label)

    def _do_range(self, case_id, label, after=None, before=None):
        clips = self.search.search_case(label, case_id).results
        clips = [
            c
            for c in clips
            if (after is None or c.start_sec >= after) and (before is None or c.start_sec < before)
        ]
        window = window_phrase(after, before)
        if clips:
            moments = "1 moment" if len(clips) == 1 else f"{len(clips)} moments"
            reply = (
                f"Found {moments} with the {label} in {case_id}{window}. "
                f"The first starts at {clock(clips[0].start_sec)}."
            )
        else:
            reply = f"No moments with the {label} are annotated in {case_id}{window}."
        return reply, "search", SearchResponse(results=clips)

    @staticmethod
    def _table(rows) -> AnswerData:
        columns = ["label", "count", "total_sec", "first_sec"]
        return AnswerData(
            columns=columns, rows=[[r.label, r.count, r.total_sec, r.first_sec] for r in rows]
        )

    def _do_rank(self, case_id, label, order="longest"):
        summary = self.timeline.timeline(case_id).summary
        if not summary:
            return f"No instruments are annotated in {case_id}.", "answer", None
        by_time = order in ("longest", "shortest")
        rows = sorted(
            summary,
            key=lambda s: (s.total_sec if by_time else s.count, s.label),
            reverse=order in ("longest", "most_often"),
        )
        top = rows[0]
        if by_time:
            reply = (
                f"The {top.label} was used the {order} in {case_id}: {clock(top.total_sec)} in "
                f"total across {plural(top.count, 'interval')}."
            )
            if len(rows) > 1:
                reply += f" Next is the {rows[1].label} at {clock(rows[1].total_sec)}."
        else:
            often = "Most often" if order == "most_often" else "Least often"
            reply = (
                f"{often} in {case_id}: the {top.label}, with {plural(top.count, 'interval')} and "
                f"{clock(top.total_sec)} in total."
            )
            if len(rows) > 1:
                reply += f" Next is the {rows[1].label} with {rows[1].count}."
        return reply, "answer", self._table(rows)

    def _do_usage(self, case_id, label):
        summary = self.timeline.timeline(case_id).summary
        row = next((s for s in summary if s.label == label), None)
        if row is None:
            return f"The {label} is not annotated in {case_id}.", "answer", None
        times = "1 time" if row.count == 1 else f"{row.count} times"
        reply = (
            f"The {label} was used {times} in {case_id} for {clock(row.total_sec)} in total, "
            f"first at {clock(row.first_sec)}."
        )
        return reply, "answer", self._table([row])

    def _do_together(self, case_id, label, other=None):
        segments = self.timeline.timeline(case_id).segments
        ranges = overlaps(
            [s for s in segments if s.label == label], [s for s in segments if s.label == other]
        )
        clips = [
            Clip(
                case_id=case_id,
                start_sec=start,
                end_sec=end,
                label=f"{label} + {other}",
                source="annotation",
            )
            for start, end in ranges
        ]
        if not clips:
            reply = f"The {label} and {other} are never visible together in {case_id}."
            return reply, "search", SearchResponse(results=[])
        times = "1 time" if len(clips) == 1 else f"{len(clips)} times"
        total = sum(end - start for start, end in ranges)
        reply = (
            f"The {label} and {other} are visible together {times} in {case_id}, for "
            f"{clock(total)} in total. The first overlap starts at {clock(ranges[0][0])}."
        )
        return reply, "search", SearchResponse(results=clips)
