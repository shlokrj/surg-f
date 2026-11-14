import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import settings_from
from app.genie import GenieClient, GenieError
from app.interpret import InterpretService, parse
from app.main import build_genie, create_app

CREDS = settings_from(
    {"DATABRICKS_SERVER_HOSTNAME": "h", "DATABRICKS_HTTP_PATH": "p", "DATABRICKS_TOKEN": "t"}
).databricks
SPACE = "/api/2.0/genie/spaces/space1"


def fake_genie(columns=None, rows=None, text=None, status="COMPLETED", calls=None):
    """A GenieClient whose HTTP layer is replaced by canned Conversation API responses."""
    calls = calls if calls is not None else []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append((request.method, request.url.path, request.content.decode()))
        path = request.url.path
        if path == f"{SPACE}/start-conversation":
            return httpx.Response(200, json={"conversation_id": "c1", "message_id": "m1"})
        if path == f"{SPACE}/conversations/c1/messages/m1":
            attachments = []
            if text:
                attachments.append({"attachment_id": "a0", "text": {"content": text}})
            if columns:
                query = {"query": "SELECT 1", "description": "what the query does"}
                attachments.append({"attachment_id": "a1", "query": query})
            return httpx.Response(200, json={"status": status, "attachments": attachments})
        if path.endswith("/attachments/a1/query-result"):
            schema = {"columns": [{"name": n, "type_name": t} for n, t in columns]}
            body = {"manifest": {"schema": schema}, "result": {"data_array": rows}}
            return httpx.Response(200, json={"statement_response": body})
        return httpx.Response(404, json={})

    return GenieClient(
        CREDS, "space1", timeout_sec=1, poll_sec=0, transport=httpx.MockTransport(handler)
    )


CLIP_COLUMNS = [
    ("case_id", "STRING"),
    ("start_sec", "DOUBLE"),
    ("end_sec", "DOUBLE"),
    ("label", "STRING"),
    ("source", "STRING"),
]


@pytest.fixture
def client():
    with TestClient(create_app(settings=settings_from({}))) as test_client:
        yield test_client


# --- rules ------------------------------------------------------------------


@pytest.mark.parametrize(
    ("text", "intents", "labels", "confident"),
    [
        ("/quiz", ["quiz"], [], True),
        ("/chart", ["chart"], [], True),
        ("/model", ["model"], [], True),
        ("/timestamp clipper", ["timestamp"], ["clipper"], True),
        ("/quiz /chart", ["quiz", "chart"], [], True),
        ("/timestamp", ["timestamp"], [], True),
        ("when was the clipper used?", ["timestamp"], ["clipper"], True),
        ("Show me the Clip Applier", ["timestamp"], ["clipper"], True),
        ("where is the suction", ["timestamp"], ["irrigator"], True),
        ("find the hook and the scissors", ["timestamp"], ["hook", "scissors"], True),
        ("test me", ["quiz"], [], True),
        ("give me a chart of the tools", ["chart"], [], True),
        ("show the 3d anatomy", ["model"], [], True),
        ("show me clips of the hook", ["timestamp"], ["hook"], True),
        ("which instrument was used the longest?", ["timestamp"], [], False),
        ("when was the hook used after minute 10?", ["timestamp"], ["hook"], False),
        ("/timestamp when is the duct cut", ["timestamp"], [], False),
        ("hello there", ["timestamp"], [], False),
    ],
)
def test_rules_parse(text, intents, labels, confident):
    parsed = parse(text, "VID01")
    assert (parsed.intents, parsed.labels, parsed.confident) == (intents, labels, confident)


def test_rules_read_the_case_from_the_text():
    assert parse("when is the hook used in video 2", "VID01").case_id == "VID02"
    assert parse("hook in VID13", None).case_id == "VID13"
    assert parse("hook", "VID01").case_id == "VID01"


def test_interpret_returns_actions_with_requests(client):
    body = client.get("/interpret", params={"q": "/timestamp clipper /quiz", "case_id": "VID01"})
    assert body.status_code == 200
    data = body.json()
    assert data["interpreter"] == "rules" and data["genie"] is None
    assert [(a["type"], a["label"], a["case_id"], a["request"]) for a in data["actions"]] == [
        ("timestamp", "clipper", "VID01", "/search?q=clipper"),
        ("quiz", None, None, "/quiz"),
    ]
    assert data["message"] and data["suggestions"] == []


def test_interpret_chart_and_model_actions(client):
    data = client.get("/interpret", params={"q": "/chart /model", "case_id": "VID02"}).json()
    assert [(a["type"], a["request"]) for a in data["actions"]] == [
        ("chart", "/cases/VID02/timeline"),
        ("model", None),
    ]


def test_every_action_request_is_a_working_endpoint(client):
    data = client.get(
        "/interpret", params={"q": "/timestamp clipper /chart /quiz", "case_id": "VID01"}
    ).json()
    for action in data["actions"]:
        assert client.get(action["request"]).status_code == 200


