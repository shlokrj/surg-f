# Surg+F frontend

The dashboard keeps the video and timeline on the left and the chat, recent questions, and search field on the right. Search output appears below both as one or more stacked sections. It is scoped to the open case, using the shared `GET /search?q=...` clip contract.

## Run

```sh
cd frontend
npm install
npm run dev
```

Run the backend as described in [backend/README.md](../backend/README.md). `VITE_BACKEND_URL` defaults to `http://localhost:8000`; `VITE_USE_FIXTURE=true` in `frontend/.env.local` reads `shared/search.fixture.json` instead. The video owner hosts prepared footage in the Databricks Volume. From the repo root with the team `.env`, run `python scripts/fetch_videos.py VID01` to download the Git-ignored demo video into `frontend/public/videos/`. You can also set `VITE_VIDEO_BASE_URL` to a host with `VID01.mp4` and `VID02.mp4`.

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

## Search features

- `/timestamp clipper` lists annotated clipper intervals for the current video. A click seeks to the interval start.
- `/chart` counts annotated intervals by instrument for the current video. It queries the six known instrument labels through the existing API.
- `/quiz` makes an instrument-identification study question from one real annotation in the current video. The answer links to its video moment.
- `/model` explains that a linked model is unavailable. It does not fabricate an anatomy model or video mapping.

The four buttons add their command to the search input without submitting it. Combine commands, such as `/timestamp clipper /quiz`, to stack sections. Without commands, simple keyword rules route phrases such as “when was the clipper used” to timestamps and “how many” to a chart. This is local routing, not an LLM. The backend still exposes only exact label search. Local MP4/MOV playback has no indexed annotations, so these features are unavailable for a locally opened file.

## Check

Run `npm run build`. With the Databricks backend and VID01 video available, enter `/timestamp clipper`; the first known interval is `674–690` seconds. Select it and confirm the video seeks to 11:14. `/chart` and `/quiz` require the six instrument-label queries to succeed. A cold warehouse may take time to respond.

With the backend returning real rows and `VID01.mp4` available, search `clipper`. Click the first result and confirm `VID01` seeks to `11:14` (674 s). Repeat with VID02: the first `clipper` annotation is `VID02 1255–1268` (20:55). Also check a result from a case without video (for example any `clipper` hit outside VID01/VID02), a `prediction` result, and a no-match query. Run `npm run build` for a production build.
