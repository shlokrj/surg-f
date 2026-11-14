# Surg+F frontend

Two-page video chooser and search/playback dashboard. The home page previews the real VID01 demo case and its verified clipper annotation. Search calls the shared `GET /search?q=...` API. Selecting a result switches to its `case_id` video and seeks to `start_sec`. The timeline displays matches for the currently loaded case; the result list covers all returned cases.

## Run

```sh
cd frontend
npm install
npm run dev
```

Run the backend from `backend/` as described in [backend/README.md](../backend/README.md). `VITE_BACKEND_URL` defaults to `http://localhost:8000`. For local UI work without Databricks, set `VITE_USE_FIXTURE=true` in `frontend/.env.local`; this reads `shared/search.fixture.json`. Remove that setting to use the real backend. The fixture only matches `clip applier`; real annotation labels include `clipper`, `hook`, and `grasper`.

The video owner hosts the prepared case in the Databricks Volume. From the repo root, with the team `.env` present, download it locally with:

```sh
pip install databricks-sdk python-dotenv
python scripts/fetch_videos.py VID01
```

The script places `VID01.mp4` in `frontend/public/videos/`, which is Git ignored. Alternatively, set `VITE_VIDEO_BASE_URL` to a host with `VID01.mp4` and `VID02.mp4`. The case manifest currently maps those two IDs. A local MP4/MOV can be opened for playback, but it is not uploaded or indexed; the app disables event search for it.

The right panel is an exact instrument-label search, not a general question-answering model. Recent searches are session-only. General Q&A, counts, arbitrary upload processing, and bleeding detection require separate backend support.

## Integration check

With the Databricks backend and VID01 video available, search `clipper`. The backend should return first result `VID01` at `674–690` seconds. Click it and confirm that VID01 seeks to `11:14` with the clip applier visible. Search a label with no matches and check the empty state. Run `npm run build` for a production build.
