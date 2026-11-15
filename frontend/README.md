# Surg+F frontend

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

## Content filter

The home preview and dashboard player start with a modest 10 px blur over the surgical footage for demos. The dashboard overlay covers the full video image. A separate control bar sits above it, keeping play/pause, seek and time, volume, speed, and fullscreen clear and usable. The fullscreen control toggles back to the normal player size and updates its label when fullscreen is exited with Escape. The **Content filter: On/Off** button is beside “Available demo case” on the home page and above the dashboard video. Turning it off reveals the footage; selecting a new video turns it back on. The filter is a visual overlay and does not change video data or analysis.

## Search features

- `/timestamp clipper` calls `GET /search?q=clipper`, keeps only hits for the open case, and lets users seek to a result. Annotation and prediction sources are labeled separately.
- The event timeline calls `GET /cases/{case_id}/timeline` and shows annotation intervals in separate instrument rows.
- `/chart` shows instrument, verb, and target charts. `/chart instruments` shows only instruments; “what was grasper doing?” selects grasper verbs. Instrument counts come from the timeline `summary`, restricted to the six supported instrument labels so verbs and anatomy labels in a mixed response do not appear as tools. Verb and target interval counts come from Data/ML's verified `shared/triplets.annotation.csv` for VID01/VID02 (269 instrument–verb–target intervals, copied from `ml-dev` commit `c0ae595`). `null_verb` and `null_target` mean the tool is visible without an annotated action and display as idle. Intervals can overlap, so counts are not a partition of video time. Prompt routing is local keyword logic; `/interpret` from the backend can supply the high-level action, but no Surg+F Genie space is verified. Rohan's proposed video-scoped action endpoint is still pending; the CSV keeps these two demo cases working meanwhile.
- `/quiz` calls `GET /quiz` for five operation-wide study questions. If the backend is unreachable or has no quiz route, it displays the saved seed-1 quiz with a sample-data notice. It is **not specific to the open video**. Answers are graded locally, explanations appear after selection, and “Watch examples” searches the given `search_q` in the open case. Unreviewed content is labeled.
- `/model` explains that a linked 3D model is unavailable.

The four buttons are multi-select controls: clicking an unselected button inserts its command into the chat input without sending, while clicking it again leaves the text unchanged. Their highlights follow the commands currently in the input, including manual typing and deletion. Commands can be combined. Simple keyword rules route some phrases locally; there is no LLM interpretation yet. In frontend fixture mode, saved VID01/VID02 timeline and seed-1 quiz responses from `backend/fixtures/` are imported. A locally opened MP4/MOV has no indexed annotations.

## Check

Run `npm run build`. With the Databricks backend and VID01 video available, enter `/timestamp clipper`; the first known interval is `674–690` seconds. Select it and confirm the video seeks to 11:14. `/chart` and `/quiz` require the six instrument-label queries to succeed. A cold warehouse may take time to respond.

On the home page, **View clipper event at 11:14** opens VID01 at 674 seconds. The requested seek stays pending while the dashboard reloads for timeline and search results, and the player clears it only after the `seeked` event. Check that the time control reads 11:14 after the clip loads.

With the backend returning real rows and `VID01.mp4` available, search `clipper`. Click the first result and confirm `VID01` seeks to `11:14` (674 s). Repeat with VID02: the first `clipper` annotation is `VID02 1255–1268` (20:55). Also check a result from a case without video (for example any `clipper` hit outside VID01/VID02), a `prediction` result, and a no-match query. Run `npm run build` for a production build.

## Experimental bounding boxes

Stage 3 is owned by Shlok on `feat/spatial-overlays`; stage 2 continues independently on `ml-dev`. Enable **Bounding boxes**, then choose a **Sampled frame**. Instrument/anatomy filters hide categories; the minimum-score slider hides lower-scoring detections (scores are not calibrated probabilities). Use **Fullscreen with overlays** to expand the video container; the native video fullscreen button may omit HTML overlays.

The included VID01 artifact contains real Grounding DINO predictions for frames 674, 680 and 689 only. Boxes expire after 120 ms, so ordinary playback mostly has no boxes. Some predictions are visibly incorrect (including scissors/irrigator in the clipper example); scores are not calibrated accuracy. This is a pipeline prototype, not reviewed annotations or continuous tracking. VID02 has no artifact, and local uploads are deliberately unsupported.

The player checks case, versioned asset ID, dimensions, timestamps, labels and coordinates before rendering. Keep the existing 854×480 25 fps VID01 asset; replacement videos need a new asset ID and timebase verification. See [runner setup and provenance](../ml/localization/README.md).

Checks: `node --test frontend/test/*.test.js` from the repository root and `npm --prefix frontend run build`. During the `frontend/dev` merge, local Chrome confirmed that the home clipper link seeks to 11:14 and the custom controls, content filter, and overlay toggle appear together. The current VID01 MP4 reports `videoWidth=854` and `videoHeight=484` in Chrome, while `public/overlays/VID01.json` declares `854×480`; the overlay's dimension guard correctly hides all boxes. Shlok needs to verify the source-to-video pixel mapping and update the artifact or video binding before browser box acceptance. Then enable boxes, choose all three frames, filter categories, play/seek beyond 120 ms and confirm clearing, resize/fullscreen, and switch to VID02 and a local upload to confirm unavailable states.

Player DOM integration checks: `node --test frontend/test/*.test.js`. These simulate media state and do not replace real-browser playback/fullscreen verification.
