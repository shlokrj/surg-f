# Surg+F progress

## Current milestone

Agent kit prepared and Markdown links checked. The first integration target is **one real annotated CholecT50 clip returned by Databricks SQL and opened at the correct timestamp**. Implementation status and teammate assignments below are unverified until each owner checks in.

| Lane | Owner | Status | Verified evidence or blocker | Next handoff |
|---|---|---|---|---|
| Databricks | Shlok, Aadhitya | in progress | Setup SQL, shared fixture, and staging import prepared. 2026-11-14 (Aadhitya): team warehouse connection verified with `SELECT current_catalog(), current_schema()` via the SQL Statement API, which returned `workspace`, `default`. `surgf_clips` not created yet. Real data pending | Run setup.sql in `workspace.default`, then share `workspace.default.surgf_clips` and the fixture query with backend |
| Backend | Teammate 1 (proposed) | pending confirmation | API and SQL connection unverified | Return the shared clip result from /search |
| Data and ML | Teammate 2 (proposed) | pending confirmation | Playable footage, label alignment, and feature batch unverified | Share one verified clip and a reloadable SurgVLP feature batch |
| Frontend | Teammate 3 (proposed) | pending confirmation | Playback and seek unverified | Open the correct case at a result timestamp |

Replace proposed owners with names when confirmed. At each handoff, update your row with status, a verified command or PR link, blockers, and the next step. Keep teammates' entries when resolving conflicts.
