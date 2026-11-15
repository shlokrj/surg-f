from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.web import add_frontend


def test_built_frontend_pages_api_and_video_guard(tmp_path):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("shell")
    (dist / "evals.html").write_text("evals page")
    (dist / "assets" / "app.js").write_text("js")
    (tmp_path / "secret.txt").write_text("nope")
    app = FastAPI()
    app.get("/health")(lambda: {"status": "ok"})  # stands in for the API router
    add_frontend(app, dist, None)
    client = TestClient(app)
    assert client.get("/assets/app.js").text == "js"
    assert client.get("/evals").text == "evals page"
    assert client.get("/practice").text == "shell"  # client-side route -> SPA shell
    assert client.get("/../secret.txt").text == "shell"  # never escapes dist
    assert client.get("/health").json() == {"status": "ok"}  # API routes still win
    assert client.get("/videos/VID01.mp4").status_code == 404  # no Databricks credentials
