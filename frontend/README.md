# Surg+F frontend

## Frontend v2 design branch

Shlok's homepage revamp lives on `feat/shlok-frontend-v2`. Read [design criteria](docs/DESIGN.md) and [anti-slop criteria](docs/ANTI_SLOP.md) before changing presentation or copy. Homepage markup/scroll lifecycle are isolated in `src/home.js` and `src/home.css`; Inclusive Sans is self-hosted. Native scrolling and reduced-motion support preserve immediate access to the case. This round is committed locally only at Shlok's request.


Current ownership: **Shlok — general frontend design; Mihir — all spatial work (data, models, evaluation, export, player behavior, browser checks).** Spatial work is developed on `feat/spatial-overlays` and published to `main` with Shlok's approval (latest: v3 overlay, 2026-11-15). Shlok and Mihir coordinate shared frontend markup/styles. See [tasks and handoffs](../ml/LOCALIZATION_PLAN.md#current-assignments-and-shared-workflow). Earlier owner notes below are historical.

The dashboard lets users switch between hosted VID01 and VID02. The video, operation steps, and requested outputs are on the left; Lil Doc and the chat input are on the right. Earlier user questions remain clickable in the conversation and rerun their query. Search results are scoped to the open case using the shared `GET /search?q=...` clip contract.

## Run

```sh
cd frontend
npm install
npm run dev
```

Run the backend as described in [backend/README.md](../backend/README.md). `VITE_BACKEND_URL` defaults to `http://localhost:8000`; `VITE_USE_FIXTURE=true` in `frontend/.env.local` reads `shared/search.fixture.json` instead. The video owner hosts prepared footage in the Databricks Volume. From the repo root with the team `.env`, run `python scripts/fetch_videos.py VID01` to download the Git-ignored demo video into `frontend/public/videos/`. You can also set `VITE_VIDEO_BASE_URL` to a host with `VID01.mp4` and `VID02.mp4`.

**Two homepage versions.** `http://localhost:5173/` is the public site. Add `/demo` (`http://localhost:5173/demo`) for the presentation version: problem, solution, features, the stack, model notes, Built on Databricks and What's next. `?demo` on any URL does the same, which also works on a host that does not serve `index.html` for unknown paths. While presenting, the Left and Right arrow keys step to the previous or next chapter.

Put playable assets at `frontend/public/videos/VID01.mp4`, etc., or set `VITE_VIDEO_BASE_URL` to a URL containing the same filenames. The case manifest maps `VID01` and `VID02`.

## Videos and data (from Data/ML, 2026-11-14)

**Get the videos.** VID01 and VID02 are hosted as 25 fps H.264 MP4s with faststart in the Databricks Volume `/Volumes/workspace/default/surgf/videos/`. From the repo root, with the team `.env` (get it privately from Aadhitya), run:

```sh
pip install databricks-sdk python-dotenv
python scripts/fetch_videos.py VID01 VID02
```

This writes `frontend/public/videos/VID01.mp4` (692,593,324 bytes, 28:53) and `VID02.mp4` (1,140,221,247 bytes, 47:19). Both are git-ignored. Each download's md5 was checked against the source.

**Timebase.** `start_sec` is the video time. Checking dataset frames against the video gave a constant offset of -0.04 s for VID01 and +0.08 s for VID02, with no drift. Seek to `start_sec` directly; no correction is needed.

**Only VID01 and VID02 have videos.** The live table `workspace.default.surgf_clips` holds annotation rows for **50 cases**, so most search hits are in cases with no video. For `clipper`, 11 of 154 annotation results are in VID01 or VID02. `videoForCase()` returns `null` for the rest, so the UI must handle that state, for example by showing "video not available" or by dropping or greying out unplayable results. The 25 fps source covers VID01–VID80 only, so ask Data/ML before relying on more cases.

**Prediction results.** `/search` returns both `source=annotation` and `source=prediction` rows, and has no source filter parameter. Today predictions exist for **VID02 only** (945 rows) from an early baseline model. They are mostly 1-second fragments, so expect many short, noisy `prediction` hits (for example 83 for `clipper`). Keep showing the source on each card and label predictions as model output. Consider grouping or de-emphasizing them. Data/ML will replace these rows after temporal smoothing and the larger model; the fields will not change. Video files are excluded from Git. A local upload plays in the browser but does not ingest or annotate the video.

## Content filter

The home preview and dashboard player start with a modest 10 px blur over the surgical footage for demos. The dashboard overlay covers the full video image. A separate control bar sits above it, keeping play/pause, seek and time, volume, speed, and fullscreen clear and usable. The fullscreen control toggles back to the normal player size and updates its label when fullscreen is exited with Escape. The content filter is an eye button in the top-right corner of the home preview and the case player. It shows a slashed eye while the footage is blurred and an open eye while it is visible, and it has `aria-pressed` plus the label “Blur footage”. Turning it off reveals the footage; selecting a new video turns it back on. The filter is a visual overlay and does not change video data or analysis.

