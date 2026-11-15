# Team handoffs


## Lil Doc study modes published to main (2026-11-14)

At Aadhitya's request, `ml-dev` was merged with `main` (3D model work included) and `main` fast-forwarded to `68ffdcb`. This adds Genie topic quizzes (`study_quiz`), video length, general educational answers, up-front deflection of advice and surgery-judging questions, and the `surgf_quiz_facts` view (see [databricks/README.md](../databricks/README.md)). "show me the anatomy" and other 3D requests still open the 3D model view. Checks at the merge: backend `pytest -q` 226 passed, `ruff check .` passed, `npm run build` passed, 21 frontend tests passed; live `/chat` returned the 3D model, a Genie Calot triangle answer and a 5-question `study_quiz`. **Everyone running the backend:** set `DATABRICKS_GENIE_SPACE_ID=01f1e09d399e101dbee5a37e935198bf` in `.env` (the old `01f1e086…` space has outdated rules) and run `npm ci` in `frontend/` (the 3D view needs `three`). Not checked: a click-through of the quiz reveal and "Show in video" in a browser.
## 3D model for `/model` (Rohan, 2026-11-14)

Shlok and Mihir: `/model` is now a working 3D view of the gallbladder area that follows the video step by step. Details and file list are under "3D model" in [frontend/README.md](../frontend/README.md); the licence and what is drawn rather than sourced are in [frontend/public/models/ATTRIBUTION.md](../frontend/public/models/ATTRIBUTION.md).

- **New files, all mine:** `frontend/src/model/` (viewer, panel, step pictures, styles, manifest), `frontend/public/models/`, `frontend/scripts/build-anatomy-model.mjs`, `frontend/test/model.test.js`. New dependency `three`; dev dependencies `@gltf-transform/core` and `meshoptimizer` for the build script only.
- **Shared files I touched, kept small:** in `frontend/src/main.js`, two imports, the `model` branch of `outputSections()`, one `disposeModel()` line in `render()`, `playTime()`, `stepBy()`, two options on `seekTo()`, the `[data-step-nav]` handler and `mountModel()` call in `wire()`, and the `model` case in `planFromChat()` and `runSearch()`. In `frontend/src/timeline.js`, previous/next arrows in the Timeline panel head (`.tl-head`). In `frontend/src/lildoc.js`, the `/model` reply. No change to `style.css`, `case.css`, `home.js`, `home.css` or the overlay code. Panel classes use an `anat-` prefix because `home.css` owns `.model-*`.
- **Shlok:** the panel uses the existing `panel` shell and tokens; the arrows, organ chips and stage are new styles in `frontend/src/model/model.css`. Please adjust them to the design system as you see fit.
- **Needs a medical reviewer (after the build, as Rohan decided):** the seven step pictures in `frontend/src/model/steps.js`, the port positions and the drawn cystic artery are schematic. The panel shows "not yet medically reviewed" until `REVIEWED` in that file is set to `true`.
- **Backend:** `POST /chat` can now return `action: "model"` with `{case_id, step_key, step_label}`; see the Chat section of the backend frontend guide.
- **Checked** in headless Edge only (software rendering), not by hand, and not on a phone.

## Spatial anatomy overlay published to main (2026-11-14)

With Shlok's approval, Mihir fast-forwarded `main` to `feat/spatial-overlays`, publishing the anatomy model tooling, the exporter fix, the full-length VID01 anatomy artifact and the player changes described in the section below. Checks at the published commit: 23 localization tests, 15 frontend tests and the frontend build passed. **Demo change:** `main`'s VID01 boxes are now gallbladder/cystic duct anatomy only; the earlier Grounding DINO instrument boxes are gone (kept as a test fixture). Further spatial work continues on `feat/spatial-overlays`; teammates should pull `main`.

## Mihir anatomy model and VID01 overlay deployed (2026-11-14)

On `feat/spatial-overlays`, Mihir finished the anatomy run, analyzed its validation errors and deployed a full-length VID01 anatomy artifact.

