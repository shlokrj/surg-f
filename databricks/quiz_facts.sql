-- Quiz facts for the Lil Doc Genie space. Run in workspace.default after import_clips.sql.
-- Steps come from backend/fixtures/steps.*.json (Cholec80 phases, VID01 and VID02 only);
-- regenerate the VALUES below if those files change. Safe to rerun.

CREATE OR REPLACE FUNCTION workspace.default.surgf_clock(s DOUBLE)
RETURNS STRING
COMMENT 'Seconds as m:ss, e.g. 674 -> 11:14.'
RETURN concat(CAST(FLOOR(s / 60) AS STRING), ':', lpad(CAST(CAST(FLOOR(s % 60) AS INT) AS STRING), 2, '0'));

CREATE OR REPLACE TABLE workspace.default.surgf_steps (
  case_id STRING, step_order INT, step_key STRING, step_label STRING, start_sec DOUBLE, end_sec DOUBLE
) COMMENT 'Surgical steps (Cholec80 phases) per video, in time order, without gaps.';

INSERT INTO workspace.default.surgf_steps VALUES
  ('VID01', 1, 'Preparation', 'Preparation', 0.0, 21.0),
  ('VID01', 2, 'CalotTriangleDissection', 'Calot\'s triangle dissection', 21.0, 673.0),
  ('VID01', 3, 'ClippingCutting', 'Clipping and cutting', 673.0, 887.0),
  ('VID01', 4, 'GallbladderDissection', 'Gallbladder dissection', 887.0, 1470.0),
  ('VID01', 5, 'GallbladderPackaging', 'Gallbladder packaging', 1470.0, 1568.0),
  ('VID01', 6, 'CleaningCoagulation', 'Cleaning and coagulation', 1568.0, 1641.0),
  ('VID01', 7, 'GallbladderRetraction', 'Gallbladder removal', 1641.0, 1733.04),
  ('VID02', 1, 'Preparation', 'Preparation', 0.0, 481.0),
  ('VID02', 2, 'CalotTriangleDissection', 'Calot\'s triangle dissection', 481.0, 1253.0),
  ('VID02', 3, 'ClippingCutting', 'Clipping and cutting', 1253.0, 1581.0),
  ('VID02', 4, 'GallbladderDissection', 'Gallbladder dissection', 1581.0, 2537.0),
  ('VID02', 5, 'GallbladderPackaging', 'Gallbladder packaging', 2537.0, 2598.0),
  ('VID02', 6, 'CleaningCoagulation', 'Cleaning and coagulation', 2598.0, 2779.0),
  ('VID02', 7, 'GallbladderRetraction', 'Gallbladder removal', 2779.0, 2839.04);

CREATE OR REPLACE VIEW workspace.default.surgf_quiz_facts
COMMENT 'One row per quiz-ready fact about a video: steps and instrument usage from annotation rows. position = step order for step rows, rank by total time (1 = longest) for instrument rows. Use fact for wording and explanations, start_sec/end_sec for show-in-video.'
AS
WITH tools AS (
  SELECT case_id, label, start_sec, end_sec
  FROM workspace.default.surgf_clips
  WHERE source = 'annotation'
    AND label IN ('grasper', 'hook', 'irrigator', 'bipolar', 'clipper', 'scissors')
),
usage AS (
  SELECT case_id, label, COUNT(*) AS n, SUM(end_sec - start_sec) AS total_sec,
         MIN(start_sec) AS first_start, MIN_BY(end_sec, start_sec) AS first_end,
         MAX(start_sec) AS last_start, MAX_BY(end_sec, start_sec) AS last_end
  FROM tools GROUP BY case_id, label
),
ranked AS (
  SELECT *, RANK() OVER (PARTITION BY case_id ORDER BY total_sec DESC) AS time_rank,
         COUNT(*) OVER (PARTITION BY case_id) AS n_tools
  FROM usage
),
step_tools AS (
  SELECT s.case_id, s.step_order, s.step_label, s.start_sec, s.end_sec,
         COUNT(*) OVER (PARTITION BY s.case_id) AS n_steps,
         array_join(array_sort(collect_set(t.label)), ', ') AS tools_seen
  FROM workspace.default.surgf_steps s
  LEFT JOIN tools t
    ON t.case_id = s.case_id AND t.start_sec < s.end_sec AND s.start_sec < t.end_sec
  GROUP BY s.case_id, s.step_order, s.step_label, s.start_sec, s.end_sec
)
SELECT case_id, 'step' AS fact_type, step_label AS subject, step_order AS position,
       concat('Step ', step_order, ' of ', n_steps, ' is ', step_label, ', from ',
              workspace.default.surgf_clock(start_sec), ' to ', workspace.default.surgf_clock(end_sec),
              '. Instruments seen during it: ', coalesce(nullif(tools_seen, ''), 'none'), '.') AS fact,
       start_sec, end_sec
FROM step_tools
UNION ALL
SELECT case_id, 'instrument_usage', label, CAST(time_rank AS INT),
       concat('The ', label, ' is visible ', n, CASE WHEN n = 1 THEN ' time, ' ELSE ' times, ' END,
              workspace.default.surgf_clock(total_sec), ' in total (', time_rank, ' of ', n_tools,
              ' instruments by total time). It first appears at ',
              workspace.default.surgf_clock(first_start), '-', workspace.default.surgf_clock(first_end), '.'),
       first_start, first_end
FROM ranked
UNION ALL
SELECT case_id, 'instrument_last', label, CAST(time_rank AS INT),
       concat('The ', label, ' is last visible at ', workspace.default.surgf_clock(last_start), '-',
              workspace.default.surgf_clock(last_end), '.'),
       last_start, last_end
FROM ranked;
