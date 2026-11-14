-- Load a clip CSV from the Volume into surgf_clip_staging (step 1 of the surgf-import-clips job).
-- :csv_path is a job parameter, e.g. /Volumes/workspace/default/surgf/clips.csv
CREATE OR REPLACE TABLE workspace.default.surgf_clip_staging AS
SELECT case_id, start_sec, end_sec, label, source
FROM read_files(:csv_path, format => 'csv', header => true);

SELECT count(*) AS staged_rows FROM workspace.default.surgf_clip_staging;
