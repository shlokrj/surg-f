import json
import logging
import time

import httpx
import pytest
from fastapi.testclient import TestClient

from app.chat import STUDY_AID_REPLY, LLMError, LLMRouter, ToolChoice, tool_specs
from app.config import FIXTURES_DIR, settings_from
from app.genie import GenieAnswer, GenieClient, GenieError
from app.main import build_llm, create_app
from app.models import ChatResponse, Clip
from app.repository import RepositoryError

CREDS = settings_from(
    {"DATABRICKS_SERVER_HOSTNAME": "h", "DATABRICKS_HTTP_PATH": "p", "DATABRICKS_TOKEN": "t"}
).databricks
VID01_CLIPPER = [(674, 690), (698, 747), (749, 753)]


class FakeLLM:
    """Stands in for LLMRouter: returns a canned choice, raises, or stalls."""

    def __init__(self, choice=None, error=None, delay=0.0):
        self.choice, self.error, self.delay = choice, error, delay
        self.calls = []

    def choose(self, message, case_id, with_genie=False):
        self.calls.append((message, case_id, with_genie))
        time.sleep(self.delay)
        if self.error:
            raise self.error
        return self.choice


class FakeGenie:
    def __init__(self, answer=None, error=None):
        self.answer, self.error = answer, error
        self.questions = []

    def ask(self, question):
        self.questions.append(question)
        if self.error:
            raise self.error
        return self.answer


class FailingRepository:
    mode = "databricks"

    def find_by_label(self, label):
        raise RepositoryError("warehouse down")

    def find_by_case(self, case_id):
        raise RepositoryError("warehouse down")

    def warm_up(self):
        return None


def make_client(llm=None, genie=None, repository=None, **env):
    settings = settings_from({"SURGF_WARMUP": "0", **env})
    return TestClient(create_app(settings=settings, repository=repository, llm=llm, genie=genie))


def ask(client, message, case_id=None):
    body = {"message": message} if case_id is None else {"message": message, "case_id": case_id}
    response = client.post("/chat", json=body)
    assert response.status_code == 200, response.text
    return response.json()


def first_clips(body, count=3):
    return [(c["start_sec"], c["end_sec"]) for c in body["data"]["results"][:count]]


# --- rule-based router (fixture mode, no credentials, no LLM) -------------------


def test_rules_quiz_me():
    body = ask(make_client(), "quiz me")
    assert (body["action"], body["router"]) == ("quiz", "rules")
    assert len(body["data"]["questions"]) == 5


def test_rules_chart_of_the_tools():
    body = ask(make_client(), "show me a chart of the tools")
    assert (body["action"], body["router"]) == ("timeline", "rules")
    assert body["data"]["case_id"] == "VID01"
    assert body["data"]["source"] == "annotation"
    assert body["data"]["segments"] and body["data"]["summary"]


@pytest.mark.parametrize("message", ["clipper", "clip applier", "show me when the clipper is used"])
def test_rules_search_maps_synonyms_to_the_dataset_label(message):
    body = ask(make_client(), message)
    assert (body["action"], body["router"]) == ("search", "rules")
    assert first_clips(body) == VID01_CLIPPER
    assert {c["label"] for c in body["data"]["results"]} == {"clipper"}
    assert {c["case_id"] for c in body["data"]["results"]} == {"VID01"}
    assert {c["source"] for c in body["data"]["results"]} == {"annotation"}
    assert "11:14" in body["reply"]


@pytest.mark.parametrize(
    "message",
    ["chart the tools used in this case", "what order were the instruments used", "/chart"],
)
def test_rules_timeline_words(message):
    assert ask(make_client(), message)["action"] == "timeline"


def test_rules_medical_advice_is_declined():
    body = ask(make_client(), "what dose of antibiotics should I give")
    assert body == {"reply": STUDY_AID_REPLY, "action": "none", "data": None, "router": "rules"}


def test_rules_message_can_name_another_video():
    body = ask(make_client(), "when is the hook used in video 2")
    assert {c["case_id"] for c in body["data"]["results"]} == {"VID02"}


def test_unknown_case_is_answered_not_failed():
    body = ask(make_client(), "show the timeline", case_id="VID99")
    assert body["action"] == "none" and body["data"] is None
    assert "VID99" in body["reply"]


