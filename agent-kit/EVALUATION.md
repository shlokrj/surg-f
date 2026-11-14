# Evaluation and judging

- Verify one real annotation, then search across at least two cases. Check switching videos, seeking to the expected time, and an empty result.
- For model evaluation, split by surgery before fitting or threshold tuning. Start with tool presence and record which cases, checkpoint, and thresholds you used.
- Label expected time ranges for a handful of demo questions. Count a hit when a top-three result is from an expected case and overlaps an accepted time range. Log the query count and misses alongside the score.
- Demo search to playback first. Then show the Delta row, the Lakeflow run and MLflow run if implemented, and the annotation versus prediction view if ready.
