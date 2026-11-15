# Team handoffs

## Frontend merge to spatial owner (2026-11-14)

Mihir merged the stage-3 player UI into `frontend/dev`, keeping the custom controls, content filter, chat, and home clipper seek. Local Chrome reached `11:14 / 28:53` on VID01 and showed the overlay toggle. **Shlok:** the downloaded VID01 MP4 reports `854×484` in Chrome, but `frontend/public/overlays/VID01.json` declares `854×480`. Enabling boxes reports “Overlay dimensions do not match this video,” so no box appears. Verify the source-frame to playable-video pixel mapping before changing the artifact dimensions or relaxing the guard. The DOM tests use simulated `854×480` video dimensions and do not catch this.

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

## Frontend → Data/ML and Backend: chart data needed (2026-11-14)

Mihir's `/chart` UI can count the **six instrument labels** currently returned by `GET /cases/{case_id}/timeline`. It cannot produce verb, target, or tool-specific action charts from that response. The user requested all three categories for the open video, plus prompts such as “what was the grasper doing?” Do not infer verbs or targets from tool presence.

- **Data/ML (Aadhitya and Shlok):** identify whether real per-event instrument–verb–target annotations exist for playable VID01 and VID02. Confirm the actual taxonomy and category counts (the request mentions seven instruments, ten verbs, and fifteen targets, while the current API exposes six instrument labels). Provide a small verified sample with `case_id`, video-relative `start_sec`, exclusive `end_sec`, `instrument`, `verb`, and `target`, plus provenance and any missing-label semantics. If unavailable, state that explicitly and identify the next feasible data source or model handoff.
- **Backend (Rohan), after Data/ML confirms the rows:** propose a video-scoped endpoint and fixture for those events, with filtering by instrument and a summary suitable for counts by instrument, verb, and target. Coordinate the schema in `agent-kit/CONTRACTS.md` before implementation; retain the existing `/search` and timeline responses.
- **Frontend (Mihir):** wire the new response into `/chart` once the contract and verified fixture arrive. Until then, the UI shows the instrument chart and explicitly unavailable verb/target sections. Prompt routing is local keyword matching; an LLM interpretation service has not been supplied.

Please record the sample or blocker and next owner in the relevant progress row, then point Mihir to the commit or fixture path.

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
