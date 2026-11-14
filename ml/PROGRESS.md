# ML team progress

The project has three teams: backend, frontend, and ML. Shlok and Aadhitya share the ML team and branch `ml-dev`. Databricks is a workstream within this split. See [project progress](../agent-kit/PROGRESS.md), [handoffs](../agent-kit/HANDOFFS.md), and [shared contracts](../agent-kit/CONTRACTS.md).

Update your own section after each feature or major change with the date, branch or commit, exact verification command and result, blockers, and next handoff. Preserve the other person's entries. Coordinate before editing shared files.

## Shlok - SurgVLP and feature extraction

**Status (2026-11-14):** extraction pipeline and Databricks notebook implemented; real CPU smoke check passed. Local Databricks authentication verified; GPU launch blocked by workspace provisioning. Branch: `ml-dev`.

Scope: frozen SurgVLP setup, one-case-at-a-time feature extraction, annotation alignment, and validated feature uploads. Aadhitya owns the video script; his shared `download_case.py` is reused unchanged.

- [x] Claim Data and ML ownership and create this tracker.
- [x] Shlok selected Databricks GPU for full extraction on 2026-11-14. Authentication verified with the existing team token; no clusters visible and no cluster launched.
- [x] Set up isolated Python 3.12 environment outside Git, download labels and official weights, and fetch VID01 frames 674-689.
- [x] Implement extraction, source annotation joins, bundle validation, and guarded publication; add a Databricks source notebook.
- [x] Validate a real partial VID01 bundle: 16 rows x 768 features, float32, IDs 674-689, matched source labels, complete_case=false.
- [ ] Run the notebook on Databricks GPU, first in smoke mode, then on all 1,734 VID01 frames.
- [ ] Reload the complete uploaded bundle from `/Volumes/workspace/default/surgf/features/VID01/`.
- [ ] Repeat for 2-3 cases after the first complete bundle passes validation.

**Verification:** `~/madhacks2026/.venv-surgf/bin/python -m unittest discover -s ml -p 'test_*.py' -v`: 12 tests passed, including bad joins, duplicate IDs, corrupt checksums, incomplete publication, and overwrite rejection. `python -m compileall -q ml` passed. The [README smoke command](README.md) ran with local paths under `~/madhacks2026/data/cholect50/`, `models/`, and `features-smoke/VID01/`, producing a validated `[16,768]` matrix. Official upstream image encoder and preprocessing at revision `85e8589` matched our output exactly on real frame 680 (max absolute difference 0). CUDA execution and Volume publication have not been verified.

**Local assets:** environment `~/madhacks2026/.venv-surgf`; labels/frames `~/madhacks2026/data/cholect50/`; weights `~/madhacks2026/models/SurgVLP.pth`; partial bundle `~/madhacks2026/features-smoke/VID01/`. No data or credentials committed. The direct upstream package install encountered old setuptools/tokenizer requirements; the image-only loader uses the official weights with torch/torchvision and does not require that package.

**Authentication (2026-11-14):** `~/madhacks2026/.venv-surgf/bin/python scripts/check_databricks_auth.py` passed using the existing Git-ignored `.env` (permissions 0600). Authenticated as Aadhitya's account; `workspace.default.surgf` Volume metadata accessible; 0 visible clusters. No token committed or printed by the check. Volume file writes and GPU availability remain unverified.

**Remote launch update (2026-11-14):** Personal Compute allows `g4dn.xlarge` and runtime `17.3.x-gpu-ml-scala2.13` is available, but the single-node request failed with `Current organization ... does not have any associated worker environments`. Stopped the SDK retry loop; no cluster created. Added `scripts/run_databricks_features.py` for snapshot deployment, bounded job submission, and status. Seven launcher tests passed. Deployed committed snapshot `f39266b` into `/Users/<token-owner>/surg-f-ml/f39266b0a4ca7ad171da7843432042a5c66adacb/ml`; module readback matched Git. No CUDA job submitted.

**Blocker / next handoff:** workspace owner must resolve compute provisioning (or confirm an available serverless GPU path). Shlok confirmed on 2026-11-14 that full extraction must remain on Databricks; do not run a full local fallback. Documentation check: `git diff --check` passed; compute remains blocked. Once GPU compute is available, run [extract_databricks.py](extract_databricks.py), first smoke mode then full VID01. After a full run, hand Aadhitya a validated Volume bundle for classifier training. The current 16-frame local bundle is only a smoke check.

**CPU/GPU review (2026-11-14):** recommend Databricks serverless CPU for the first two demo cases, with a timed real-data smoke run before full extraction. This keeps all full extraction on Databricks. Live `jobs.get_run` / `jobs.get_run_output` checks show CPU probe `41666230252779` reached Python (2-3 s setup, 14 s execution per attempt) and failed only on missing `torch`; these are probe timings, not extraction throughput. GPU probe `375497629116767` remained pending at the task level about 17 minutes after submission, with a cancellation/timeout flag; this does not prove GPU capacity is unavailable. Neither run was started or changed during this review. `environments.list_workspace_base_environments` lists CPU ML Latest/ML v6 with torch 2.12.0 and torchvision 0.27.0, and GPU AI environments. Listed packages and environments still require an actual run to validate. Classic GPU remains blocked by the missing worker environment.

