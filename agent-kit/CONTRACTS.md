# Shared interfaces

Initial search API: `GET /search?q=clip%20applier`. Return an object with a `results` array, including an empty array for no match.

```json
{"results":[{"case_id":"case_01","start_sec":30,"end_sec":35,"label":"clip applier","source":"fixture"}]}
```

Use the same keys in Delta, API responses, and frontend fixtures. Resolve case IDs to video assets through a shared case manifest. Verify the annotation timebase against actual playback. Keep fixture rows out of judging queries. Omit missing labels from the index; missing annotations do not establish a negative example.

For ML, keep one feature bundle per case, with a matrix of shape [frames, features] and a manifest in matching row order. Record the checkpoint and preprocessing. Join each row to its annotation by case ID and frame ID. Export predictions with the same clip fields and source set to prediction.
