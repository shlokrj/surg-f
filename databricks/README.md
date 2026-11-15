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

## Quiz facts for Lil Doc (Genie)

[quiz_facts.sql](quiz_facts.sql) creates `workspace.default.surgf_steps` (Cholec80 steps for VID01 and VID02, from `backend/fixtures/steps.*.json`), the `workspace.default.surgf_clock(seconds)` m:ss function and the `workspace.default.surgf_quiz_facts` view: one row per fact (`case_id, fact_type, subject, position, fact, start_sec, end_sec`) covering each step and each instrument's usage and last appearance, from `annotation` rows only. Safe to rerun. Add the view, the steps table and the function to the Genie space; [quiz_example.sql](quiz_example.sql) is the trusted example quiz query whose columns match the backend `study_quiz` contract.

## Stage 3: video localization

Spatial outputs are not stored in SQL tables. Training data, checkpoints and exports for the anatomy detector live in the `surgf` Volume under `localization/`, written by `scripts/run_databricks_anatomy.py`; `surgf_clips` stays temporal clip rows only.

See [Stage 3 localization plan](../ml/LOCALIZATION_PLAN.md) for the complete context and primary sources.
