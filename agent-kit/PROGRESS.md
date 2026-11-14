# Surg+F progress

## Current milestone

Agent kit prepared and Markdown links checked. The first integration target is **one real annotated CholecT50 clip returned by Databricks SQL and opened at the correct timestamp**. Implementation status and teammate assignments below are unverified until each owner checks in.

| Lane | Owner | Status | Verified evidence or blocker | Next handoff |
|---|---|---|---|---|
| Databricks | Shlok, Aadhitya | annotations imported | 2026-11-14 (Aadhitya): `workspace.default.surgf_clips` holds 3620 `annotation` rows over 50 cases (grasper 1833, hook 905, irrigator 315, bipolar 309, clipper 154, scissors 104) plus 1 `fixture` row. Loaded from `/Volumes/workspace/default/surgf/clips.csv` into `surgf_clip_staging` with `read_files`, then imported with import_clips.sql. The first run inserted 3620 rows and a rerun inserted 0, so there are no duplicates. Sample: `SELECT * FROM workspace.default.surgf_clips WHERE source = 'annotation' AND label = 'clipper' ORDER BY case_id, start_sec LIMIT 3` returns `VID01 674–690`, `698–747`, `749–753`. The check query at the end of import_clips.sql returns nothing because it filters on `clip applier` (see open question 1). Workspace: Personal Compute policy allows `g4dn.xlarge` (T4); no cluster launched | Backend: query `workspace.default.surgf_clips` by label (use dataset labels like `clipper`, `grasper`). Frontend and Data: playable `.mp4` for VID01, then verify 674 s against playback |
| Backend | Teammate 1 (proposed) | pending confirmation | API and SQL connection unverified | Return the shared clip result from /search |
| Data and ML | Teammate 2 (proposed) | pending confirmation | Playable footage, label alignment, and feature batch unverified | Share one verified clip and a reloadable SurgVLP feature batch |
| Frontend | Teammate 3 (proposed) | pending confirmation | Playback and seek unverified | Open the correct case at a result timestamp |

## Repository workflow

2026-11-14 (Shlok, `main`): reviewed all 14 Markdown files, pulled shared changes through `1d54791` with `git pull --ff-only`, and reconciled the local agent workflow instructions. `git diff --check` and a local Markdown link-target check passed. No repository sync blockers remain; application blockers and lane handoffs below are unchanged. Next: teammates pull `main` before continuing.

## Open questions and proposals (not decided)

1. **Label names:** the dataset uses `clipper`, but the fixture and the import_clips.sql check query use `clip applier`. Pick one before demo queries are written.
2. **No video files:** HF `Voxel51/cholect50` has 1 fps PNG frames only. Playable `.mp4` files for the demo cases must be stitched from frames (frame N = second N) and hosted where the player can load them. Frontend and Data decide where. **Update 2026-11-14:** `VID01.mp4` is built (854x480, 1 fps, 28:54, 113 MB, every frame a keyframe for exact seeks). It exists only on Aadhitya's machine and is not hosted yet. Build any case with `python3 ml/make_case_video.py samples.json VID01 out_dir/`, which downloads about 865 MB of frames per case.
3. **Timebase: verified for VID01 (2026-11-14, Aadhitya).** `ml/make_case_video.py` builds a 1 fps video, so second N is frame N. Frame 680 extracted from VID01.mp4 matches `000680.png` at 46 dB PSNR versus 20 dB for `000679.png`. Visually, second 680 shows a clip applier and a grasper (labels `clipper` and `grasper`), and second 100 shows a grasper and a hook (labels `grasper` and `hook`). Other cases use the same script, so the same mapping applies.
4. **Proposal: run SurgVLP extraction in Databricks** on a single-node `g4dn.xlarge` ML GPU cluster with 30-minute auto-terminate, writing bundles straight to the Volume. This would reverse the "extraction off Databricks" part of the 2026-11-14 decision. Untested: cluster launch, AWS quota, pip install from GitHub, HF download. The cluster costs money while running. Needs agreement from Aadhitya and the ML owner.
5. **Shared branch agreed (2026-11-14):** Aadhitya and the ML owner work together on branch `ml-dev`. **Proposed work split:** After the import, Aadhitya builds the demo videos and the Databricks training notebook with MLflow. The ML owner sets up SurgVLP and extracts features. Needs agreement from the ML owner.

Replace proposed owners with names when confirmed. At each handoff, update your row with status, a verified command or PR link, blockers, and the next step. Keep teammates' entries when resolving conflicts.
