import json
import logging
from collections import namedtuple

import pytest
from fastapi.testclient import TestClient

from app.config import FIXTURES_DIR, QUIZ_BANK_FILE, settings_from
from app.main import create_app, warm_up
from app.quiz import QuizBank
from app.repository import CASE_SQL, DatabricksClipRepository, RepositoryError

TIMELINE_VID01 = json.loads((FIXTURES_DIR / "timeline.VID01.json").read_text(encoding="utf-8"))
QUIZ_SEED_1 = json.loads((FIXTURES_DIR / "quiz.seed-1.json").read_text(encoding="utf-8"))
BANK = json.loads(QUIZ_BANK_FILE.read_text(encoding="utf-8"))
DATASET_INSTRUMENTS = {"grasper", "hook", "irrigator", "bipolar", "clipper", "scissors"}


@pytest.fixture
def client():
    with TestClient(create_app(settings=settings_from({}))) as test_client:
        yield test_client


class FailingRepository:
    """Raises on every call; proves an endpoint does not touch the data store."""

    mode = "databricks"

    def find_by_label(self, label):
        raise RepositoryError("ServerOperationError")

    def find_by_case(self, case_id):
        raise RepositoryError("ServerOperationError")

    def warm_up(self):
        raise RepositoryError("ServerOperationError")


# --- timeline ---------------------------------------------------------------


def test_timeline_fixture_mode_returns_vid01(client):
    response = client.get("/cases/VID01/timeline")
    assert response.status_code == 200
    assert response.json() == TIMELINE_VID01


def test_timeline_summary_agrees_with_segments_and_search(client):
    body = client.get("/cases/VID01/timeline").json()
    clipper = [s for s in body["segments"] if s["label"] == "clipper"]
    assert [(s["start_sec"], s["end_sec"]) for s in clipper[:3]] == [
        (674, 690),
        (698, 747),
        (749, 753),
    ]
    for item in body["summary"]:
        segs = [s for s in body["segments"] if s["label"] == item["label"]]
        assert item["count"] == len(segs)
        assert item["total_sec"] == sum(s["end_sec"] - s["start_sec"] for s in segs)
        assert item["first_sec"] == min(s["start_sec"] for s in segs)
    starts = [(s["start_sec"], s["label"]) for s in body["segments"]]
    assert starts == sorted(starts)


def test_timeline_known_case_other_source_is_empty(client):
    response = client.get("/cases/VID01/timeline", params={"source": "prediction"})
    assert response.status_code == 200
    assert response.json() == {
        "case_id": "VID01",
        "source": "prediction",
        "segments": [],
        "summary": [],
    }


def test_timeline_unknown_case_returns_404(client):
    response = client.get("/cases/VID99/timeline")
    assert response.status_code == 404
    assert response.json() == {"detail": "Unknown case_id: VID99"}


@pytest.mark.parametrize(
    "url",
    [
        "/cases/VID%2001/timeline",
        "/cases/" + "x" * 33 + "/timeline",
        "/cases/VID01/timeline?source=fixture",
    ],
)
def test_timeline_invalid_input_returns_422(client, url):
    assert client.get(url).status_code == 422


def test_timeline_repository_failure_returns_503():
    app = create_app(settings=settings_from({"SURGF_WARMUP": "0"}), repository=FailingRepository())
    with TestClient(app) as c:
        response = c.get("/cases/VID01/timeline")
    assert response.status_code == 503
    assert response.json() == {"detail": "Clip search is unavailable"}


def test_databricks_timeline_binds_case_and_filters_source(monkeypatch):
    Row = namedtuple("Row", "case_id start_sec end_sec label source")
    calls = []

    class FakeCursor:
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def execute(self, sql, params):
            calls.append((sql, params))

        def fetchall(self):
            return [
                Row("VID02", 10.0, 20.0, "hook", "annotation"),
                Row("VID02", 12.0, 13.0, "hook", "prediction"),
            ]

    class FakeConnection(FakeCursor):
        def cursor(self):
            return FakeCursor()

    import databricks.sql

    monkeypatch.setattr(databricks.sql, "connect", lambda **kwargs: FakeConnection())
    creds = settings_from(
        {"DATABRICKS_SERVER_HOSTNAME": "h", "DATABRICKS_HTTP_PATH": "p", "DATABRICKS_TOKEN": "t"}
    ).databricks
    app = create_app(
        settings=settings_from({"SURGF_WARMUP": "0"}), repository=DatabricksClipRepository(creds)
    )
    with TestClient(app) as c:
        body = c.get("/cases/VID02/timeline").json()
    assert calls == [(CASE_SQL, {"case_id": "VID02"})]
    assert "'fixture'" not in CASE_SQL
    assert body["segments"] == [{"label": "hook", "start_sec": 10.0, "end_sec": 20.0}]
    assert body["summary"] == [{"label": "hook", "count": 1, "total_sec": 10.0, "first_sec": 10.0}]


