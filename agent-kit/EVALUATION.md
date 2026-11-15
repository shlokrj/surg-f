# Evaluation and judging

- Verify one real annotation, then search across at least two cases. Check switching videos, seeking to the expected time, and an empty result.
- For model evaluation, split by surgery before fitting or threshold tuning. Start with tool presence and record which cases, checkpoint, and thresholds you used.
- Label expected time ranges for a handful of demo questions. Count a hit when a top-three result is from an expected case and overlaps an accepted time range. Log the query count and misses alongside the score.
- Demo search to playback first. Then show the Delta row, the Lakeflow run and MLflow run if implemented, and the annotation versus prediction view if ready.

## Stage 3: anatomy localization

**How it is evaluated.** Detector quality is measured on the official Endoscapes validation split (409 images, surgeries 121–161), which is surgery-disjoint from the 1,212 training images (surgeries 1–120) and checked against our CholecT50 protected splits with the published CAMMA overlap map. Metrics: category-scoped COCO AP/AP50 (`ml/localization/evaluate_anatomy_coco.py`) and fixed-threshold precision/recall at IoU 0.5 with error breakdown (`analyze_anatomy_errors.py`). Thresholds are chosen on that same validation split, so operating-point numbers are optimistic; there is no untouched test split.

| Model (validation) | AP | AP50 | Cystic duct AP50 | Gallbladder AP50 | Status |
|---|---|---|---|---|---|
| v1, 320 px, epoch 3 | 0.345 | 0.633 | 0.321 | 0.945 | replaced |
| v2, 320 px, epoch 7 | 0.352 | 0.665 | 0.396 | 0.934 | replaced |
| **v3, native 854×480 + flips, best epoch** | **0.384** | **0.715** | **0.491** | 0.940 | **live on VID01** |

At the deployed thresholds, v3 is cystic duct precision 0.69 / recall 0.39 (≥ 0.50) and gallbladder 0.93 / 0.93 (≥ 0.65). Reports: `ml/localization/anatomy_full_v1_errors.json`, `anatomy_full_v2_errors.json`, `anatomy_hires_v3_errors.json`.

**What is not verified.** No accuracy on VID01 (Cholec80 footage, a different source than Endoscapes): the 60-frame review pack and automated scoring exist (`review_session.py`), but the labeling was deferred. A 32-frame proxy (does a duct box appear inside CholecT50 cystic-duct intervals) gave v2 18/32 and v3 17/32 at its best threshold, 12/32 at the deployed one; it measures presence, not box accuracy. No instrument or liver boxes, tracking or action links are evaluated because none exist. Player behavior (seek, playback, resize, fullscreen, case switch) is verified in Chrome.

See [Stage 3 localization plan](../ml/LOCALIZATION_PLAN.md) for the complete context and primary sources.