def test_unclear_input_without_genie_asks_for_an_instrument(client):
    data = client.get("/interpret", params={"q": "hello there"}).json()
    assert data["actions"] == [] and data["interpreter"] == "rules"
    assert "instrument" in data["message"].lower()
    assert data["suggestions"]


@pytest.mark.parametrize(
    "params", [{}, {"q": ""}, {"q": "   "}, {"q": "x" * 301}, {"q": "hook", "case_id": "a b"}]
)
def test_interpret_invalid_input_returns_422(client, params):
    assert client.get("/interpret", params=params).status_code == 422


def test_genie_needs_both_credentials_and_a_space_id():
    assert build_genie(settings_from({"DATABRICKS_GENIE_SPACE_ID": "s"})) is None
    env = {"DATABRICKS_SERVER_HOSTNAME": "h", "DATABRICKS_HTTP_PATH": "p", "DATABRICKS_TOKEN": "t"}
    assert build_genie(settings_from(env)) is None
    assert build_genie(settings_from({**env, "DATABRICKS_GENIE_SPACE_ID": "s"})) is not None


# --- Genie ------------------------------------------------------------------


def test_confident_rules_never_call_genie():
    calls = []
    service = InterpretService(fake_genie(columns=CLIP_COLUMNS, rows=[], calls=calls))
    assert service.interpret("/timestamp clipper", "VID01").interpreter == "rules"
    assert service.interpret("test me", "VID01").interpreter == "rules"
    assert calls == []


def test_genie_clip_rows_become_a_timestamp_action():
    calls = []
    rows = [["VID01", "674.0", "690.0", "clipper", "annotation"]]
    service = InterpretService(
        fake_genie(columns=CLIP_COLUMNS, rows=rows, text="First at 11:14.", calls=calls)
    )
    response = service.interpret("when was the clipper first used?", "VID01")
    assert '"content":"For case_id \'VID01\': when was the clipper first used?"' in calls[0][2]
    assert response.interpreter == "genie" and response.message == "First at 11:14."
    (action,) = response.actions
    assert (action.type, action.label, action.case_id) == ("timestamp", "clipper", "VID01")
    assert action.results[0].start_sec == 674.0 and action.results[0].source == "annotation"
    assert response.genie.sql == "SELECT 1" and response.genie.rows[0][1] == 674.0


def test_genie_summary_rows_become_a_chart_action():
    columns = [("label", "STRING"), ("count", "LONG"), ("total_sec", "DOUBLE")]
    service = InterpretService(fake_genie(columns=columns, rows=[["hook", "9", "788.0"]]))
    response = service.interpret("which instrument was used the longest?", "VID01")
    (action,) = response.actions
    assert action.type == "chart" and action.request is None
    assert action.summary[0].model_dump() == {
        "label": "hook",
        "count": 9,
        "total_sec": 788.0,
        "first_sec": 0.0,
    }


def test_genie_text_only_reply_becomes_the_message():
    service = InterpretService(fake_genie(text="I can only answer questions about instruments."))
    response = service.interpret("hello there", "VID01")
    assert response.interpreter == "genie" and response.actions == []
    assert response.message == "I can only answer questions about instruments."


def test_genie_other_tables_are_passed_through_untouched():
    service = InterpretService(fake_genie(columns=[("n", "LONG")], rows=[["5"]]))
    response = service.interpret("how many clipper clips are there after minute 10?", "VID01")
    assert response.interpreter == "genie" and response.actions == []
    assert response.genie.columns == ["n"] and response.genie.rows == [[5]]


def test_genie_failure_falls_back_to_rules():
    service = InterpretService(fake_genie(status="FAILED"))
    response = service.interpret("when was the hook used after minute 10?", "VID01")
    assert response.interpreter == "rules" and response.genie.error == "status FAILED"
    assert [(a.type, a.label) for a in response.actions] == [("timestamp", "hook")]


def test_genie_client_times_out_and_reports_http_errors():
    with pytest.raises(GenieError, match="timeout"):
        fake_genie(status="EXECUTING_QUERY").ask("q")
    broken = GenieClient(
        CREDS, "space1", transport=httpx.MockTransport(lambda r: httpx.Response(403, json={}))
    )
    with pytest.raises(GenieError, match="HTTP 403"):
        broken.ask("q")


def test_interpret_endpoint_uses_an_injected_genie():
    rows = [["VID02", "481.0", "500.0", "hook", "annotation"]]
    app = create_app(
        settings=settings_from({}), genie=fake_genie(columns=CLIP_COLUMNS, rows=rows, text="ok")
    )
    with TestClient(app) as c:
        data = c.get("/interpret", params={"q": "first hook use in video 2?"}).json()
    assert data["interpreter"] == "genie"
    assert data["actions"][0]["results"][0]["case_id"] == "VID02"
    assert data["actions"][0]["case_id"] == "VID02"