## Search features

- `/timestamp clipper` calls `GET /search?q=clipper`, keeps only hits for the open case, and lets users seek to a result. Annotation and prediction sources are labeled separately.
- The timeline calls `GET /cases/{case_id}/steps` for operation steps. Timestamp searches add matching instrument moments to that timeline. The instrument chart calls `GET /cases/{case_id}/timeline` for counts.
- `/chart` shows instrument, verb, and target charts. `/chart instruments` shows only instruments; “what was grasper doing?” selects grasper verbs. Instrument counts come from the timeline `summary`, restricted to the six supported instrument labels so verbs and anatomy labels in a mixed response do not appear as tools. Verb and target interval counts come from Data/ML's verified `shared/triplets.annotation.csv` for VID01/VID02 (269 instrument–verb–target intervals, copied from `ml-dev` commit `c0ae595`). `null_verb` and `null_target` mean the tool is visible without an annotated action and display as idle. Intervals can overlap, so counts are not a partition of video time. Prompt routing is local keyword logic; `/interpret` from the backend can supply the high-level action, but no Surg+F Genie space is verified. Rohan's proposed video-scoped action endpoint is still pending; the CSV keeps these two demo cases working meanwhile.
- `/quiz` calls `GET /quiz` for five operation-wide study questions. If the backend is unreachable or has no quiz route, it displays the saved seed-1 quiz with a sample-data notice. It is **not specific to the open video**. Answers are graded locally, explanations appear after selection, and “Watch examples” searches the given `search_q` in the open case. Unreviewed content is labeled.
- `/model` explains that a linked 3D model is unavailable.

The four buttons are multi-select controls: clicking an unselected button inserts its command into the chat input without sending, while clicking it again leaves the text unchanged. Their highlights follow the commands currently in the input, including manual typing and deletion. Commands can be combined. Simple keyword rules route some phrases locally; there is no LLM interpretation yet. In frontend fixture mode, saved VID01/VID02 timeline and seed-1 quiz responses from `backend/fixtures/` are imported. A locally opened MP4/MOV has no indexed annotations.

## 3D model (`/model`)

Every case-page panel (Timeline, 3D model, Quiz, Charts) has a minimize button at the right of its header. Minimized panels stay minimized across redraws; a new chat result for a panel opens it again. Minimizing only hides the panel body, so the 3D viewer keeps its state (Aadhitya, 2026-11-14, checked in headless Chrome).

`/model`, or a chat message such as "show the clipping step in 3D", opens a 3D view of the gallbladder and the organs around it below the video. Drag rotates, scrolling over the model zooms, and selecting an organ (on the model or in the "See through" list) fades it; selecting it again brings it back, and **Reset view** restores the camera and every faded organ (Aadhitya, 2026-11-14: checked in headless Chrome by clicking the liver twice, fading the gallbladder from the list, then Reset view). A faded organ in front catches the click, so use the list to reach organs behind it. The view follows the video: when playback enters a new step, the model changes to that step's picture. The arrows in the Timeline panel and in the model panel move the video, and so the model, one step back or forward.

- **It is an illustration.** The anatomy is a generic adult body from BodyParts3D, not the patient in the video. The cystic artery, ports, clips, cut, triangle, attachment marker and retrieval bag are schematic drawings. The step pictures are **not yet medically reviewed**; the panel says so until `REVIEWED` in `src/model/steps.js` is set to `true`.
- **Files:** `src/model/steps.js` (what each step shows, plain data), `src/model/viewer.js` (three.js; loaded only when the panel opens), `src/model/panel.js` (markup and the link to the video time), `src/model/model.css`, `src/model/manifest.json` and `public/models/gallbladder-region.glb` (both generated), and `public/models/ATTRIBUTION.md`.
- **Class names** in the panel start with `anat-`, because `home.css` already uses `.model-*` for the homepage's model notes.
- **Rebuild the model file** (only needed to change which structures are included): download and unzip `isa_BP3D_4.0_obj_99.zip` from https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html outside the repository, then run `node scripts/build-anatomy-model.mjs <folder with the FJ####.obj files>` from `frontend/`.
- **Known rough edges:** when the liver is faded, a few leftover fragments of its inner segment walls are visible. Ghosted organs are drawn in a fixed order, so two overlapping see-through organs can look slightly different from different angles.

## Check

Run `npm run build`. With the Databricks backend and VID01 video available, enter `/timestamp clipper`; the first known interval is `674–690` seconds. Select it and confirm the video seeks to 11:14. `/chart` and `/quiz` require the six instrument-label queries to succeed. A cold warehouse may take time to respond.

