# Surg+F MVP

Search gallbladder surgery footage and click a result to jump to the matching moment. First milestone is one verified CholecT50 result served by Databricks SQL and opened at the correct playback time. Expand to two cases after that works.

## Workflow

- Dataset annotations → timestamped clip intervals → Delta table → backend search → frontend player.
- In parallel, extract and cache SurgVLP frame features on Databricks serverless CPU for the first demo cases (approved by Shlok on 2026-11-14; GPU remains an option for later scaling). Write validated feature bundles to the `/Volumes/workspace/default/surgf/features/` Volume. Train the tool-presence classifier in a Databricks notebook and log each run in MLflow. Export predictions through the same clip index flow.
- Once live SQL search works, add a Lakeflow job to rebuild the index and log search Hit@3 in MLflow. AI Search remains a stretch goal. Spatial anatomy overlays (stage 3) are live as an experimental feature; action-triplet overlays remain future work.

## Shared contracts

A search hit has `case_id`, `start_sec`, `end_sec`, `label`, and `source`. The frontend resolves case IDs to playable assets. Times are numeric seconds relative to that asset, with an exclusive end. Sources are `annotation`, `prediction`, or `fixture` for test rows only.

Each feature bundle contains a NumPy matrix and an ordered manifest with `case_id` and `frame_id` for every row. Join labels by both IDs. Keep all frames from one surgery in the same training or evaluation split. Tool presence supports a tool query. A specific action on an anatomical target requires the full matching triplet.

## Stage 3: video localization

Optional spatial overlays for anatomy are live (experimental) through the static artifact in [CONTRACTS.md](CONTRACTS.md). **Status (2026-11-15): live and experimental.** VID01 shows anatomy boxes (gallbladder, cystic duct) every 0.24 s from a Faster R-CNN trained on Endoscapes (v3, native resolution; validation AP 0.384). No instrument or liver boxes, no tracking, no action links. VID01 accuracy itself is unmeasured (review deferred). Verbs stay linked as actions rather than standalone boxes; instrument boxes and triplet relations need box-level supervision that we do not have.

See [Stage 3 localization plan](../ml/LOCALIZATION_PLAN.md) for the complete context and primary sources.