def test_blank_message_and_bad_case_are_rejected():
    client = make_client()
    assert client.post("/chat", json={"message": "   "}).status_code == 422
    assert client.post("/chat", json={"message": "quiz", "case_id": "bad id!"}).status_code == 422
    assert client.post("/chat", json={}).status_code == 422


def test_data_store_failure_still_answers_and_quiz_still_works():
    client = make_client(repository=FailingRepository())
    body = ask(client, "clipper")
    assert body["action"] == "none" and body["data"] is None
    assert ask(client, "quiz me")["action"] == "quiz"


class MixedRepository:
    """Like the live table: instrument rows plus verb and target rows in the same column."""

    mode = "databricks"
    rows = [("grasper", 0, 5), ("grasp", 0, 5), ("gallbladder", 0, 5), ("clipper", 10, 20)]

    def find_by_label(self, label):
        return [c for c in self.find_by_case("VID01") if c.label == label]

    def find_by_case(self, case_id):
        return [
            Clip(case_id=case_id, start_sec=s, end_sec=e, label=label, source="annotation")
            for label, s, e in self.rows
        ]

    def warm_up(self):
        return None


def test_timeline_keeps_only_the_six_instruments():
    client = make_client(repository=MixedRepository())
    timeline = client.get("/cases/VID01/timeline").json()
    assert [s["label"] for s in timeline["segments"]] == ["grasper", "clipper"]
    assert {s["label"] for s in timeline["summary"]} == {"grasper", "clipper"}
    body = ask(client, "chart the tools used")
    assert body["data"] == timeline
    assert "2 segments across 2 instruments" in body["reply"]


# --- LLM router (mocked) -----------------------------------------------------------


@pytest.mark.parametrize(
    ("choice", "action"),
    [
        (ToolChoice("search_clips", {"q": "clipper"}), "search"),
        (ToolChoice("search_clips", {"q": "Clip Applier"}), "search"),
        (ToolChoice("make_quiz"), "quiz"),
        (ToolChoice("show_timeline", {"case_id": "VID01"}), "timeline"),
        (ToolChoice("show_timeline"), "timeline"),
    ],
)
def test_llm_tool_choice_runs_the_matching_service(choice, action):
    llm = FakeLLM(choice)
    body = ask(make_client(llm=llm), "anything at all")
    assert (body["action"], body["router"]) == (action, "llm")
    assert llm.calls == [("anything at all", "VID01", False)]
    if action == "search":
        assert first_clips(body) == VID01_CLIPPER


def test_llm_timeout_falls_back_to_rules():
    llm = FakeLLM(ToolChoice("make_quiz"), delay=0.5)
    client = make_client(llm=llm, SURGF_CHAT_TIMEOUT_SEC="0.05")
    start = time.perf_counter()
    body = ask(client, "clipper")
    assert time.perf_counter() - start < 0.4  # did not wait for the slow model
    assert (body["action"], body["router"]) == ("search", "rules")


@pytest.mark.parametrize(
    "llm",
    [
        FakeLLM(error=LLMError("HTTP 500")),
        FakeLLM(error=LLMError("invalid tool call")),
        FakeLLM(ToolChoice("search_clips", {"q": "antibiotics"})),  # not an instrument
        FakeLLM(ToolChoice("search_clips", {})),
        FakeLLM(ToolChoice("ask_data", {"question": "x"})),  # Genie is not configured
        FakeLLM(ToolChoice("delete_everything")),
    ],
)
def test_llm_error_or_invalid_tool_call_falls_back_to_rules(llm):
    body = ask(make_client(llm=llm), "quiz me")
    assert (body["action"], body["router"]) == ("quiz", "rules")


def test_llm_declining_returns_none_with_a_fixed_reply():
    body = ask(make_client(llm=FakeLLM(None)), "tell me a joke")
    assert body == {"reply": STUDY_AID_REPLY, "action": "none", "data": None, "router": "llm"}