- **Training:** `anatomy-full-v1` completed epochs 0–3 on all 1,212 train / 409 validation Endoscapes images. Epoch 4 stopped on the trainer's `nonfinite training loss` guard, reproduced on `--resume` (same saved RNG state). The selected checkpoint is epoch 3: validation COCO AP **0.345**, AP50 0.633 (initial-head baseline AP 0.003). Per class AP50: gallbladder 0.945, cystic duct 0.321.
- **Error analysis:** `ml/localization/analyze_anatomy_errors.py` (IoU 0.5, one-to-one, thresholds picked by validation F1, so optimistic). Report committed as `ml/localization/anatomy_full_v1_errors.json`. Gallbladder at score 0.65: precision 0.95, recall 0.93, per-surgery recall 0.71–1.0. Cystic duct is weak: best F1 0.39 (precision 0.47, recall 0.34) at 0.45; 69 of 102 false positives overlap the duct with IoU 0.1–0.5, and per-surgery recall ranges 0.0–1.0.
- **Exporter fix:** `export_anatomy_video.py` previously treated `--frame-ids 674` as decoded frame 674 (26.92 s), not 11:14. It now samples **player seconds** (`--seconds` or `--every-sec`), maps them to decoded 25 fps frame indices, sets `timestamp_sec = stream start + index/fps` (no CholecT50 offset on decoded frames), decodes once as raw RGB, supports `--class-threshold "cystic duct=0.7"`, and records a digest of all frame hashes.
- **Deployed artifact:** `frontend/public/overlays/VID01.json` now has 7,221 frames every 0.24 s across all of VID01, `max_age_sec` 0.25, gallbladder ≥ 0.65 and cystic duct ≥ 0.70 (validation precision 0.66, recall 0.22), 6,369 gallbladder and 1,096 cystic duct boxes, 1.34 M characters. It contains **no instrument boxes and no liver**. The old Grounding DINO preview moved to `frontend/test/fixtures/VID01-grounding-dino.json` for the DOM tests.
- **Player:** dense artifacts list detection frames at least 10 s apart in the jump menu (166 entries for VID01), and a category with no boxes in the file is disabled as "Instruments (none in this file)".
- **Visual check (not medical review):** a contact sheet of VID01 at 54, 306, 423, 674, 698 and 860 s showed gallbladder boxes on the gallbladder and plausible cystic duct boxes at 54/306/423 s. At 698 s (the "cystic duct clipped" demo moment) no duct box appears: a known miss. VID01 has no anatomy ground truth, so VID01 accuracy is unmeasured; the published overlap map lists no Endoscapes surgery from VID01.
- **Checks:** `python -m unittest discover -s ml/localization -p 'test_*.py'` passed 23 (ffmpeg via `SURGF_FFMPEG`); `node --test frontend/test/*.test.js` passed 15; `npm --prefix frontend run build` passed. Headless Chrome 157 (Playwright, dev server, no backend) on the restyled case page: video reported 854×484; boxes appeared at 54, 422.7 and 673.95 s; during 3 s of playback every 150 ms sample showed 1–2 boxes (no flicker); after a resize the layer kept the video's aspect-ratio rectangle; switching to VID02 cleared all boxes. Fullscreen was not re-run in this pass; its code is unchanged since the visible-Chrome check.
- **Remaining:** better cystic duct quality (gradient clipping or lower learning rate for a new run, more epochs), a reviewed VID01 anatomy sample to measure real-video accuracy, liver and six-instrument boxes (no supervision available), and visible-browser fullscreen recheck. **Shlok:** the overlay panel now shows a disabled Instruments filter; restyle it if needed, but keep the "none in this file" wording.

## Mihir spatial implementation status (2026-11-14)

