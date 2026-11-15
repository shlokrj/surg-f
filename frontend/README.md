# Surg+F frontend

Current team: Shlok owns model/evaluation, Aadhi owns data/export, Mihir owns player/browser verification. Work and push on `feat/spatial-overlays`; main publication requires Shlok's explicit final request. See [ordered tasks and owned paths](../ml/LOCALIZATION_PLAN.md#current-assignments-and-shared-workflow). This supersedes earlier single-owner notes below.

The dashboard lets users switch between the hosted VID01 and VID02 cases. It keeps the video and timeline on the left and the chat, recent questions, and search field on the right. Search output appears below both as one or more stacked sections. It is scoped to the open case, using the shared `GET /search?q=...` clip contract.

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

- `/timestamp clipper` calls `GET /search?q=clipper`, keeps only hits for the open case, and lets users seek to a result. Annotation and prediction sources are labeled separately.
- The event timeline calls `GET /cases/{case_id}/timeline` and shows annotation intervals in separate instrument rows.
- `/chart` shows instrument, verb, and target sections. `/chart instruments` shows only instrument counts, and prompts such as `/chart what was grasper doing` select a grasper-verb breakdown. The existing timeline `summary` supplies instrument counts, including a single instrument when named. Verb and target charts explicitly report unavailable data because the API exposes neither field. Natural-language selection uses local keyword rules, not an LLM. To enable those charts, the backend needs video-scoped event rows with `case_id`, `start_sec`, `end_sec`, `instrument`, `verb`, and `target`; the current six-label timeline cannot reconstruct those relationships.
- `/quiz` calls `GET /quiz` for five operation-wide study questions. If the backend is unreachable or has no quiz route, it displays the saved seed-1 quiz with a sample-data notice. It is **not specific to the open video**. Answers are graded locally, explanations appear after selection, and “Watch examples” searches the given `search_q` in the open case. Unreviewed content is labeled.
- `/model` explains that a linked 3D model is unavailable.

The four buttons insert commands into the chat input without sending. Commands can be combined. Simple keyword rules route some phrases locally; there is no LLM interpretation yet. In frontend fixture mode, saved VID01/VID02 timeline and seed-1 quiz responses from `backend/fixtures/` are imported. A locally opened MP4/MOV has no indexed annotations.

## Check

Run `npm run build`. With the Databricks backend and VID01 video available, enter `/timestamp clipper`; the first known interval is `674–690` seconds. Select it and confirm the video seeks to 11:14. `/chart` and `/quiz` require the six instrument-label queries to succeed. A cold warehouse may take time to respond.

With the backend returning real rows and `VID01.mp4` available, search `clipper`. Click the first result and confirm `VID01` seeks to `11:14` (674 s). Repeat with VID02: the first `clipper` annotation is `VID02 1255–1268` (20:55). Also check a result from a case without video (for example any `clipper` hit outside VID01/VID02), a `prediction` result, and a no-match query. Run `npm run build` for a production build.

## Experimental bounding boxes

Stage 3 is owned by Shlok on `feat/spatial-overlays`; stage 2 continues independently on `ml-dev`. Enable **Bounding boxes**, then choose a **Sampled frame**. Instrument/anatomy filters hide categories; the minimum-score slider hides lower-scoring detections (scores are not calibrated probabilities). Use **Fullscreen with overlays** to expand the video container; the native video fullscreen button may omit HTML overlays.

The included VID01 artifact contains real Grounding DINO predictions for frames 674, 680 and 689 only. Boxes expire after 120 ms, so ordinary playback mostly has no boxes. Some predictions are visibly incorrect (including scissors/irrigator in the clipper example); scores are not calibrated accuracy. This is a pipeline prototype, not reviewed annotations or continuous tracking. VID02 has no artifact, and local uploads are deliberately unsupported.

The player checks case, versioned asset ID, dimensions, timestamps, labels and coordinates before rendering. Keep the existing 854×480 25 fps VID01 asset; replacement videos need a new asset ID and timebase verification. See [runner setup and provenance](../ml/localization/README.md).

Checks: `node --test frontend/test/overlays.test.js` from the repository root and `npm --prefix frontend run build`. Browser verification is outstanding because the browser access host was unavailable. Manual acceptance: enable boxes, choose all three frames, filter categories, play/seek beyond 120 ms and confirm clearing, resize/fullscreen, then switch to VID02 and a local upload and confirm unavailable states.

Player DOM integration checks: `node --test frontend/test/*.test.js`. These simulate media state and do not replace real-browser playback/fullscreen verification.
