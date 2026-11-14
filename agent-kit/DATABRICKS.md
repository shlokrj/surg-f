# Databricks setup and demo

1. Create one Unity Catalog Delta table for clip intervals. Use the fields in CONTRACTS.md. Commit the SQL source under databricks/ and record the deployed catalog.schema.table in progress.
2. Load two fixture rows. Run a parameterized label query through the backend and check the response. Keep warehouse credentials in backend environment variables.
3. Load verified annotation rows and check the jump against actual playback. Store the video wherever the demo player can access it.
4. Wrap the import and interval generation in an on-demand Lakeflow job. Verify that rerunning it does not duplicate clips.
5. Train the tool-presence classifier in a Databricks notebook on the feature bundles in `/Volumes/workspace/default/surgf/features/`, and log params, metrics, and the model in MLflow. SurgVLP extraction targets Databricks GPU, selected by Shlok on 2026-11-14. Use [the extraction notebook](../ml/extract_databricks.py); GPU execution and feature upload remain unverified.
6. Log how often a correct clip appears in the top three results in MLflow. Try a Delta Sync AI Search index only once the SQL path works.

## Where data lives

| Data | Location | Shared? |
|---|---|---|
| CholecT50 frames (63 GB) and labels (`samples.json`, about 500 MB) | Hugging Face `Voxel51/cholect50`. Download only what you need, outside the repo | Public |
| `clips.csv` (annotation intervals) | Generated locally by `databricks/make_clips_csv.py`. Rebuildable, so don't commit it | Local, temporary |
| Clip search table | `workspace.default.surgf_clips` | Team, via warehouse |
| Staging upload | `workspace.default.surgf_clip_staging` | Team |
| SurgVLP feature bundles | `/Volumes/workspace/default/surgf/features/<case_id>/` | Team |
| Classifier runs and model | MLflow in the team workspace | Team |
| Prediction clips | Same `surgf_clips` table, `source = prediction` | Team |
| Playable `.mp4` per case | 25 fps from Cholec80 via `ml/download_cholec80_video.py` (VID01–VID80), otherwise 1 fps via `ml/make_case_video.py`. Hosting not decided: wherever the frontend player can load it, never Git | Open |
| Code and docs | GitHub | Team |
| Credentials | Repo-root `.env`, git-ignored | Never shared in Git |
