-- Select the team's writable catalog and schema in the SQL editor first.
CREATE TABLE IF NOT EXISTS surgf_clips (
  case_id STRING NOT NULL,
  start_sec DOUBLE NOT NULL,
  end_sec DOUBLE NOT NULL,
  label STRING NOT NULL,
  source STRING NOT NULL
) USING DELTA;

-- Add a single test clip. Rerunning setup does not duplicate it.
MERGE INTO surgf_clips AS clips
USING (
  SELECT 'fixture_01' AS case_id, CAST(30 AS DOUBLE) AS start_sec,
         CAST(35 AS DOUBLE) AS end_sec, 'clip applier' AS label,
         'fixture' AS source
) AS sample
ON clips.case_id = sample.case_id
   AND clips.start_sec = sample.start_sec
   AND clips.end_sec = sample.end_sec
   AND clips.label = sample.label
   AND clips.source = sample.source
WHEN NOT MATCHED THEN INSERT *;

SELECT case_id, start_sec, end_sec, label, source
FROM surgf_clips
WHERE source = 'fixture' AND case_id = 'fixture_01';
