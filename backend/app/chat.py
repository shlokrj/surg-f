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
from .interpret import CASE, CHART, LABEL_PATTERNS, LABELS, QUIZ, SYNONYMS, genie_actions
from .models import AnswerData, ChatResponse, SearchResponse
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
    "I'm a study aid for this operation, so I can't give medical advice or answer that. "
    'Try an instrument name such as "clipper", ask for a quiz, or ask for a chart of the '
    "tools used."
)
NO_MODEL_REPLY = "This video has no 3D model yet. Try an instrument name, a quiz or a chart."
DATA_DOWN_REPLY = "The clip data is unavailable right now. The quiz still works: try 'quiz me'."

SYSTEM_PROMPT = """You are a study-aid router for one operation: a laparoscopic \
cholecystectomy (gallbladder removal) video. Your only job is to pick one tool.

- search_clips(q): the user wants to see when an instrument is visible. q must be exactly \
one of: {labels}. Map synonyms: {synonyms}.
- make_quiz(): the user wants to be quizzed or to practise.
- show_timeline(case_id): the user wants a chart, timeline, order or overview of the tools \
used in a video. The open video is {case_id}.
{genie_line}
Rules:
- Never state medical facts and never answer from your own knowledge.
- If the user asks for medical advice, or for anything these tools cannot do, do not call \
a tool. Reply only: "This is a study aid. Try search, quiz or chart."
"""
GENIE_LINE = (
    "- ask_data(question): an open-ended question about instrument timing that the other "
    "tools cannot answer, for example comparisons, durations, or before/after a time.\n"
)


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

    tools = [
        tool(
            "search_clips",
            "Find the moments when one instrument is visible in the open video.",
            {"q": {"type": "string", "enum": list(LABELS), "description": "Instrument label"}},
            ["q"],
        ),
        tool("make_quiz", "Start a five-question quiz about the operation.", {}, []),
        tool(
            "show_timeline",
            "Show the timeline and usage chart of all instruments in one video.",
            {"case_id": {"type": "string", "description": "Video ID, for example VID01"}},
            [],
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


def clock(seconds: float) -> str:
    return f"{int(seconds) // 60}:{int(seconds) % 60:02d}"


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

    def chat(self, message: str, case_id: str = "VID01") -> tuple[ChatResponse, str | None]:
        """Answer one message. Also returns a note for the log when a router fell back."""
        message = " ".join(message.split())
        if not message:
            raise ValueError("message must contain text")
        note = None
        if self.llm is not None:
            try:
                return self._from_llm(message, case_id)
            except (LLMError, GenieError) as exc:
                note = f"{'genie' if isinstance(exc, GenieError) else 'llm'}: {exc}"
        response, data_note = self._from_rules(message, case_id)
        return response, note or data_note

    # --- routers -------------------------------------------------------------

    def _from_llm(self, message: str, case_id: str) -> tuple[ChatResponse, str | None]:
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
        if choice.name == "ask_data" and self.genie is not None:
            question = str(choice.arguments.get("question") or message)
            return self._from_genie(question, case_id), None
        raise LLMError("invalid tool call")

    def _from_genie(self, question: str, case_id: str) -> ChatResponse:
        answer = self.genie.ask(f"For case_id '{case_id}': {question}")  # has its own timeout
        text = answer.text or answer.description
        actions = genie_actions(answer, case_id)
        if actions and actions[0].results:
            clips = actions[0].results
            reply = text or f"Found {len(clips)} matching moments."
            data = SearchResponse(results=clips)
            return ChatResponse(reply=reply, action="search", data=data, router="genie")
        if not text and not answer.rows:
            raise GenieError("empty answer")
        data = AnswerData(columns=answer.columns, rows=answer.rows, sql=answer.sql)
        return ChatResponse(
            reply=text or "Here is what the clip data shows.",
            action="answer",
            data=data if answer.rows else None,
            router="genie",
        )

    def _from_rules(self, message: str, case_id: str) -> tuple[ChatResponse, str | None]:
        lower = message.lower()
        case_id = named_case(message, case_id)
        if QUIZ.search(lower):
            return self._run("quiz", case_id, "rules")
        if TIMELINE.search(lower) or CHART.search(lower):
            return self._run("timeline", case_id, "rules")
        label = canonical_label(lower)
        if label:
            return self._run("search", case_id, "rules", label)
        reply = NO_MODEL_REPLY if MODEL_COMMAND.search(lower) else STUDY_AID_REPLY
        return ChatResponse(reply=reply, action="none", data=None, router="rules"), None

    # --- actions: call the existing services directly ---------------------------

    def _run(
        self, action: str, case_id: str, router: str, label: str | None = None
    ) -> tuple[ChatResponse, str | None]:
        try:
            if action == "quiz":
                reply = "Here is a five-question quiz on the operation."
                data = self.quiz.quiz(None)
            elif action == "timeline":
                data = self.timeline.timeline(case_id)
                reply = (
                    f"Here is the instrument timeline for {case_id}: {len(data.segments)} "
                    f"segments across {len(data.summary)} instruments."
                )
            else:
                data = self.search.search_case(label, case_id)
                count = len(data.results)
                if count:
                    first = clock(data.results[0].start_sec)
                    moments = "1 moment" if count == 1 else f"{count} moments"
                    reply = (
                        f"Found {moments} with the {label} in {case_id}. "
                        f"The first starts at {first}."
                    )
                else:
                    reply = f"No moments with the {label} are annotated in {case_id}."
        except CaseNotFoundError:
            reply = f"I have no annotations for {case_id}. Try VID01 or VID02."
            return ChatResponse(reply=reply, action="none", data=None, router=router), None
        except RepositoryError as exc:
            response = ChatResponse(reply=DATA_DOWN_REPLY, action="none", data=None, router=router)
            return response, f"repository: {exc}"
        return ChatResponse(reply=reply, action=action, data=data, router=router), None
