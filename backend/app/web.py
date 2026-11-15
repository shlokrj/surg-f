"""Serve the built frontend (frontend/dist) and its case videos from the same app.

Used by the Databricks App so one URL serves the site and the API. Enabled only when
frontend/dist exists, so local development (Vite on :5173) is unchanged. Videos are not in
Git: /videos/<case>.mp4 is streamed from the Unity Catalog Volume with Range passthrough so
the player can seek.
"""

import re
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse
from starlette.background import BackgroundTask

from .config import DatabricksCredentials

VIDEO_NAME = re.compile(r"^VID\d{2,3}\.mp4$")
VOLUME_VIDEOS = "/Volumes/workspace/default/surgf/videos"
PASSTHROUGH = ("content-type", "content-length", "content-range", "accept-ranges", "etag")


def add_frontend(app: FastAPI, dist: Path, databricks: DatabricksCredentials | None) -> None:
    dist = dist.resolve()
    client = (
        httpx.AsyncClient(
            base_url=f"https://{databricks.server_hostname}",
            headers={"Authorization": f"Bearer {databricks.access_token}"},
            timeout=httpx.Timeout(30, read=120),
        )
        if databricks
        else None
    )

    @app.get("/videos/{name}", include_in_schema=False)
    async def video(name: str, request: Request):
        if client is None or not VIDEO_NAME.match(name):
            raise HTTPException(404, "Video not found")
        headers = {"Range": request.headers["range"]} if "range" in request.headers else {}
        url = f"/api/2.0/fs/files{VOLUME_VIDEOS}/{name}"
        upstream = await client.send(client.build_request("GET", url, headers=headers), stream=True)
        if upstream.status_code not in (200, 206):
            await upstream.aclose()
            raise HTTPException(404 if upstream.status_code == 404 else 502, "Video unavailable")
        return StreamingResponse(
            upstream.aiter_raw(),
            status_code=upstream.status_code,
            headers={k: v for k, v in upstream.headers.items() if k.lower() in PASSTHROUGH}
            | {"content-type": "video/mp4"},  # the Volume says octet-stream; Safari needs this
            background=BackgroundTask(upstream.aclose),
        )

    @app.get("/{path:path}", include_in_schema=False)
    async def page(path: str):
        # Registered last, so API routes win. Real files first, then page.html, then the SPA shell.
        for candidate in (dist / path, dist / f"{path}.html"):
            candidate = candidate.resolve()
            if candidate.is_file() and candidate.is_relative_to(dist):
                return FileResponse(candidate)
        return FileResponse(dist / "index.html")
