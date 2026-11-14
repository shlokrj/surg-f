# ML team progress

The project has three teams: backend, frontend, and ML. Shlok and Aadhitya share the ML team and branch `ml-dev`. Databricks is a workstream within this split. See [project progress](../agent-kit/PROGRESS.md), [handoffs](../agent-kit/HANDOFFS.md), and [shared contracts](../agent-kit/CONTRACTS.md).

Update your own section after each feature or major change with the date, branch or commit, exact verification command and result, blockers, and next handoff. Preserve the other person's entries. Coordinate before editing shared files.

## Shlok - features, classifier training, and MLflow

**Status (2026-11-14, `ml-dev`):** Databricks serverless CPU works. VID01 is complete and independently verified; VID02 full extraction is running. Classifier code is ready; real training waits for both bundles.

| Step | Evidence | Status |
|---|---|---|
| Authentication | Existing team token authenticates as Aadhitya; repo-root `.env` is ignored and mode 0600 | Verified |
| CPU notebook and launcher | Explicit CPU selection, managed ML v6, absolute module paths, temporary storage, timed extraction, smoke gate | Implemented |
| VID01 smoke | Run `918098132910738`: `[16,768]`, 2.36 s extraction | Passed |
| VID01 full | Run `1014355595133232`: `[1734,768]`, 263.91 s extraction, 382.92 s notebook time | Uploaded and independently verified |
| VID02 smoke | Run `574066955461279`: `[16,768]`, 2.49 s extraction | Passed |
| VID02 full | Run `1008298473978504`, 30-minute cap; expected `[2840,768]` | Running |
| Classifier | `train_tools.py`: train VID01, test VID02, train-only scaling, threshold 0.5, unknown annotations excluded; provenance and package versions recorded | Implemented, real run pending |

**Verification:** `python scripts/verify_databricks_features.py --case-id VID01 --samples ~/madhacks2026/data/cholect50/samples.json` downloaded all four Volume files and passed full-case, checksum, and source annotation checks. The local check performs no extraction. Unit suites cover bundle integrity, publication, surgery separation, train-only scaling, provenance, and launcher gates. Official SurgVLP image encoder/preprocessing parity on real frame 680 was exact.

**Compute decision:** all full extraction stays on Databricks. Classic T4 creation failed because the workspace has no associated worker environments. Aadhitya's serverless A10 probe stayed pending and was cancelled. The first CPU attempt (`886657513377262`) failed during manual dependency installation; managed ML v6 resolved it. No GPU cluster was created. Measured CPU throughput is about 6.4-6.8 frames/s on the current cases.

**Next handoff:** independently verify VID02, run `scripts/train_databricks_tools.py`, and give Aadhitya the model Volume path and MLflow run for held-out prediction export/import. Keep the model's two-case evaluation limits explicit. Do not fit or tune on VID02.

**Local assets:** environment `~/madhacks2026/.venv-surgf`; labels and smoke frames in `~/madhacks2026/data/cholect50/`; official weights in `~/madhacks2026/models/`; local partial smoke output in `~/madhacks2026/features-smoke/VID01/`. No data or credentials are committed.

**Workflow:** pull before work, commit each major change with updated docs, and push only `ml-dev` unless Shlok explicitly requests `main`.

## Aadhitya - videos and Databricks

**Status (2026-11-14):** video work owned by Aadhitya, confirmed by Shlok. Existing results below are reported in project progress, not rerun in this session. Branch: `ml-dev`.

Scope: playable demo videos, Databricks ingestion, and exporting classifier predictions into the search table. Shlok built training and MLflow (`train_tools.py`), so Aadhitya takes the next step after it (2026-11-14).

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
- [x] Ownership settled (2026-11-14): Shlok owns training and MLflow; Aadhitya owns prediction export and import.
- [x] Add `ml/export_predictions.py` (2026-11-14). It loads `tool_classifiers.joblib` and `metrics.json` from `train_tools.py` and a complete bundle (checked with `validate_bundle`). It thresholds each frame at the saved threshold, merges consecutive positive frames with `to_intervals()`, and writes `case_id,start_sec,end_sec,label,source=prediction` rows. It refuses cases listed in `train_cases`. Verified: `python -m unittest discover -s ml -p 'test_*.py'` ran 17 tests, all OK, including 2 new ones (frames 10–12 and 20 become `10–13` and `20–21`; a training case is rejected). It has not run on real bundles yet: the Volume had no `features/` directory when checked, and VID01 full run `1014355595133232` was in progress.
- [ ] Once the model is trained on VID01 and tested on VID02: run `python ml/export_predictions.py MODEL_DIR /Volumes/.../features/VID02 pred.csv`, load it into `surgf_clip_staging`, run `import_clips.sql`, then record the row counts and a sample `/search` result with `source = prediction`.

**Blocker / next handoff:** 25 fps `VID01.mp4` and `VID02.mp4` exist on Aadhitya's machine and are not hosted. Frontend needs an accessible video; training needs Shlok's validated features.

**For Shlok (2026-11-14):** serverless GPU never got a GPU, but serverless CPU runs. To run `extract_databricks.py` on serverless CPU with `python scripts/gpu_run.py start --case-id VID01 --cpu`, the notebook needs three changes. It's your file, so make them or tell Aadhitya to: (1) allow `device='cpu'` when CUDA is absent, instead of raising; (2) `%pip install` torch>=2.6 and torchvision, since the base serverless environment has no torch; (3) replace `/local_disk0`, which likely doesn't exist on serverless, with `tempfile.mkdtemp()`. ResNet-50 on about 1.7k frames should take minutes on CPU. This is unmeasured.

## Shared feature handoff

Use `/Volumes/workspace/default/surgf/features/<case_id>/` with `features.npy` shaped `[frames, features]` and `manifest.csv` containing `case_id,frame_id` in matching row order. Follow the shared contracts for checkpoint/preprocessing records and annotation joins. Keep surgery cases separate across training and evaluation.

Work one case at a time; do not download the entire dataset. Keep credentials, frames, videos, and feature files out of Git. Remove temporary local frames only after validating the uploaded bundle and confirming they are not needed by the other teammate.

## Branch workflow

Before each task, inspect `git status --short --branch`, fetch, pull `ml-dev`, and merge `origin/main` following the exact commands in the handoff guide. Preserve uncommitted teammate work.

Commit each feature or major change on `ml-dev` with a lowercase Conventional Commit subject, the configured author identity, and no co-authors. Update this tracker and affected project docs in the same push. Fetch and reconcile remote changes before pushing `ml-dev`, leave `main` unchanged unless Shlok explicitly requests a push to it. Never force-push.
