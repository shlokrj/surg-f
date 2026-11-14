# Import clips

1. Run [setup.sql](setup.sql) in your team's Databricks catalog and schema.
2. Ask the data owner for clip intervals with this CSV header:

   ```csv
   case_id,start_sec,end_sec,label,source
   ```

   Use seconds relative to the playable video. Use `annotation` for dataset labels and `prediction` for model output. Confirm one timestamp against playback before importing.
3. Upload the CSV as a table named `surgf_clip_staging` in the same catalog and schema. Run [import_clips.sql](import_clips.sql). It skips invalid intervals and inserts each valid clip once. Compare the staging rows with the imported rows before handing off the table.
4. Confirm the final query returns the expected clip. Change the label filter if your verified sample uses a different label. Share the full table name and the verified timestamp with the backend and frontend owners.
