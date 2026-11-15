-- Example Genie quiz query (trusted SQL in the Lil Doc space). Output matches the backend study_quiz contract.
WITH f AS (SELECT * FROM workspace.default.surgf_quiz_facts WHERE case_id = 'VID01')
SELECT 1 AS question_number, 'When does the clip applier first appear in this video?' AS question,
       workspace.default.surgf_clock(start_sec) AS answer, fact AS explanation,
       'data' AS source, case_id, start_sec, end_sec
FROM f WHERE fact_type = 'instrument_usage' AND subject = 'clipper'
UNION ALL
SELECT 2, 'Which instrument is on screen for the longest total time?', subject, fact,
       'data', case_id, start_sec, end_sec
FROM f WHERE fact_type = 'instrument_usage' AND position = 1
UNION ALL
SELECT 3, 'Which step of the operation comes right after Calot\'s triangle dissection?', subject, fact,
       'data', case_id, start_sec, end_sec
FROM f WHERE fact_type = 'step' AND position = 3
UNION ALL
SELECT 4, 'What is the L-hook mainly used for in a cholecystectomy?', 'Dissection with electrocautery',
       'It carries current to cut and coagulate tissue while separating the gallbladder from the liver bed.',
       'general', CAST(NULL AS STRING), CAST(NULL AS DOUBLE), CAST(NULL AS DOUBLE)
UNION ALL
SELECT 5, 'Which two structures are clipped and divided before the gallbladder is removed?',
       'The cystic duct and cystic artery',
       'Both run through the hepatocystic triangle, and clipping them first prevents bile leakage and bleeding.',
       'general', CAST(NULL AS STRING), CAST(NULL AS DOUBLE), CAST(NULL AS DOUBLE)
ORDER BY question_number
