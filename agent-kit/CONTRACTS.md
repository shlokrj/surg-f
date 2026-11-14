# Shared interfaces

Initial search API: `GET /search?q=clipper`. Return an object with a `results` array, including an empty array for no match.

```json
{"results":[{"case_id":"case_01","start_sec":30,"end_sec":35,"label":"clipper","source":"fixture"}]}
```

Use the same keys in Delta, API responses, and frontend fixtures. Resolve case IDs to video assets through a shared case manifest. Verify the annotation timebase against actual playback. Keep fixture rows out of judging queries. Omit missing labels from the index; missing annotations do not establish a negative example.

For ML, keep one feature bundle per case, with a matrix of shape [frames, features] and a manifest in matching row order. Record the checkpoint and preprocessing. Join each row to its annotation by case ID and frame ID. Upload each bundle to `/Volumes/workspace/default/surgf/features/<case_id>/`, as `features.npy` plus `manifest.csv` with columns `case_id,frame_id`. Use the CholecT50 `video_id` (for example `VID01`) as `case_id` and `frame_number` (1 fps, seconds) as `frame_id`. Log each training run in MLflow with the SurgVLP checkpoint, preprocessing, train and test case IDs, threshold, and per-tool metrics. Export predictions with the same clip fields and source set to prediction.

## Planned stage 3: video localization

No spatial API is agreed or implemented yet. The stage-3 plan proposes frame/time identity, video asset version, normalized source-image boxes, category/instance IDs, model scores and provenance, with optional later action relations. Treat that schema as a proposal; keep existing search fields and source semantics intact.

See [Stage 3 localization plan](../ml/LOCALIZATION_PLAN.md) for the complete context and primary sources.
