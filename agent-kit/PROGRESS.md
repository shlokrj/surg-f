# Surg+F progress

## Current milestone

Agent kit prepared and Markdown links checked. The first integration target is **one real annotated CholecT50 clip returned by Databricks SQL and opened at the correct timestamp**. Implementation status and teammate assignments below are unverified until each owner checks in.

| Lane | Owner | Status | Verified evidence or blocker | Next handoff |
|---|---|---|---|---|
| Databricks | Shlok, Aadhitya | in progress | 2026-11-14 (Aadhitya): `workspace.default.surgf_clips` is live and returns the `fixture_01` row. `workspace.default.surgf` Volume created for feature bundles. `clips.csv` built locally with `python3 databricks/make_clips_csv.py samples.json clips.csv`: 3620 instrument clips over 50 videos. Not yet uploaded or imported. Workspace check: user is admin; the Personal Compute policy allows `g4dn.xlarge` (T4 GPU). No cluster has been launched | Aadhitya: upload clips.csv as `surgf_clip_staging`, run import_clips.sql, and record row counts. Backend: query `workspace.default.surgf_clips` by label |
| Backend | Teammate 1 (proposed) | pending confirmation | API and SQL connection unverified | Return the shared clip result from /search |
| Data and ML | Teammate 2 (proposed) | pending confirmation | Playable footage, label alignment, and feature batch unverified | Share one verified clip and a reloadable SurgVLP feature batch |
| Frontend | Teammate 3 (proposed) | pending confirmation | Playback and seek unverified | Open the correct case at a result timestamp |

## Open questions and proposals (not decided)

1. **Label names:** the dataset uses `clipper`, but the fixture and the import_clips.sql check query use `clip applier`. Pick one before demo queries are written.
2. **No video files:** HF `Voxel51/cholect50` has 1 fps PNG frames only. Playable `.mp4` files for the demo cases must be stitched from frames (frame N = second N) and hosted where the player can load them. Frontend and Data decide where.
3. **Timebase:** frame_number = seconds is assumed and unverified against playback.
4. **Proposal: run SurgVLP extraction in Databricks** on a single-node `g4dn.xlarge` ML GPU cluster with 30-minute auto-terminate, writing bundles straight to the Volume. This would reverse the "extraction off Databricks" part of the 2026-11-14 decision. Untested: cluster launch, AWS quota, pip install from GitHub, HF download. The cluster costs money while running. Needs agreement from Aadhitya and the ML owner.
5. **Shared branch agreed (2026-11-14):** Aadhitya and the ML owner work together on branch `ml-dev`. **Proposed work split:** After the import, Aadhitya builds the demo videos and the Databricks training notebook with MLflow. The ML owner sets up SurgVLP and extracts features. Needs agreement from the ML owner.

Replace proposed owners with names when confirmed. At each handoff, update your row with status, a verified command or PR link, blockers, and the next step. Keep teammates' entries when resolving conflicts.