def test_llm_http_client_parses_tool_calls_and_never_relays_model_text():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["path"] = request.url.path
        seen["body"] = json.loads(request.content)
        user = seen["body"]["messages"][1]["content"]
        if "antibiotics" in user:
            message = {"role": "assistant", "content": "Give 2 g of something."}
        else:
            call = {"function": {"name": "search_clips", "arguments": '{"q": "clipper"}'}}
            message = {"role": "assistant", "content": None, "tool_calls": [call]}
        return httpx.Response(200, json={"choices": [{"message": message}]})

    llm = LLMRouter(CREDS, "endpoint-x", transport=httpx.MockTransport(handler))
    client = make_client(llm=llm)

    body = ask(client, "where is the clip applier")
    assert (body["action"], body["router"]) == ("search", "llm")
    assert seen["path"] == "/serving-endpoints/chat/completions"
    assert seen["body"]["model"] == "endpoint-x"
    names = [t["function"]["name"] for t in seen["body"]["tools"]]
    assert names == [
        "search_clips",
        "make_quiz",
        "show_timeline",
        "clips_in_range",
        "rank_instruments",
        "instrument_usage",
        "instruments_together",
    ]  # no ask_data without Genie, no show_3d

    body = ask(client, "what dose of antibiotics should I give")
    assert body["action"] == "none" and body["reply"] == STUDY_AID_REPLY
    assert "2 g" not in json.dumps(body)


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(500, json={}),
        httpx.Response(200, text="not json"),
        httpx.Response(200, json={"choices": []}),
        httpx.Response(
            200,
            json={
                "choices": [
                    {"message": {"tool_calls": [{"function": {"name": "x", "arguments": "{"}}]}}
                ]
            },
        ),
    ],
)
def test_llm_http_failures_raise_llm_error(response):
    llm = LLMRouter(CREDS, "e", transport=httpx.MockTransport(lambda request: response))
    with pytest.raises(LLMError):
        llm.choose("clipper", "VID01")


def test_llm_is_built_only_with_credentials_and_an_endpoint_name():
    creds = {
        "DATABRICKS_SERVER_HOSTNAME": "h",
        "DATABRICKS_HTTP_PATH": "p",
        "DATABRICKS_TOKEN": "t",
    }
    assert build_llm(settings_from({})) is None
    assert build_llm(settings_from(creds)) is None
    assert build_llm(settings_from({"DATABRICKS_CHAT_ENDPOINT": "e"})) is None
    assert build_llm(settings_from({**creds, "DATABRICKS_CHAT_ENDPOINT": "e"})).endpoint == "e"


# --- structured data tools (fast answers without Genie) ---------------------------


def test_clips_in_range_filters_by_start_time():
    llm = FakeLLM(ToolChoice("clips_in_range", {"q": "hook", "after_sec": 600}))
    body = ask(make_client(llm=llm), "when was the hook used after minute 10?")
    assert (body["action"], body["router"]) == ("search", "llm")
    starts = [c["start_sec"] for c in body["data"]["results"]]
    assert starts == [894, 1039, 1182, 1381, 1432, 1438]
    assert "after 10:00" in body["reply"] and "14:54" in body["reply"]

    llm = FakeLLM(
        ToolChoice("clips_in_range", {"q": "clipper", "after_sec": 690, "before_sec": 750})
    )
    body = ask(make_client(llm=llm), "x")
    assert first_clips(body) == [(698, 747), (749, 753)]
    assert "between 11:30 and 12:30" in body["reply"]


def test_rank_instruments_orders_the_summary():
    body = ask(make_client(llm=FakeLLM(ToolChoice("rank_instruments", {"order": "longest"}))), "x")
    assert (body["action"], body["router"]) == ("answer", "llm")
    assert body["data"]["columns"] == ["label", "count", "total_sec", "first_sec"]
    assert body["data"]["rows"][0] == ["grasper", 42, 1141.0, 0.0]
    assert body["data"]["rows"][-1][0] == "scissors"
    assert body["data"]["sql"] is None
    assert body["reply"].startswith("The grasper was used the longest in VID01: 19:01")
    assert "Next is the hook at 13:08." in body["reply"]

    body = ask(make_client(llm=FakeLLM(ToolChoice("rank_instruments", {"order": "shortest"}))), "x")
    assert body["data"]["rows"][0][0] == "scissors"
    body = ask(
        make_client(llm=FakeLLM(ToolChoice("rank_instruments", {"order": "least_often"}))), "x"
    )
    assert body["data"]["rows"][0][:2] == ["scissors", 1]


def test_instrument_usage_reports_one_instrument():
    body = ask(make_client(llm=FakeLLM(ToolChoice("instrument_usage", {"q": "clip applier"}))), "x")
    assert body["action"] == "answer"
    assert (
        body["reply"] == "The clipper was used 5 times in VID01 for 1:42 in total, first at 11:14."
    )
    assert body["data"]["rows"] == [["clipper", 5, 102.0, 674.0]]


