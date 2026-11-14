# Import clips

Team target: `workspace.default.surgf_clips`. Connect with `DATABRICKS_SERVER_HOSTNAME`, `DATABRICKS_HTTP_PATH`, and `DATABRICKS_TOKEN` in a repo-root `.env`, which is git-ignored. Get the values from Aadhitya privately and never commit them.

1. Run [setup.sql](setup.sql) in your team's Databricks catalog and schema.
2. Ask the data owner for clip intervals with this CSV header:

   ```csv
   case_id,start_sec,end_sec,label,source
   ```

   Use seconds relative to the playable video. Use `annotation` for dataset labels and `prediction` for model output. Confirm one timestamp against playback before importing.
   For CholecT50, generate it yourself: download only `samples.json` (about 500 MB) from https://huggingface.co/datasets/Voxel51/cholect50 to a folder outside the repo, then run `python3 databricks/make_clips_csv.py path/to/samples.json clips.csv`. It writes one row per consecutive run of an instrument, with `case_id` = `VIDxx`, seconds = frame numbers (1 fps), and `source` = `annotation`.
3. Upload the CSV as a table named `surgf_clip_staging` in the same catalog and schema. Alternatively, upload the CSV to the `/Volumes/workspace/default/surgf/` Volume and create staging with `CREATE OR REPLACE TABLE surgf_clip_staging AS SELECT case_id, start_sec, end_sec, label, source FROM read_files('/Volumes/workspace/default/surgf/clips.csv', format => 'csv', header => true)`. Run [import_clips.sql](import_clips.sql). Or do both steps with the Lakeflow job: upload the CSV to the Volume, then run `python scripts/clips_job.py run --csv /Volumes/workspace/default/surgf/<file>.csv`. It skips invalid intervals and inserts each valid clip once. Compare the staging rows with the imported rows before handing off the table.
4. Confirm the final query returns the expected clip. Change the label filter if your verified sample uses a different label. Share the full table name and the verified timestamp with the backend and frontend owners.

## Planned stage 3: video localization

Future stage-3 spatial outputs need a separately agreed schema/storage path. The current import job remains for temporal clip rows only; do not encode boxes or instance relations into `label` or overload the clip CSV. Preserve model/video provenance for later overlay artifacts.

See [Stage 3 localization plan](../ml/LOCALIZATION_PLAN.md) for the complete context and primary sources.
