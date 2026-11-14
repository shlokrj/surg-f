# Surg+F progress

## Current milestone

Agent kit prepared and Markdown links checked. The first integration target is **one real annotated CholecT50 clip returned by Databricks SQL and opened at the correct timestamp**. Implementation status and teammate assignments below are unverified until each owner checks in.

| Lane | Owner | Status | Verified evidence or blocker | Next handoff |
|---|---|---|---|---|
| Databricks | Shlok, Aadhitya | in progress | 2026-11-14 (Aadhitya): ran setup.sql. `workspace.default.surgf_clips` is live and returns the `fixture_01` row. Built the clip CSV with `python3 databricks/make_clips_csv.py samples.json clips.csv`, using labels only from HF `Voxel51/cholect50` `samples.json`: 3620 instrument clips over 50 videos (VID01 to VID96). Open issues: (1) the dataset label is `clipper`, not `clip applier` as used in the fixture and in the import_clips.sql check query; (2) the HF dataset has 1 fps PNG frames only and no video files, so playable videos must be built from the frames; (3) frame_number is assumed to equal seconds, which is unverified against playback | Aadhitya: upload clips.csv as `surgf_clip_staging` and run import_clips.sql. Frontend and Data: decide how to get playable video per case_id. Created Volume `workspace.default.surgf` for ML feature bundles (see DECISIONS.md, 2026-11-14) |
| Backend | Teammate 1 (proposed) | pending confirmation | API and SQL connection unverified | Return the shared clip result from /search |
| Data and ML | Teammate 2 (proposed) | pending confirmation | Playable footage, label alignment, and feature batch unverified | Share one verified clip and a reloadable SurgVLP feature batch |
| Frontend | Teammate 3 (proposed) | pending confirmation | Playback and seek unverified | Open the correct case at a result timestamp |

Replace proposed owners with names when confirmed. At each handoff, update your row with status, a verified command or PR link, blockers, and the next step. Keep teammates' entries when resolving conflicts.