def test_instruments_together_returns_overlapping_ranges():
    llm = FakeLLM(ToolChoice("instruments_together", {"a": "grasper", "b": "hook"}))
    body = ask(make_client(llm=llm), "x")
    assert (body["action"], body["router"]) == ("search", "llm")
    results = body["data"]["results"]
    assert len(results) == 13
    assert (results[0]["start_sec"], results[0]["end_sec"]) == (20, 108)
    assert {c["label"] for c in results} == {"grasper + hook"}
    assert all(c["start_sec"] < c["end_sec"] for c in results)
    assert "13 times" in body["reply"]


@pytest.mark.parametrize(
    "choice",
    [
        ToolChoice("clips_in_range", {"q": "antibiotics"}),
        ToolChoice("clips_in_range", {"q": "hook", "after_sec": "soon"}),
        ToolChoice("clips_in_range", {"q": "hook", "after_sec": -5}),
        ToolChoice("rank_instruments", {"order": "best"}),
        ToolChoice("instrument_usage", {}),
        ToolChoice("instruments_together", {"a": "hook", "b": "hook"}),
        ToolChoice("instruments_together", {"a": "hook"}),
    ],
)
def test_invalid_data_tool_arguments_fall_back_to_rules(choice):
    body = ask(make_client(llm=FakeLLM(choice)), "quiz me")
    assert (body["action"], body["router"]) == ("quiz", "rules")


@pytest.mark.parametrize(
    ("message", "action", "check"),
    [
        (
            "when was the hook used after minute 10?",
            "search",
            lambda b: len(b["data"]["results"]) == 6,
        ),
        (
            "hook before 5:00",
            "search",
            lambda b: all(c["start_sec"] < 300 for c in b["data"]["results"]),
        ),
        ("clipper after 700 seconds", "search", lambda b: first_clips(b, 1) == [(749, 753)]),
        (
            "which instrument was used the longest?",
            "answer",
            lambda b: b["data"]["rows"][0][0] == "grasper",
        ),
        (
            "which tool was used the least?",
            "answer",
            lambda b: b["data"]["rows"][0][0] == "scissors",
        ),
        ("how many times was the clipper used?", "answer", lambda b: "5 times" in b["reply"]),
        (
            "when were the grasper and hook used together?",
            "search",
            lambda b: len(b["data"]["results"]) == 13,
        ),
        ("show me when the clipper is used", "search", lambda b: len(b["data"]["results"]) == 5),
    ],
)
def test_rules_answer_data_questions_without_any_ai_service(message, action, check):
    body = ask(make_client(), message)
    assert (body["action"], body["router"]) == (action, "rules")
    assert check(body), body["reply"]


# --- Genie (optional tool) ---------------------------------------------------------


def test_ask_data_tool_is_offered_only_when_genie_is_configured():
    assert "ask_data" not in [t["function"]["name"] for t in tool_specs(False)]
    assert "ask_data" in [t["function"]["name"] for t in tool_specs(True)]
    llm = FakeLLM(ToolChoice("make_quiz"))
    ask(make_client(llm=llm, genie=FakeGenie()), "show me the hook")
    assert llm.calls[0][2] is True


def test_genie_clip_rows_become_a_search_action():
    answer = GenieAnswer(
        conversation_id="c1",
        text="The hook was used once after minute 10.",
        columns=["case_id", "start_sec", "end_sec", "label", "source"],
        rows=[["VID01", 700, 720, "hook", "annotation"]],
    )
    genie = FakeGenie(answer)
    llm = FakeLLM(ToolChoice("ask_data", {"question": "hook after minute 10?"}))
    body = ask(make_client(llm=llm, genie=genie), "when was the hook used after minute 10?")
    assert (body["action"], body["router"]) == ("search", "genie")
    assert first_clips(body) == [(700, 720)]
    assert genie.questions == ["For case_id 'VID01': hook after minute 10?"]


def test_genie_table_becomes_an_answer_action():
    answer = GenieAnswer(
        conversation_id="c1",
        text="The grasper was used the longest.",
        sql="SELECT 1",
        columns=["label", "total_sec"],
        rows=[["grasper", 1141]],
    )
    llm = FakeLLM(ToolChoice("ask_data", {"question": "longest?"}))
    body = ask(make_client(llm=llm, genie=FakeGenie(answer)), "which was used longest?")
    assert (body["action"], body["router"]) == ("answer", "genie")
    assert body["reply"] == "The grasper was used the longest."
    assert body["data"] == {
        "columns": ["label", "total_sec"],
        "rows": [["grasper", 1141]],
        "sql": "SELECT 1",
    }


