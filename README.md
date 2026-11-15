# Surg+F

Search surgical videos and jump to the matching clip.

| Part | What it does |
|---|---|
| Frontend | Shows search results and seeks the player to the clip start. |
| Backend | Queries Databricks SQL and returns results from `GET /search`. |
| Databricks | Stores searchable clip intervals in a Delta table. |
| ML | Extracts SurgVLP features and exports tool predictions. |
| Shared | Holds the [example API response](shared/search.fixture.json). |

Dataset annotations and model predictions use the same clip fields. The case ID picks the video and the start time tells the player where to jump.

## First integration check

1. Run [setup.sql](databricks/setup.sql) in your team catalog and schema. It creates the clip table and returns one fixture row.
2. Use the shared response to connect the frontend and backend while data is pending.
3. Once a teammate verifies a playable case and its timestamps, load a real annotation and check that search opens the correct video at the correct time.

See the [agent kit](agent-kit/README.md) for the spec and [team progress](agent-kit/PROGRESS.md) for handoffs.

## Stage 3: video localization (experimental)

**Status (2026-11-15): live and experimental.** VID01 shows anatomy boxes (gallbladder, cystic duct) every 0.24 s from a Faster R-CNN trained on Endoscapes (v3, native resolution; validation AP 0.384). No instrument or liver boxes, no tracking, no action links. VID01 accuracy itself is unmeasured (review deferred). Instrument boxes and supported action-triplet associations remain future work.

See [Stage 3 localization plan](ml/LOCALIZATION_PLAN.md) for the complete context and primary sources.
