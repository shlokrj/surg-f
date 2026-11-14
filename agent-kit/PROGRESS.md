# Surg+F progress

## Current milestone

Agent kit prepared and Markdown links checked. The first integration target is **one real annotated CholecT50 clip returned by Databricks SQL and opened at the correct timestamp**. Implementation status and teammate assignments below are unverified until each owner checks in.

| Lane | Owner | Status | Verified evidence or blocker | Next handoff |
|---|---|---|---|---|
| Databricks | Shlok, Aadhitya | in progress | 2026-11-14 (Aadhitya): ran setup.sql in `workspace.default` on the team warehouse. Created `workspace.default.surgf_clips`; the MERGE inserted 1 row, and `SELECT case_id, start_sec, end_sec, label, source FROM workspace.default.surgf_clips WHERE source = 'fixture' AND case_id = 'fixture_01'` returned `fixture_01, 30.0, 35.0, clip applier, fixture`. Real annotation data pending | Backend: query `workspace.default.surgf_clips` by label and return the fixture row from /search. Aadhitya: build the clip CSV from CholecT50 labels for `surgf_clip_staging` (blocked: dataset not downloaded yet) |
| Backend | Teammate 1 (proposed) | pending confirmation | API and SQL connection unverified | Return the shared clip result from /search |
| Data and ML | Teammate 2 (proposed) | pending confirmation | Playable footage, label alignment, and feature batch unverified | Share one verified clip and a reloadable SurgVLP feature batch |
| Frontend | Teammate 3 (proposed) | pending confirmation | Playback and seek unverified | Open the correct case at a result timestamp |

Replace proposed owners with names when confirmed. At each handoff, update your row with status, a verified command or PR link, blockers, and the next step. Keep teammates' entries when resolving conflicts.
