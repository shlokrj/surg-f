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
    body = ask(make_client(llm=FakeLLM(None)), "what dose of antibiotics should I give")
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
    assert names == ["search_clips", "make_quiz", "show_timeline"]  # no ask_data, no show_3d

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


# --- Genie (optional tool) ---------------------------------------------------------


def test_ask_data_tool_is_offered_only_when_genie_is_configured():
    assert "ask_data" not in [t["function"]["name"] for t in tool_specs(False)]
    assert "ask_data" in [t["function"]["name"] for t in tool_specs(True)]
    llm = FakeLLM(ToolChoice("make_quiz"))
    ask(make_client(llm=llm, genie=FakeGenie()), "quiz")
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
    assert body["action"] == "search"


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
