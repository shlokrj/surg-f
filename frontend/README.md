# Surg+F frontend

Two-page video chooser and search/playback dashboard based on Mihir's Claude Design prototype. Search calls the shared `GET /search?q=...` API. Selecting a result switches to its `case_id` video and seeks to `start_sec`.

## Run

```sh
cd frontend
npm install
npm run dev
```

Set `VITE_BACKEND_URL` to the API origin (default `http://localhost:8000`). For local development without the backend, set `VITE_USE_FIXTURE=true` in `frontend/.env.local`; this reads `shared/search.fixture.json`. Switch to the real API by changing that environment variable.

Put playable assets at `frontend/public/videos/VID01.mp4`, etc., or set `VITE_VIDEO_BASE_URL` to a URL containing the same filenames. The case manifest maps `VID01` and `VID02`.

## Videos and data (from Data/ML, 2026-11-14)

**Get the videos.** VID01 and VID02 are hosted as 25 fps 854x480 H.264 MP4s with faststart in the Databricks Volume `/Volumes/workspace/default/surgf/videos/`. From the repo root, with the team `.env` (get it privately from Aadhitya), run:

```sh
pip install databricks-sdk python-dotenv
python scripts/fetch_videos.py VID01 VID02
```

This writes `frontend/public/videos/VID01.mp4` (692,593,324 bytes, 28:53) and `VID02.mp4` (1,140,221,247 bytes, 47:19). Both are git-ignored. Each download's md5 was checked against the source.

**Timebase.** `start_sec` is the video time. Checking dataset frames against the video gave a constant offset of -0.04 s for VID01 and +0.08 s for VID02, with no drift. Seek to `start_sec` directly; no correction is needed.

**Only VID01 and VID02 have videos.** The live table `workspace.default.surgf_clips` holds annotation rows for **50 cases**, so most search hits are in cases with no video. For `clipper`, 11 of 154 annotation results are in VID01 or VID02. `videoForCase()` returns `null` for the rest, so the UI must handle that state, for example by showing "video not available" or by dropping or greying out unplayable results. The 25 fps source covers VID01–VID80 only, so ask Data/ML before relying on more cases.

**Prediction results.** `/search` returns both `source=annotation` and `source=prediction` rows, and has no source filter parameter. Today predictions exist for **VID02 only** (945 rows) from an early baseline model. They are mostly 1-second fragments, so expect many short, noisy `prediction` hits (for example 83 for `clipper`). Keep showing the source on each card and label predictions as model output. Consider grouping or de-emphasizing them. Data/ML will replace these rows after temporal smoothing and the larger model; the fields will not change. Video files are excluded from Git. A local upload plays in the browser but does not ingest or annotate the video.

The chat-shaped panel currently performs annotated label search. General Q&A, counts, persistent chat history, arbitrary upload processing, and bleeding detection need backend support and are not claimed by this build.

## Integration check

With the backend returning real rows and `VID01.mp4` available, search `clipper`. Click the first result and confirm `VID01` seeks to `11:14` (674 s). Repeat with VID02: the first `clipper` annotation is `VID02 1255–1268` (20:55). Also check a result from a case without video (for example any `clipper` hit outside VID01/VID02), a `prediction` result, and a no-match query. Run `npm run build` for a production build.