# --- quiz -------------------------------------------------------------------


def assert_valid_quiz(body):
    questions = body["questions"]
    assert len(questions) == 5
    assert [q["type"] for q in questions] == ["next_step"] * 3 + ["which_tool"] * 2
    assert len({q["id"] for q in questions}) == 5
    assert len({q["prompt"] for q in questions}) == 5
    for q in questions:
        option_ids = [o["id"] for o in q["options"]]
        assert option_ids == ["a", "b", "c", "d"]
        assert len({o["text"] for o in q["options"]}) == 4
        assert q["correct_option_id"] in option_ids
        assert q["search_q"] is None or q["search_q"] in DATASET_INSTRUMENTS


@pytest.mark.parametrize("seed", range(50))
def test_quiz_is_always_valid(client, seed):
    response = client.get("/quiz", params={"seed": seed})
    assert response.status_code == 200
    assert_valid_quiz(response.json())


def test_quiz_has_no_two_questions_on_the_same_topic(client):
    groups = {q["id"]: q["group"] for q in BANK["next_step"] + BANK["which_tool"]}
    for seed in range(50):
        body = client.get("/quiz", params={"seed": seed}).json()
        for kind in ("next_step", "which_tool"):
            ids = [q["id"] for q in body["questions"] if q["type"] == kind]
            assert len({groups[i] for i in ids}) == len(ids)


def test_quiz_correct_option_matches_bank_answer(client):
    bank = QuizBank.load(QUIZ_BANK_FILE)
    items = {q["id"]: q for q in bank.next_step + bank.which_tool}
    for seed in range(20):
        for q in client.get("/quiz", params={"seed": seed}).json()["questions"]:
            names = bank.steps if q["type"] == "next_step" else bank.tools
            correct = next(o for o in q["options"] if o["id"] == q["correct_option_id"])
            assert correct["text"] == names[items[q["id"]]["answer"]]


def test_quiz_same_seed_same_output_and_different_seeds_differ(client):
    first = client.get("/quiz", params={"seed": 7}).json()
    assert client.get("/quiz", params={"seed": 7}).json() == first
    assert client.get("/quiz", params={"seed": 8}).json()["questions"] != first["questions"]
    question_sets = {
        tuple(q["id"] for q in client.get("/quiz", params={"seed": s}).json()["questions"])
        for s in range(30)
    }
    assert len(question_sets) > 10


def test_quiz_without_seed_is_valid_and_reproducible(client):
    body = client.get("/quiz").json()
    assert_valid_quiz(body)
    assert client.get("/quiz", params={"seed": body["seed"]}).json() == body


def test_quiz_matches_fixture_and_is_unreviewed(client):
    body = client.get("/quiz", params={"seed": 1}).json()
    assert body == QUIZ_SEED_1
    assert body["reviewed"] is False


@pytest.mark.parametrize("seed", ["-1", "2147483648", "abc"])
def test_quiz_invalid_seed_returns_422(client, seed):
    assert client.get("/quiz", params={"seed": seed}).status_code == 422


def test_quiz_does_not_touch_the_data_store():
    app = create_app(settings=settings_from({"SURGF_WARMUP": "0"}), repository=FailingRepository())
    with TestClient(app) as c:
        response = c.get("/quiz", params={"seed": 1})
    assert response.status_code == 200
    assert response.json() == QUIZ_SEED_1


def test_bank_meets_size_and_label_rules():
    bank = QuizBank.load(QUIZ_BANK_FILE)
    assert bank.reviewed is False
    assert len(bank.next_step) >= 8 and len(bank.which_tool) >= 6
    assert {q["answer"] for q in bank.which_tool} <= DATASET_INSTRUMENTS


def test_bank_rejects_a_duplicate_option():
    data = json.loads(QUIZ_BANK_FILE.read_text(encoding="utf-8"))
    data["next_step"][0]["distractors"][0] = data["next_step"][0]["answer"]
    with pytest.raises(ValueError):
        QuizBank(data)


# --- warm-up and docs -------------------------------------------------------


def test_warm_up_failure_is_logged_not_raised(caplog):
    logger = logging.getLogger("surgf.access")
    logger.addHandler(caplog.handler)
    try:
        warm_up(FailingRepository())
    finally:
        logger.removeHandler(caplog.handler)
    entry = json.loads(caplog.records[-1].getMessage())
    assert entry["event"] == "warmup" and entry["status"] == "error"


def test_openapi_documents_every_endpoint(client):
    paths = client.get("/openapi.json").json()["paths"]
    for path, code in (("/search", "503"), ("/cases/{case_id}/timeline", "404"), ("/quiz", "422")):
        operation = paths[path]["get"]
        assert operation["summary"] and operation["description"]
        assert code in operation["responses"]