**Recommended next change:** reuse Aadhitya's newly pulled `scripts/gpu_run.py --cpu` launcher and add explicit CPU/serverless support to the notebook, use the managed ML CPU environment plus ijson, replace the fixed `/local_disk0` path and working-directory assumptions, and time a 16-128 frame extraction. The current notebook requires CUDA; the older `run_databricks_features.py submit` path requires an existing classic cluster. Aadhitya's `gpu_run.py start --cpu` supplies the serverless path but the notebook still needs adaptation. If the measured full-case estimate is acceptable for the hackathon, process VID01 then VID02 and validate Volume readback. Use CPU for the classifier on cached features. Revisit serverless A10 GPU for larger batches or if CPU timings are too slow. No GPU-versus-CPU extraction benchmark or price comparison has been measured, and no compute choice was silently changed in code.

**Workflow:** pull before work, commit each feature or major change and update docs, then push only `ml-dev`. Update `main` only at Shlok's explicit request.

## Aadhitya - videos and Databricks

**Status (2026-11-14):** video work owned by Aadhitya, confirmed by Shlok. Existing results below are reported in project progress, not rerun in this session. Branch: `ml-dev`.

Scope: playable demo videos and existing Databricks ingestion work. The training notebook and MLflow work remain proposed for Aadhitya until he confirms.

- [x] Import 3,620 annotation clips across 50 cases; reported rerun inserted zero duplicates.
- [x] Build VID01 with `python3 ml/make_case_video.py samples.json VID01 out_dir/`.
- [x] Verify VID01 frame/time alignment; project progress reports frame 680 matched the source at 46 dB PSNR.
- [x] Add `ml/download_case.py` (2026-11-14, `ml-dev`). It downloads full-resolution 854x480 frames for a whole case, or for one clip with `python3 ml/download_case.py samples.json VID02 out_dir/ 674 690` (end exclusive). Verified: that clip gave 16 PNGs, `000674` through `000689`. An unknown case (`VID99`) exits with an error. `make_case_video.py` now reuses it, and rebuilding VID01 gave an identical md5 (`836b8d8b…`).
- [x] Check smooth-video source (2026-11-14). Cholec80 25 fps videos download directly with no request form. Single videos can be pulled from the 74.9 GB zip using range requests. `RemoteZip(url).infolist()` listed 324 entries, including `videos/video01.mp4` at 692.7 MB. Covers VID01–VID80 only. Details are in agent-kit/PROGRESS.md, open question 2.
- [x] Add `ml/download_cholec80_video.py` (2026-11-14). It builds smooth 25 fps browser-ready demo videos with faststart, copying the stream without re-encoding. Built `VID01.mp4` (692.6 MB) and `VID02.mp4` (1.14 GB) on Aadhitya's machine. Alignment against CholecT50 frames is a constant -0.04 s for VID01 and +0.08 s for VID02, with no drift across 5 checked points. `VID92` is rejected with an error because Cholec80 only covers VID01–VID80.
- [x] Build another demo case: VID02 (25 fps).
- [x] Add `scripts/gpu_run.py` (2026-11-14) to start, list, and stop extraction runs on serverless compute. Each run has a hard timeout (default 30 min) and bills only while active. It reuses `run_databricks_features.py` deploy/snapshot unchanged. Verified: `start --case-id VID01 --cpu --timeout-min 5` launched run 409734303669408, `list` showed it, `stop` cancelled it, and `list` no longer showed it. Needs `pip install databricks-sdk python-dotenv`.
- [x] Test serverless compute (2026-11-14). Serverless GPU (`GPU_1xA10`) stayed `PENDING` for 13.5 min with no GPU assigned, then was cancelled. Serverless CPU starts in under 1 min. Details are in agent-kit/PROGRESS.md, open question 4.
- [x] Host the 25 fps VID01 for the frontend (2026-11-14) at `/Volumes/workspace/default/surgf/videos/VID01.mp4`. `python scripts/fetch_videos.py VID01` puts it in `frontend/public/videos/` (md5 matches, git-ignored). VID02 is built locally but not uploaded yet.
- [ ] Confirm ownership of the Databricks classifier notebook and MLflow runs.

**Blocker / next handoff:** 25 fps `VID01.mp4` and `VID02.mp4` exist on Aadhitya's machine and are not hosted. Frontend needs an accessible video; training needs Shlok's validated features.

**For Shlok (2026-11-14):** serverless GPU never got a GPU, but serverless CPU runs. To run `extract_databricks.py` on serverless CPU with `python scripts/gpu_run.py start --case-id VID01 --cpu`, the notebook needs three changes. It's your file, so make them or tell Aadhitya to: (1) allow `device='cpu'` when CUDA is absent, instead of raising; (2) `%pip install` torch>=2.6 and torchvision, since the base serverless environment has no torch; (3) replace `/local_disk0`, which likely doesn't exist on serverless, with `tempfile.mkdtemp()`. ResNet-50 on about 1.7k frames should take minutes on CPU. This is unmeasured.

## Shared feature handoff

Use `/Volumes/workspace/default/surgf/features/<case_id>/` with `features.npy` shaped `[frames, features]` and `manifest.csv` containing `case_id,frame_id` in matching row order. Follow the shared contracts for checkpoint/preprocessing records and annotation joins. Keep surgery cases separate across training and evaluation.

Work one case at a time; do not download the entire dataset. Keep credentials, frames, videos, and feature files out of Git. Remove temporary local frames only after validating the uploaded bundle and confirming they are not needed by the other teammate.

## Branch workflow

Before each task, inspect `git status --short --branch`, fetch, pull `ml-dev`, and merge `origin/main` following the exact commands in the handoff guide. Preserve uncommitted teammate work.

Commit each feature or major change on `ml-dev` with a lowercase Conventional Commit subject, the configured author identity, and no co-authors. Update this tracker and affected project docs in the same push. Fetch and reconcile remote changes before pushing `ml-dev`, leave `main` unchanged unless Shlok explicitly requests a push to it. Never force-push.