On the home page, submitting the prefilled hero search **When is the cystic duct cut?** opens VID01 at 860 seconds, the scissors/cut/cystic_duct triplet (860–877 s). Selecting the demo card **When is the cystic duct clipped? 11:38** opens VID01 at 698 seconds, the annotated `clipper, clip, cystic_duct` triplet (698–747 s), and asks Lil Doc the same question. Typing any other question in the hero search opens VID01 and sends it to Lil Doc. Local routing maps “clip/clipped/clipping” to `clipper` and “cut/cutting” to `scissors`. In fixture mode, instrument search also returns the verified VID01/VID02 annotation intervals from `shared/triplets.annotation.csv`. The requested seek stays pending while the dashboard reloads for timeline and search results, and the player clears it only after the `seeked` event. Check that the time control reads 11:38 after the clip loads. On the case page, **Open your own video** in the top bar opens a local MP4/MOV (playback only); the logo returns home.

With the backend returning real rows and `VID01.mp4` available, search `clipper`. Click the first result and confirm `VID01` seeks to `11:14` (674 s). Repeat with VID02: the first `clipper` annotation is `VID02 1255–1268` (20:55). Also check a result from a case without video (for example any `clipper` hit outside VID01/VID02), a `prediction` result, and a no-match query. Run `npm run build` for a production build.

## Model results page

`/evals.html` renders team Markdown from `public/` with `src/markdown.js` (escaped, dependency-free). Allowed docs are listed in `src/docs.js`: `?doc=model-evals` (default) and `?doc=architecture`. Add new docs there; do not load arbitrary paths.

## Experimental bounding boxes

Spatial data/model/export, player integration and browser verification are owned by Mihir on `feat/spatial-overlays`; Shlok owns the overall frontend design. Enable **Bounding boxes**, then choose a **Sampled frame**. Instrument/anatomy filters hide categories; the minimum-score slider hides lower-scoring detections (scores are not calibrated probabilities). Use **Fullscreen with overlays** to expand the video container; the native video fullscreen button may omit HTML overlays.

The included VID01 artifact (v3 model, deployed 2026-11-15) has anatomy predictions every 0.24 s across the whole video: gallbladder and cystic duct only, from the Endoscapes-trained model. Boxes expire after 250 ms, so they stay on during playback; each one is still an independent per-frame prediction, not tracking. The Instruments filter is disabled ("none in this file") because the artifact has no instrument boxes. With more than 200 frames, **Sampled frame** lists detection frames at least 10 s apart. Cystic duct boxes are still often missed (validation recall 0.39; v3 misses the duct at the 11:38 clipping moment, which the earlier v2 boxed) and scores are not calibrated accuracy. VID02 has no artifact, and local uploads are deliberately unsupported. Headless Chrome 157 confirmed seeking, playback continuity, resize and VID02 clearing on the restyled case page.

The player checks case, versioned asset ID, dimensions, timestamps, labels and coordinates before rendering. A failed overlay-file request offers a keyboard-accessible **Retry loading boxes** button; a dimension mismatch remains an asset-mapping error. The VID01 MP4 decodes at 854×480 with non-square pixels (SAR 253:255); Chrome 157 reports its display size as 854×484. Its overlay artifact declares both source and display dimensions, so normalized source boxes span the displayed frame. A visible Chrome check with the real MP4 reached sampled frame 674 at 673.96 s, displayed four boxes, kept the layer within the resized player, and showed four boxes aligned with the fullscreen image. Screenshots `/tmp/surgf-overlay-check.png` and `/tmp/surgf-overlay-fullscreen.png` were inspected locally and are not committed. The older `~/Downloads/SurgF-VID01-overlay-browser-check.png` shows the pre-fix mismatch. Replacement videos need a new asset ID and timebase verification. See [runner setup and provenance](../ml/localization/README.md).

Checks: `node --test frontend/test/*.test.js` from the repository root and `npm --prefix frontend run build`. After merging the new steps and Lil Doc layout, local Chrome against the running backend confirmed that the home clipper link seeks to 11:14, five clipper moments appear on seven steps, `/chart instruments` shows only six tools, prior question bubbles rerun their query, and the custom controls, content filter, and overlay toggle appear together. (Historical: the 854×484 vs 854×480 mismatch noted at that time is resolved; artifacts now declare both source and display dimensions.) To recheck, enable boxes, choose sampled frames, filter categories, play/seek beyond 120 ms and confirm clearing, resize/fullscreen, and switch to VID02 and a local upload to confirm unavailable states.

Player DOM integration checks: `node --test frontend/test/*.test.js`. These simulate media state and do not replace real-browser playback/fullscreen verification.