On `feat/spatial-overlays`, Mihir verified the real VID01 MP4 in visible Chrome 157: sampled frame 674 at 673.96 s showed four experimental boxes, the layer stayed inside the resized player, and fullscreen kept the boxes over the displayed image. Local screenshots `/tmp/surgf-overlay-check.png` and `/tmp/surgf-overlay-fullscreen.png` were inspected and are not committed. Frontend tests/build and the localization suite pass. Existing Grounding DINO labels are visibly inaccurate; this confirms player geometry, **not** detector accuracy.

Mihir added `fetch_anatomy_data.py` (resume-safe, hashed and decoded Endoscapes train/validation keyframes), `train_anatomy.py` (two-class configurable/resumable training with validation-only COCO AP selection), and `export_anatomy_video.py` (exact-frame video binding, model/video hashes and schema validation). The full local dataset at `~/madhacks2026/localization/anatomy-data/` now has **1,212 train and 409 validation images**. The downloader's second pass and `ready_data` verified all file hashes, prepared labels, category scope and surgery separation; signature `0c003c2f469468b0acf3cb61a2788c7aff77b5b8d72ad9f59800ce1f71b07eff`. A five-epoch CPU run was started at `~/madhacks2026/localization/anatomy-full-v1/`; metrics are pending. A 2-train/2-validation-image CPU run completed two epochs with finite losses, but AP is undefined on that tiny slice. A one-frame VID01 export from that bounded checkpoint validated but stays outside the frontend. Next: inspect the full run's representative validation metrics and failure cases before considering a replacement demo artifact. Six-instrument subtype boxes still require verified official or reviewed annotations; the current CholecT50 mirror has zero boxes and Endoscapes uses generic `tool`.

## Mihir takes over remaining spatial work (2026-11-14)

Aadhi has moved to other work. Mihir now owns spatial data, model training, evaluation, inference/export, player integration and browser acceptance on `feat/spatial-overlays`. Shlok continues to own general frontend design. Earlier Aadhi-to-Mihir requests below are historical. The VID01 dimension mismatch was traced to the MP4's 854×480 decoded frame and 253:255 pixel aspect ratio: Chrome 157 exposes 854×484 display dimensions. The artifact binds both sizes, and automated player and producer checks pass. The newer status above records the subsequent visible Chrome fullscreen check.

## Spatial player browser check and retry handoff (2026-11-14)

Mihir added a keyboard-accessible **Retry loading boxes** action for failed overlay-file requests on `feat/spatial-overlays` (`8928876`). `node --test frontend/test/*.test.js` passed 7 tests, including a failed request followed by a successful retry; `npm --prefix frontend run build` passed. In Chrome 157.0.8103.51 on macOS, fixture mode with the real VID01 MP4 reached `11:14 / 28:53` and showed the default-on content filter and overlay controls. The local screenshot is `~/Downloads/SurgF-VID01-overlay-browser-check.png` and is not committed.

**Aadhi → Mihir:** the video reports `854×484`, while `frontend/public/overlays/VID01.json` declares `854×480`. Provide the verified source-to-video pixel transform and asset binding. Mihir will then correct the player/artifact alignment as appropriate and verify visible boxes, seeking, and fullscreen in a real browser. The dimension guard still blocks boxes; browser overlay acceptance is pending.

## Previous ownership: Shlok moved to frontend design (superseded 2026-11-14)

Shlok moved to **general frontend design and presentation**. At that point, Aadhi owned spatial data/model/export and Mihir owned player integration. The newer Mihir-only spatial ownership above supersedes this handoff.

Spatial teammates continue on `feat/spatial-overlays`; Aadhi should retain the scoped evaluator already pushed in `78dfef0`. Shlok and Mihir must coordinate shared `frontend/src/main.js`, `style.css` and player markup: Shlok owns overall design, Mihir owns overlay behavior. Do not overwrite each other's edits. Full tasks and handoffs are in [the localization plan](../ml/LOCALIZATION_PLAN.md#current-assignments-and-shared-workflow).

The ownership change was initially documentation-only. Mihir later requested publication of the already integrated `frontend/dev` work; `main` now contains it through `6d468dd`. Further unfinished spatial work remains on `feat/spatial-overlays` until explicitly published. The frontend progress row records checks and the unresolved overlay dimension mismatch.


