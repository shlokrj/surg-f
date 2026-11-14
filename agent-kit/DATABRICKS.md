# Databricks setup and demo

1. Create one Unity Catalog Delta table for clip intervals. Use the fields in CONTRACTS.md. Commit the SQL source under databricks/ and record the deployed catalog.schema.table in progress.
2. Load two fixture rows. Run a parameterized label query through the backend and check the response. Keep warehouse credentials in backend environment variables.
3. Load verified annotation rows and check the jump against actual playback. Store the video wherever the demo player can access it.
4. Wrap the import and interval generation in an on-demand Lakeflow job. Verify that rerunning it does not duplicate clips. **Done 2026-11-14:** Lakeflow job `surgf-import-clips` (job 330901174932700, on-demand, no schedule) runs on the team warehouse: `stage` (databricks/stage_clips.sql, CSV at the `csv_path` parameter → `surgf_clip_staging`) then `import` (databricks/import_clips.sql MERGE). Deploy or update it with `python scripts/clips_job.py deploy`. Run it with `python scripts/clips_job.py run [--csv /Volumes/.../file.csv]`. Runs 785799809999660 and 985194742586323 both succeeded in about 13 s. Each MERGE read 3620 source rows and inserted 0, the table stayed at 3620 annotation rows plus 1 fixture row, and a duplicate-key check returned 0. Interval generation (`make_clips_csv.py` / `export_predictions.py`) still runs before the job, because the job imports a ready CSV.
5. Train the tool-presence classifier in a Databricks notebook on the feature bundles in `/Volumes/workspace/default/surgf/features/`, and log params, metrics, and the model in MLflow. SurgVLP extraction now runs on Databricks serverless CPU. Use [the extraction notebook](../ml/extract_databricks.py) through the shared launcher; see [ML progress](../ml/PROGRESS.md) for verified feature uploads and timing.
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
| Playable `.mp4` per case | Built at 25 fps from Cholec80 with `ml/download_cholec80_video.py` (VID01–VID80), otherwise at 1 fps with `ml/make_case_video.py`. Shared copies live in `/Volumes/workspace/default/surgf/videos/<case_id>.mp4` (VID01, VID02). Pull them into `frontend/public/videos/` with `python scripts/fetch_videos.py VID01 VID02`. Never commit them to Git | Team |
| Code and docs | GitHub | Team |
| Credentials | Repo-root `.env`, git-ignored | Never shared in Git |
