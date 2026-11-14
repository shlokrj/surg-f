# Surg+F MVP

Search gallbladder surgery footage and click a result to jump to the matching moment. First milestone is one verified CholecT50 result served by Databricks SQL and opened at the correct playback time. Expand to two cases after that works.

## Workflow

- Dataset annotations → timestamped clip intervals → Delta table → backend search → frontend player.
- In parallel, extract and cache SurgVLP frame features off Databricks, on a GPU machine. Upload the feature bundles to the `/Volumes/workspace/default/surgf/features/` Volume. Train the tool-presence classifier in a Databricks notebook and log each run in MLflow. Export predictions through the same clip index flow.
- Once live SQL search works, add a Lakeflow job to rebuild the index and log search Hit@3 in MLflow. AI Search and full action triplets are stretch goals.

## Shared contracts

A search hit has `case_id`, `start_sec`, `end_sec`, `label`, and `source`. The frontend resolves case IDs to playable assets. Times are numeric seconds relative to that asset, with an exclusive end. Sources are `annotation`, `prediction`, or `fixture` for test rows only.

Each feature bundle contains a NumPy matrix and an ordered manifest with `case_id` and `frame_id` for every row. Join labels by both IDs. Keep all frames from one surgery in the same training or evaluation split. Tool presence supports a tool query. A specific action on an anatomical target requires the full matching triplet.
