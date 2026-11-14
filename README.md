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

## Planned stage 3: video localization

Our planned third stage adds optional instrument/anatomy bounding boxes over video, followed by supported action-triplet associations. This is future work; the current pipeline supplies clip search and tool-presence predictions.

See [Stage 3 localization plan](ml/LOCALIZATION_PLAN.md) for the complete context and primary sources.