## Prior spatial team assignments (superseded 2026-11-14)

**Shlok, Aadhi (Aadhitya), and Mihir now share `feat/spatial-overlays`. Push all new feature work there; do not merge or push to main until Shlok explicitly requests it.** This supersedes older Shlok-only stage-3 ownership, Aadhi-only-stage-2 notes and the previous main publication instruction. Main already has the earlier prototype; it is not the target for this work round.

| Owner | Current task | Status / next handoff |
|---|---|---|
| Shlok | Anatomy trainer, category-scoped metrics, checkpoint selection and inference | Assigned, not yet complete. Start with scoped evaluation and configurable training; use Aadhi's data manifests. Hand off checkpoint/class map/metrics. |
| Aadhi | Complete image downloads/manifests, overlap guards, instrument annotation audit and model-to-overlay export | Assigned, not yet complete. Start full train/validation data preparation. Hand Shlok verified inputs, then Mihir versioned artifacts. |
| Mihir | Real-browser overlay integration, UX and regression verification | Assigned, not yet complete. Start actual VID01 playback checks using the existing artifact. Hand off screenshots/recording and acceptance results. |

Read [the complete assignments](../ml/LOCALIZATION_PLAN.md#current-assignments-and-shared-workflow) for owned paths, ordered tasks, dependencies and completion criteria. Use separate checkouts and preserve concurrent branch commits. Existing prototype limitations remain: inaccurate Grounding DINO labels, no full anatomy training/accuracy result, no verified six-instrument box dataset, and outstanding real-browser acceptance. Prior checks: 6 frontend tests, 11 localization tests and frontend build passed; this assignment change is documentation-only.

## Frontend merge to spatial owner (2026-11-14)

Mihir merged the stage-3 player UI and the newer steps/Lil Doc layout into `frontend/dev` and then published the integration to `main`, keeping the custom controls, content filter, clickable prior questions, and home clipper seek. Local Chrome against the running backend reached `11:14 / 28:53` on VID01, showed five clipper moments across seven operation steps and only six tools in `/chart instruments`, and showed the overlay toggle. **Aadhi:** verify the source-to-playable-video pixel mapping for the downloaded VID01 MP4, which reports `854×484` in Chrome; `frontend/public/overlays/VID01.json` declares `854×480`. Enabling boxes reports “Overlay dimensions do not match this video,” so no box appears. Hand Mihir the verified frame-to-video transform and asset binding before changing the artifact dimensions or relaxing the guard. The DOM tests use simulated `854×480` video dimensions and do not catch this.

## Spatial work published to main (2026-11-14)

Shlok requested publication for teammate handoff. All stage-3 work through `1f49b33` is now integrated into `main`, including detector/overlay prototype, annotation preparation, evaluation utilities and the real-image training smoke runner. Start from `main`; older branch references below describe historical work. Task reassignment will be discussed separately, so existing owners remain unchanged.

Verification on the integrated main: `node --test frontend/test/*.test.js` passed 6 tests; `python3 -m unittest discover -s ml/localization -p 'test_*.py'` passed 11; `npm --prefix frontend run build` and `git diff --check` passed. Read `ml/localization/README.md` before running jobs. Full anatomy training/evaluation, six-instrument supervision and real-browser acceptance remain unfinished. Images, videos, credentials and model checkpoints remain outside Git.


## Stage 3 player handoff (2026-11-14)

Shlok, `feat/spatial-overlays`: offline detector and opt-in player integration implemented. The player validates versioned artifacts, separates instrument/anatomy filters, supports sampled-frame seeking, clears expired boxes and computes letterbox coordinates. Separate fullscreen control includes the overlay container. Real VID01 preview: three frames, ten predictions; known incorrect instrument labels mean this is not accuracy-qualified. No tracking, action relations, or new backend routes.

Verification: `node --test frontend/test/overlays.test.js` passed 3 tests (real artifact, rejection/expiry, geometry); `python3 -m unittest discover -s ml/localization -p 'test_*.py'` passed 3 tests; `npm --prefix frontend run build` passed. Browser interaction could not be verified: computer-use returned “The browser access host is unavailable.” Manual player acceptance remains open; see frontend README. Next: Shlok performs browser acceptance and obtains reviewed localization ground truth before detector tuning/accuracy claims. Aadhitya continues stage 2 unchanged.


## Active phase ownership (2026-11-14)

Shlok explicitly took ownership of **stage 3 bounding-box implementation** on `feat/spatial-overlays`, using a separate worktree (`surg-f-spatial`). Aadhitya continues **stage 2** classifier retraining, validation, smoothing and prediction integration on `ml-dev`. Do not duplicate or restart each other's jobs. Shlok owns new localization scripts/artifacts and the isolated player-overlay integration; preserve Mihir's other frontend work and Rohan's backend routes. This supersedes the earlier future-only status and proposed stage-3 task split. Stage-3 implementation is a bounded offline detector-to-player prototype; tracking, action recognition and validated anatomy accuracy remain separate follow-ups. Commits and verification will be recorded below.


Start each session with the synced branch, the current progress row, and the assigned scope. Use a separate branch per workstream. Agree together before changing a shared interface.

## Copy into your agent prompt

> Read root AGENTS.md and follow the Git sync rules. My lane is [lane]. My task is [task]. Read SPEC.md, CONTRACTS.md, and my progress row. Keep edits within [paths]. Verify [observable result]. Update my progress row with the branch, evidence, blockers, and next handoff.

## End each session

Record the branch or PR, what runs, the exact verification command or demo steps, any input still needed, and the next owner. If two people touch PROGRESS.md, preserve both updates when integrating.

## Data/ML → frontend (2026-11-14)

Videos for VID01 and VID02 are hosted. Fetch them with `python scripts/fetch_videos.py VID01 VID02`. Search returns clips from 50 cases, but only those two have video, and it includes noisy VID02 `prediction` rows from the baseline model. See [frontend/README.md](../frontend/README.md#videos-and-data-from-dataml-2026-11-14) for details and the integration check.

## Backend → frontend (2026-11-14)

Mihir: everything needed to wire up search, the instrument chart, and the quiz is in [backend/docs/FRONTEND_GUIDE.md](../backend/docs/FRONTEND_GUIDE.md). It covers URLs, curl examples, real responses, TypeScript types, errors, and which UI element uses which endpoint. On branch `backend`, start the API with `cd backend; python -m uv run uvicorn app.main:app --port 8000`. Use `GET /cases/{case_id}/timeline` for the chart instead of six `/search` calls; it leaves predictions out by default. Use `GET /quiz` for five general questions instead of the per-video quiz, and show a "not yet medically reviewed" notice while `reviewed` is false. The timeline and quiz shapes are a [proposal](../backend/docs/CONTRACT_PROPOSAL.md) until the team agrees. Offline copies are in `backend/fixtures/`.

## Backend → frontend: interpret endpoint and quiz form (2026-11-14)

Mihir: the interpretation service your chart note said was missing now exists as `GET /interpret?q=<text>&case_id=<id>` ([guide, section 5](../backend/docs/FRONTEND_GUIDE.md)). It returns `timestamp`, `chart`, `quiz` and `model` actions. Keyword rules answer instantly; Databricks Genie handles free-form questions once the Surg+F Genie space exists, which is not yet the case. I wired it into `runSearch` in `frontend/src/main.js` with a fallback to your local `detectRequest` when the backend is unreachable, and kept your `chartRequest` handling. I also replaced the inline quiz buttons with a numbered multiple-choice form in `frontend/src/quiz.js` and `quiz.css`; the chart is unchanged. Please review both in a browser: I built and screenshotted them but have not clicked through them by hand. Genie chart summaries (`action.summary`) are not rendered by the frontend yet. Plan: [GENIE_PLAN.md](../backend/docs/GENIE_PLAN.md).

## Backend → frontend: chat endpoint (2026-11-14)

Mihir and Shlok: the chat box can now be one call. `POST /chat` with `{"message": "<what the user typed>", "case_id": "<open video>"}` returns `{reply, action, data, router}`. Show `reply` in the chat and render `data` with the component for `action`: `search` is the matching-moments list, `quiz` the quiz card, `timeline` the chart, `answer` a small table, and `none` the reply only. The [Chat section of the frontend guide](../backend/docs/FRONTEND_GUIDE.md#7-chat-one-message-in-one-thing-to-render-out) has the request, the TypeScript type, a real example per action and the action-to-component table; offline examples are in `backend/fixtures/chat.examples.json`. A Databricks chat model picks the feature and keyword rules take over on any failure, so it answers even with every AI service down. Medical-advice questions get a fixed study-aid reply. **Update, same day:** at Rohan's request the chat box is now wired: `runSearch` in `frontend/src/main.js` sends free-typed messages to `POST /chat` through `chatMessage` in `api.js`, keeps slash commands on `GET /interpret`, and falls back to `/interpret` and the local rules when `/chat` is unavailable. The change is about 30 lines (`SLASH_COMMAND`, `planFromChat`, and the first lines of the `try` block); Lil Doc's wording, the chart categories and the overlay code are untouched. It was checked in headless Edge, not by hand, so please review it in your own browser. Not done: the `answer` action shows its reply text only, without the table. To use the model router locally, add `DATABRICKS_CHAT_ENDPOINT=databricks-meta-llama-3-3-70b-instruct` to your repo-root `.env`; without it the rules answer. The shape is a [proposal](../backend/docs/CONTRACT_PROPOSAL.md) until the team agrees.

Data questions are now fast: "which instrument was used the longest?", "hook after minute 10", "how long was the clipper used?" and "grasper and hook together" are computed by the backend and return in 1 to 2 s as `search` or `answer` with `router: llm`. An `answer` can therefore arrive without Genie; its table has the columns `label`, `count`, `total_sec`, `first_sec`. Genie is the fallback for anything else: with `DATABRICKS_GENIE_SPACE_ID=01f1e09d399e101dbee5a37e935198bf` in `.env`, open-ended data questions ("which instrument was used the longest?") come back as `router: genie` after 11 to 14 s, either as `search` clips or as an `answer` table, so keep the loading state visible.

Which endpoint to use: `POST /chat` for free-typed chat messages; keep `GET /interpret` for slash commands, since it can return several actions at once. Chat search returns annotation rows for the open video only.

Aadhitya: the live clip table now holds verb and target labels (`grasp`, `gallbladder`, …) as `annotation` rows, which had grown `GET /cases/VID01/timeline` to 24 labels. The backend now returns the six instruments only from the timeline, so the chart is back to 70 segments for VID01; search still finds every label. Please confirm the import was intended. A category column would let the backend stop relying on a fixed label list.

## Frontend → Data/ML and Backend: chart data needed (2026-11-14)

Mihir's `/chart` UI can count the **six instrument labels** currently returned by `GET /cases/{case_id}/timeline`. It cannot produce verb, target, or tool-specific action charts from that response. The user requested all three categories for the open video, plus prompts such as “what was the grasper doing?” Do not infer verbs or targets from tool presence.

- **Data/ML (Aadhitya and Shlok):** identify whether real per-event instrument–verb–target annotations exist for playable VID01 and VID02. Confirm the actual taxonomy and category counts (the request mentions seven instruments, ten verbs, and fifteen targets, while the current API exposes six instrument labels). Provide a small verified sample with `case_id`, video-relative `start_sec`, exclusive `end_sec`, `instrument`, `verb`, and `target`, plus provenance and any missing-label semantics. If unavailable, state that explicitly and identify the next feasible data source or model handoff.
- **Backend (Rohan), after Data/ML confirms the rows:** propose a video-scoped endpoint and fixture for those events, with filtering by instrument and a summary suitable for counts by instrument, verb, and target. Coordinate the schema in `agent-kit/CONTRACTS.md` before implementation; retain the existing `/search` and timeline responses.
- **Frontend (Mihir):** wire the new response into `/chart` once the contract and verified fixture arrive. Until then, the UI shows the instrument chart and explicitly unavailable verb/target sections. Prompt routing is local keyword matching; an LLM interpretation service has not been supplied.

Please record the sample or blocker and next owner in the relevant progress row, then point Mihir to the commit or fixture path.

### Data/ML reply: action rows delivered (Aadhitya, 2026-11-14)

**Yes, real per-instrument annotations exist.** CholecT50 `samples.json` (verified sha `c4791109…`) stores a `triplets` field on every 1 fps frame, and each triplet binds one instrument to its own verb and target (for example `grasper,grasp,gallbladder`). These are not inferred from tool presence.

**Fixture:** [`shared/triplets.annotation.csv`](../shared/triplets.annotation.csv), with 269 rows covering **all** of VID01 (1,734 s) and VID02 (2,840 s), not a sample. Columns: `case_id,start_sec,end_sec,instrument,verb,target,source`. Intervals are `[start_sec, end_sec)` in video seconds, on the same timebase as `/search` (seek directly). `source` is always `annotation`. Regenerate with `python ml/export_triplets.py <samples.json> shared/triplets.annotation.csv VID01 VID02`.

**Taxonomy:** 6 instruments (bipolar, clipper, grasper, hook, irrigator, scissors), 9 verbs plus `null_verb`, and 14 targets plus `null_target`, giving 100 triplet classes. The "10 verbs / 15 targets" in the request counts the nulls. There is no 7th instrument; the API's six labels are the full set.

**Missing-label semantics:**
- `null_verb,null_target`: the instrument is visible but no action is annotated (VID01 313 s, VID02 239 s). Show it as "idle", not as missing data.
- No row for an instrument at a second: that instrument is not visible. Every second of both videos is annotated; seconds with no rows at all mean no instrument is in view (VID01 191 s, VID02 220 s).
- Rows overlap in time, because several instruments work at once. Sum durations per category; don't treat them as a partition.

**Sample (first rows of VID01):**
```
VID01,0,5,grasper,grasp,gallbladder,annotation
VID01,10,108,grasper,grasp,gallbladder,annotation
VID01,20,251,hook,null_verb,null_target,annotation
VID01,251,272,hook,dissect,cystic_duct,annotation
```

**Seconds per category (sum of row durations):**
- VID01 verbs: grasp 840, dissect 553, retract 486, null 313, coagulate 125, aspirate 117, clip 78, pack 27, cut 17, irrigate 4.
- VID01 targets: gallbladder 1375, liver 387, null 313, specimen_bag 125, cystic_duct 124, fluid 117, blood_vessel 100, cystic_artery 16, abdominal_wall_cavity 2, cystic_pedicle 1.
- VID02 verbs: retract 1673, dissect 1510, null 239, cut 227, grasp 146, aspirate 96, coagulate 95, clip 62, irrigate 25.
- VID02 targets: gallbladder 2019, liver 506, cystic_duct 375, omentum 324, null 239, cystic_artery 182, adhesion 155, fluid 96, gut 88, specimen_bag 59, cystic_pedicle 25, abdominal_wall_cavity 5.

**Verification:** a round-trip check rebuilt each second's triplet set from the 269 intervals and matched `samples.json` exactly for all 4,574 seconds. The merge logic has a unit test, `ml/test_triplets.py`.

**"What was the grasper doing?"** Filter `instrument == grasper`, then group by verb (and target). **Next owner: Rohan** proposes the video-scoped endpoint from this CSV in `CONTRACTS.md`. **Mihir** can build `/chart` against the CSV now; the fields won't change.

**Frontend follow-up (Mihir, 2026-11-14):** Data/ML delivered the verified VID01/VID02 action intervals in `ml-dev` commit `c0ae595`. The frontend now imports the same `shared/triplets.annotation.csv` (269 rows) and renders verb/target interval counts, including instrument-specific verbs. Rohan remains the next owner for the agreed video-scoped API/fixture. Keep `null_verb`/`null_target` semantics and overlapping intervals when proposing counts. Once that endpoint is available, Mihir will switch from the committed CSV to the API.

## Shared `ml-dev` branch (Aadhitya + Shlok)

Both people and their agents commit and push to `ml-dev`. Update `main` only when Shlok explicitly requests it. Track separate work in [ML progress](../ml/PROGRESS.md): Shlok owns SurgVLP/features, coverage analysis, dataset splits, classifier training, and MLflow. Aadhitya owns videos, prediction export/import, and clip-level evaluation.

**One-time setup**
1. Run `git fetch && git checkout ml-dev`.
2. Create a repo-root `.env` (git-ignored) with `DATABRICKS_SERVER_HOSTNAME`, `DATABRICKS_HTTP_PATH`, and `DATABRICKS_TOKEN`. Get the values from Aadhitya privately.
3. Keep data outside the repo, for example `~/madhacks2026/data/cholect50/`. Get labels with `curl -L -o samples.json https://huggingface.co/datasets/Voxel51/cholect50/resolve/main/samples.json` (about 500 MB).

**Every session on the shared branch**
- **Start:** run `git checkout ml-dev && git pull --ff-only && git fetch origin && git merge origin/main`, so `ml-dev` has everything on `main`. If the pull or merge fails, stop and talk to each other. Never force-push, reset, or stash the other person's work.
- **Finish:** commit, fetch and reconcile incoming changes, then push with `git push origin ml-dev`. If the shared branch advanced, inspect and merge its changes before retrying; preserve both teammates' work. Do not push to `main` unless Shlok explicitly requests it.
- Make small commits that touch only your task's files. Announce in chat before you edit a file the other person is working on.
- Before ending a session, update `PROGRESS.md` (Databricks row for Aadhitya, Data and ML row for Shlok) with what was verified and what's next.

## Current ML tasks

Use the [assigned parallel work](../ml/PROGRESS.md#assigned-parallel-work-2026-11-14) as the current task list and acceptance criteria.

- **Shlok starts with:** annotation coverage audit and a fixed surgery-level split, then configurable Databricks training. Own training/model changes and the first extraction group listed in the ML tracker.
- **Aadhitya starts with:** export/import of the available baseline predictions, a standalone clip evaluator with synthetic checks, and VID02 video hosting. Own the second extraction group listed in the ML tracker.
- **Handoff:** Shlok supplies the split and model artifacts; Aadhitya supplies prediction import evidence, clip metrics, and frontend video instructions. The baseline model path and environment are in Shlok's progress section.
- **While tests run:** use separate worktrees/checkouts, preserve the tested revision, and check existing runs/bundles before launching extraction. Coordinate changes to model formats or shared files. Do not tune on the final test surgeries.

The annotation import and two-case baseline are recorded as complete. The expanded model and clip evaluation are assigned work, not verified results.

## ML reporting follow-on

See [reporting and error-review assignments](../ml/PROGRESS.md#reporting-and-error-review-assignments-2026-11-14). Shlok owns per-surgery comparisons and training-only reference baselines; Aadhitya owns a bounded validation timestamp review file for false positives/negatives. Both can be tested with synthetic inputs while extraction runs. Model artifact changes require coordination; final-test cases stay out of iterative review.

## Planned stage 3: video localization

Future stage 3 handoff: Shlok evaluates localization models; Aadhitya audits spatial annotations/timebase and exports; Rohan agrees storage/API; Mihir implements the optional overlay toggle. These are proposed lane responsibilities, not active assignments. Agree the schema and taxonomy before building; retain the current search/clip contract.

See [Stage 3 localization plan](../ml/LOCALIZATION_PLAN.md) for the complete context and primary sources.
