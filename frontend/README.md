# Surg+F frontend

The dashboard keeps the current video, timeline, and search field together. Search output appears below as one or more stacked sections. It is scoped to the open case, using the shared `GET /search?q=...` clip contract.

## Run

```sh
cd frontend
npm install
npm run dev
```

Run the backend as described in [backend/README.md](../backend/README.md). `VITE_BACKEND_URL` defaults to `http://localhost:8000`; `VITE_USE_FIXTURE=true` in `frontend/.env.local` reads `shared/search.fixture.json` instead. The video owner hosts prepared footage in the Databricks Volume. From the repo root with the team `.env`, run `python scripts/fetch_videos.py VID01` to download the Git-ignored demo video into `frontend/public/videos/`. You can also set `VITE_VIDEO_BASE_URL` to a host with `VID01.mp4` and `VID02.mp4`.

## Search features

- `/timestamp clipper` lists annotated clipper intervals for the current video. A click seeks to the interval start.
- `/chart` counts annotated intervals by instrument for the current video. It queries the six known instrument labels through the existing API.
- `/quiz` makes an instrument-identification study question from one real annotation in the current video. The answer links to its video moment.
- `/3d_model` explains that a linked model is unavailable. It does not fabricate an anatomy model or video mapping.

Combine commands, such as `/timestamp clipper /quiz`, to stack sections. Without commands, simple keyword rules route phrases such as “when was the clipper used” to timestamps and “how many” to a chart. This is local routing, not an LLM. The backend still exposes only exact label search. Local MP4/MOV playback has no indexed annotations, so these features are unavailable for a locally opened file.

## Check

Run `npm run build`. With the Databricks backend and VID01 video available, enter `/timestamp clipper`; the first known interval is `674–690` seconds. Select it and confirm the video seeks to 11:14. `/chart` and `/quiz` require the six instrument-label queries to succeed. A cold warehouse may take time to respond.
