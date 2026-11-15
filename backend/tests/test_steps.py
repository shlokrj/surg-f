import json

import pytest
from fastapi.testclient import TestClient

from app.config import FIXTURES_DIR, settings_from
from app.main import create_app

STEPS_VID01 = json.loads((FIXTURES_DIR / "steps.VID01.json").read_text(encoding="utf-8"))
TIMELINE_VID01 = json.loads((FIXTURES_DIR / "timeline.VID01.json").read_text(encoding="utf-8"))


@pytest.fixture
def client():
    with TestClient(create_app(settings=settings_from({}))) as test_client:
        yield test_client


def test_steps_returns_the_saved_phases(client):
    response = client.get("/cases/VID01/steps")
    assert response.status_code == 200
    assert response.json() == STEPS_VID01


@pytest.mark.parametrize("case_id", ["VID01", "VID02"])
def test_steps_are_ordered_and_contiguous(client, case_id):
    steps = client.get(f"/cases/{case_id}/steps").json()["steps"]
    assert [s["order"] for s in steps] == list(range(1, len(steps) + 1))
    assert steps[0]["start_sec"] == 0
    for before, after in zip(steps, steps[1:], strict=False):
        assert before["end_sec"] == after["start_sec"]
        assert before["start_sec"] < before["end_sec"]


def test_clipper_clips_fall_inside_the_clipping_step():
    clipping = next(s for s in STEPS_VID01["steps"] if s["key"] == "ClippingCutting")
    clipper = [s for s in TIMELINE_VID01["segments"] if s["label"] == "clipper"]
    assert clipper and all(
        clipping["start_sec"] <= s["start_sec"] < clipping["end_sec"] for s in clipper
    )


def test_steps_unknown_case_returns_404(client):
    response = client.get("/cases/VID99/steps")
    assert response.status_code == 404
    assert response.json() == {"detail": "No steps for case_id: VID99"}


def test_steps_invalid_case_returns_422(client):
    assert client.get("/cases/VID%2001/steps").status_code == 422