def test_genie_reply_is_shortened_to_two_plain_sentences():
    answer = GenieAnswer(
        conversation_id="c1",
        text="The **grasper** was used longest. The hook was next. Scissors were last.\n\n- a\n- b",
        columns=["label", "total_sec"],
        rows=[["grasper", 1141]],
    )
    llm = FakeLLM(ToolChoice("ask_data", {"question": "longest?"}))
    body = ask(make_client(llm=llm, genie=FakeGenie(answer)), "which was used longest?")
    assert body["reply"] == "The grasper was used longest. The hook was next."


def test_genie_table_without_words_reads_out_the_first_row():
    answer = GenieAnswer(
        conversation_id="c1", columns=["label", "total_sec"], rows=[["grasper", 1141.0]]
    )
    llm = FakeLLM(ToolChoice("ask_data", {"question": "longest?"}))
    body = ask(make_client(llm=llm, genie=FakeGenie(answer)), "which was used longest?")
    assert body["action"] == "answer"
    assert body["reply"] == "Top result: label grasper, total_sec 1141."


@pytest.mark.parametrize(
    ("texts", "with_table", "expected"),
    [
        (["Want the longest single interval instead?", "The grasper was longest."], True, "The"),
        (["Want the longest single interval instead?"], True, None),  # table speaks instead
        (["Which video do you mean?"], False, "Which"),  # nothing else to show
    ],
)
def test_genie_client_prefers_a_statement_over_a_follow_up_question(texts, with_table, expected):
    base = "/api/2.0/genie/spaces/s1"

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == f"{base}/start-conversation":
            return httpx.Response(200, json={"conversation_id": "c1", "message_id": "m1"})
        if path == f"{base}/conversations/c1/messages/m1":
            attachments = [
                {"attachment_id": f"t{i}", "text": {"content": t}} for i, t in enumerate(texts)
            ]
            if with_table:
                attachments.append({"attachment_id": "q1", "query": {"query": "SELECT 1"}})
            return httpx.Response(200, json={"status": "COMPLETED", "attachments": attachments})
        schema = {"columns": [{"name": "label", "type_name": "STRING"}]}
        body = {"manifest": {"schema": schema}, "result": {"data_array": [["grasper"]]}}
        return httpx.Response(200, json={"statement_response": body})

    genie = GenieClient(
        CREDS, "s1", timeout_sec=1, poll_sec=0, transport=httpx.MockTransport(handler)
    )
    text = genie.ask("x").text
    assert text is None if expected is None else text.startswith(expected)


def test_genie_failure_falls_back_to_rules():
    llm = FakeLLM(ToolChoice("ask_data", {"question": "x"}))
    genie = FakeGenie(error=GenieError("timeout"))
    body = ask(make_client(llm=llm, genie=genie), "how long was the clipper used?")
    assert body["router"] == "rules"
    assert body["action"] == "answer"
    assert "1:42" in body["reply"]


# --- logging, CORS, fixture file -------------------------------------------------------


def test_chat_logs_one_json_line_with_router_action_and_no_token():
    llm = FakeLLM(error=LLMError("HTTP 500"))
    client = make_client(llm=llm, DATABRICKS_TOKEN="secret-token-value")
    messages = []
    handler = logging.Handler()
    handler.emit = lambda record: messages.append(record.getMessage())
    logger = logging.getLogger("surgf.access")
    logger.addHandler(handler)
    try:
        response = client.post("/chat", json={"message": "quiz me"})
    finally:
        logger.removeHandler(handler)
    lines = [json.loads(m) for m in messages if '"/chat"' in m]
    assert len(lines) == 1
    entry = lines[0]
    assert entry["request_id"] == response.headers["X-Request-ID"]
    assert (entry["router"], entry["action"]) == ("rules", "quiz")
    assert entry["error"] == "llm: HTTP 500"
    assert "duration_ms" in entry
    assert "secret-token-value" not in "".join(messages)


