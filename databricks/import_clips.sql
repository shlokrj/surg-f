-- Run setup.sql first. Import the clip CSV into surgf_clip_staging
-- in the same catalog and schema, keeping the five CSV column names.
MERGE INTO surgf_clips AS clips
USING (
  SELECT DISTINCT case_id, start_sec, end_sec, label, source
  FROM (
    SELECT trim(case_id) AS case_id,
           try_cast(start_sec AS DOUBLE) AS start_sec,
           try_cast(end_sec AS DOUBLE) AS end_sec,
           lower(trim(label)) AS label,
           lower(trim(source)) AS source
    FROM surgf_clip_staging
  )
  WHERE case_id <> '' AND label <> ''
    AND source IN ('annotation', 'prediction')
    AND start_sec >= 0 AND end_sec > start_sec
    AND end_sec < CAST('Infinity' AS DOUBLE)
) AS incoming
ON clips.case_id = incoming.case_id
   AND clips.start_sec = incoming.start_sec
   AND clips.end_sec = incoming.end_sec
   AND clips.label = incoming.label
   AND clips.source = incoming.source
WHEN NOT MATCHED THEN INSERT (case_id, start_sec, end_sec, label, source)
VALUES (incoming.case_id, incoming.start_sec, incoming.end_sec, incoming.label, incoming.source);

SELECT case_id, start_sec, end_sec, label, source
FROM surgf_clips
WHERE source = 'annotation' AND label = 'clip applier'
ORDER BY case_id, start_sec;
