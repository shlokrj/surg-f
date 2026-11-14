# ML team progress

The project has three teams: backend, frontend, and ML. Shlok and Aadhitya share the ML team and branch `ml-dev`. Databricks is a workstream within this split. See [project progress](../agent-kit/PROGRESS.md), [handoffs](../agent-kit/HANDOFFS.md), and [shared contracts](../agent-kit/CONTRACTS.md).

Update your own section after each feature or major change with the date, branch or commit, exact verification command and result, blockers, and next handoff. Preserve the other person's entries. Coordinate before editing shared files.

## Shlok - SurgVLP and feature extraction

**Status (2026-11-14):** ownership confirmed; extraction setup pending. Branch: `ml-dev`.

Scope: frozen SurgVLP setup, one-case-at-a-time feature extraction, annotation alignment, and validated feature uploads. Aadhitya owns the video script; coordinate before changing it.

- [x] Claim Data and ML ownership and create this tracker.
- [ ] Agree with Aadhitya on the GPU environment: Databricks or another GPU machine. The Databricks proposal is not yet adopted.
- [ ] Verify dependencies, checkpoint access, and one-case frame access. Aadhitya reports VID01 frames on his machine; availability on Shlok's machine is unverified.
- [ ] Extract VID01 features and record checkpoint, preprocessing, matrix shape, and frame count.
- [ ] Reload and validate the bundle and annotation joins, then upload it to the shared Volume.
- [ ] Repeat for 2-3 cases after the first bundle passes validation.

**Verification:** documentation only: `git diff --check` and local Markdown link-target validation passed. No SurgVLP execution or GPU availability has been verified.

**Blocker / next handoff:** Shlok and Aadhitya choose the extraction environment. Shlok then supplies a reloadable VID01 bundle to Aadhitya for classifier training.

## Aadhitya - videos and Databricks

**Status (2026-11-14):** video work owned by Aadhitya, confirmed by Shlok. Existing results below are reported in project progress, not rerun in this session. Branch: `ml-dev`.

Scope: playable demo videos and existing Databricks ingestion work. The training notebook and MLflow work remain proposed for Aadhitya until he confirms.

- [x] Import 3,620 annotation clips across 50 cases; reported rerun inserted zero duplicates.
- [x] Build VID01 with `python3 ml/make_case_video.py samples.json VID01 out_dir/`.
- [x] Verify VID01 frame/time alignment; project progress reports frame 680 matched the source at 46 dB PSNR.
- [ ] Build another demo case, such as VID02.
- [ ] Agree with frontend on video hosting and hand over playable URLs.
- [ ] Confirm ownership of the Databricks classifier notebook and MLflow runs.

**Blocker / next handoff:** VID01 exists on Aadhitya's machine and is not hosted. Frontend needs an accessible video; training needs Shlok's validated features.

## Shared feature handoff

Use `/Volumes/workspace/default/surgf/features/<case_id>/` with `features.npy` shaped `[frames, features]` and `manifest.csv` containing `case_id,frame_id` in matching row order. Follow the shared contracts for checkpoint/preprocessing records and annotation joins. Keep surgery cases separate across training and evaluation.

Work one case at a time; do not download the entire dataset. Keep credentials, frames, videos, and feature files out of Git. Remove temporary local frames only after validating the uploaded bundle and confirming they are not needed by the other teammate.

## Branch workflow

Before each task, inspect `git status --short --branch`, fetch, pull `ml-dev`, and merge `origin/main` following the exact commands in the handoff guide. Preserve uncommitted teammate work.

Commit each feature or major change on `ml-dev` with a lowercase Conventional Commit subject, the configured author identity, and no co-authors. Update this tracker and affected project docs in the same push. Fetch and reconcile remote changes before pushing `ml-dev`, then update `main` with a normal fast-forward push as described in the handoff guide. Never force-push.