def test_cors_preflight_allows_post():
    response = make_client().options(
        "/chat",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 200
    assert "POST" in response.headers["access-control-allow-methods"]


def test_examples_fixture_has_one_valid_example_per_action():
    examples = json.loads((FIXTURES_DIR / "chat.examples.json").read_text(encoding="utf-8"))
    assert {e["response"]["action"] for e in examples["examples"]} == {
        "search",
        "quiz",
        "timeline",
        "answer",
        "none",
    }
    for example in examples["examples"]:
        ChatResponse.model_validate(example["response"])
        assert example["request"]["message"]


# --- quizzes, video length and general questions through Genie ----------------------

QUIZ_COLUMNS = [
    "question_number", "question", "answer", "explanation", "source", "case_id", "start_sec",
    "end_sec",
]  # fmt: skip


def test_quiz_request_goes_to_genie_and_becomes_a_study_quiz():
    rows = [
        [1, "When is the clipper first used?", "11:14", "First clip.", "data", "VID01", 674.0,
         690.0],
        [2, "What does the clipper do?", "Places clips.", None, "general", None, None, None],
        [3, None, "skipped: no question", None, "general", None, None, None],
    ]  # fmt: skip
    genie = FakeGenie(GenieAnswer(conversation_id="c", columns=QUIZ_COLUMNS, rows=rows))
    llm = FakeLLM(ToolChoice("make_quiz"))
    body = ask(make_client(llm=llm, genie=genie), "quiz me on the instruments")
    assert (body["action"], body["router"]) == ("study_quiz", "genie")
    items = body["data"]["items"]
    assert [i["question_number"] for i in items] == [1, 2]
    assert items[0]["start_sec"] == 674.0 and items[1]["case_id"] is None
    assert genie.questions == ["For case_id 'VID01': quiz me on the instruments"]
    assert llm.calls == []  # Genie answered first


@pytest.mark.parametrize(
    "genie",
    [
        FakeGenie(error=GenieError("timeout")),
        FakeGenie(GenieAnswer(conversation_id="c", text="I can only answer timing questions.")),
    ],
)
def test_quiz_falls_back_to_the_bank_when_genie_gives_no_quiz(genie):
    body = ask(make_client(genie=genie), "flashcards on the tools")
    assert (body["action"], body["router"]) == ("quiz", "rules")


def test_video_length_is_answered_from_the_player_duration():
    client = make_client(genie=FakeGenie(error=GenieError("unused")))
    response = client.post(
        "/chat", json={"message": "how long is this video?", "video_duration_sec": 1743.2}
    )
    body = response.json()
    assert body["action"] == "none" and "29:03" in body["reply"]


def test_genie_question_carries_the_video_length():
    genie = FakeGenie(GenieAnswer(conversation_id="c", text="It ends at 29:03."))
    client = make_client(genie=genie)
    client.post(
        "/chat", json={"message": "what tools are typically used?", "video_duration_sec": 1743}
    )
    assert genie.questions == [
        "For case_id 'VID01' (video length 29:03): what tools are typically used?"
    ]


def test_educational_answer_keeps_four_sentences():
    text = "Generally, one. Two.\n\n- three is listed.\n- four is listed.\n\nFive."
    genie = FakeGenie(GenieAnswer(conversation_id="c", text=text))
    body = ask(make_client(genie=genie), "what tools are typically used in a cholecystectomy")
    assert (body["action"], body["router"], body["data"]) == ("answer", "genie", None)
    assert body["reply"] == "Generally, one. Two. \u2022 three is listed. \u2022 four is listed."


@pytest.mark.parametrize(
    "message",
    [
        "was the critical view of safety achieved?",
        "what dose of antibiotics should I give",
        "should I get my gallbladder removed?",
        "how well was this surgery performed?",
    ],
)
def test_advice_and_judging_are_deflected_without_genie(message):
    genie = FakeGenie(error=GenieError("must not be called"))
    body = ask(make_client(genie=genie), message)
    assert body == {"reply": STUDY_AID_REPLY, "action": "none", "data": None, "router": "rules"}
    assert genie.questions == []


@pytest.mark.parametrize(
    ("message", "to_genie"),
    [
        ("what is the Calot triangle", True),
        ("why is the critical view of safety important", True),
        ("when does the video end", True),
        ("what is the total time the hook was used", False),
        ("show me the clipper", False),
    ],
)
def test_genie_routing_words(message, to_genie):
    genie = FakeGenie(GenieAnswer(conversation_id="c", text="Generally, an answer."))
    ask(make_client(genie=genie), message)
    assert bool(genie.questions) is to_genie
