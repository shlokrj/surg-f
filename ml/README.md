# ML workflow

Shlok owns SurgVLP features, classifier training, and MLflow (**Aadhitya is running the expanded retrain while Shlok is away, from 2026-11-14 ~16:45 for about 1 h**). Aadhitya owns videos, prediction export/import, and clip-level evaluation. Shlok also owns annotation coverage analysis and the fixed surgery-level split. Start with the [assigned parallel tasks](PROGRESS.md#assigned-parallel-work-2026-11-14), which list file ownership, dependencies, and completion criteria. See [progress](PROGRESS.md). Work on `ml-dev`; push to `main` only when Shlok requests it.

Full extraction and training run on **Databricks serverless CPU**. Classic GPU creation is blocked by workspace provisioning, and the serverless GPU probe did not execute. CPU is sufficient for the first two demo cases; revisit GPU for larger runs.

## Run extraction

From the repository root, activate the local environment used to submit jobs:

```sh
source ~/madhacks2026/.venv-surgf/bin/activate
pip install databricks-sdk python-dotenv
python scripts/check_databricks_auth.py
python scripts/gpu_run.py start --case-id VID01 --cpu --timeout-min 15
python scripts/run_databricks_features.py status RUN_ID
python scripts/gpu_run.py start --case-id VID01 --cpu --full-case \
  --smoke-run-id RUN_ID --timeout-min 30
```

Use the successful smoke run ID in the full-run command. Keep the Git revision unchanged between them. Repeat for VID02. The launcher uploads only committed code to an isolated workspace snapshot, uses managed ML v6 plus ijson 3.6.0, and requires the same case, device, and code revision for smoke and full runs. Each run has a timeout; no persistent cluster is created.

The notebook uses absolute workspace module paths and temporary storage on Databricks. It reports model loading, extraction, asset download, frame download, and overall notebook timing. Existing complete Volume bundles are validated and preserved; incomplete or incompatible destinations require review.

Authentication comes from the Git-ignored repo-root `.env`: `DATABRICKS_SERVER_HOSTNAME` (or full HTTPS `DATABRICKS_HOST`) and `DATABRICKS_TOKEN`. The SQL HTTP path is not needed for job submission. The existing team token belongs to Aadhitya. Keep `.env` permissions at 0600 and never commit it.

## Verify the uploaded features

```sh
python scripts/verify_databricks_features.py --case-id VID01 \
  --samples ~/madhacks2026/data/cholect50/samples.json
```

This downloads a temporary verification copy and checks hashes, frame coverage, and source annotation joins. It does not run extraction locally or alter the Volume.

| Case | Full feature matrix | Extraction time | Notebook time | Status |
|---|---|---|---|---|
| VID01 | 1,734 x 768 | 263.91 s | 382.92 s | Uploaded and independently verified |
| VID02 | 2,840 x 768 | 429.60 s | 580.45 s | Uploaded and independently verified |

## Train the classifier

After both complete bundles pass validation:

```sh
python scripts/train_databricks_tools.py
```

The 20-minute-capped Databricks CPU job trains per-tool logistic regressions on VID01 and holds out VID02. Scaling is fitted only on training frames; the threshold is fixed at 0.5. Missing annotations are excluded. Tools without both training classes are marked not trained.

Parameters, per-tool precision/recall/F1/average precision, and fitted classifier artifacts are logged to MLflow. A checksum-verified copy is stored at `/Volumes/workspace/default/surgf/models/tool-presence/<mlflow-run-id>/`. The report records package versions and feature hashes. Use the same environment when loading the joblib artifact.

Verified run: [MLflow results](https://dbc-48252777-1798.cloud.databricks.com/?o=7474644357435752#mlflow/experiments/1933783029716480/runs/54659bc60d734052927dadf80ea16e13). Training took 16.43 s. F1 was grasper 0.721, hook 0.618, irrigator 0.308, clipper 0.154, bipolar 0.125, and scissors 0.000. Load the artifact using Databricks ML v6: NumPy 2.3.4, scikit-learn 1.7.2, joblib 1.5.2.

This is a two-case engineering baseline, not a reliable estimate across surgeries. It does not tune on the test case or insert predictions into the live search table. Aadhitya owns the next step using [export_predictions.py](export_predictions.py).

## Expanded training

The frozen split is [case_split.json](case_split.json); VID02 remains diagnostic. [tool_coverage.json](tool_coverage.json) records annotation coverage for all cases. Reproduce it with:

```sh
python ml/audit_tool_coverage.py --samples ~/madhacks2026/data/cholect50/samples.json --output ml/tool_coverage.json
python scripts/train_databricks_tools.py --split ml/case_split.json
```

The expanded run chooses balanced or unweighted training by validation macro F1, then evaluates the final test once. Threshold remains 0.5. All required bundles must exist and pass validation. Use the existing ML v6 environment to load the saved model; its format remains compatible with prediction export.

For assigned extractions, `scripts/process_ml_cases.py --cases VID04 VID05 --samples PATH --state PATH_OUTSIDE_GIT` processes cases serially, keeps a fixed code revision, and saves run IDs plus independent verification results. Resume with the same arguments. A failed job stops for review.

## Clip export and smoothing (Aadhitya)

The model labels each second independently, so its output flickers. `smooth()` in [export_predictions.py](export_predictions.py) first fills off-gaps of up to `max_gap` seconds between predicted clips, then drops clips shorter than `min_len` seconds. `0:1` leaves clips unchanged. One serverless CPU job (ML v6) sweeps several settings on one case:

```sh
python scripts/export_databricks_clips.py --model-run-id <TRAINING_RUN> --case-id <VALIDATION_CASE> --smoothing 0:1,1:1,2:2,3:3,5:3
```

Each setting becomes its own **MLflow child run** of the training run, named `clips-<CASE>-gap<G>-min<M>`. It logs params `max_gap_sec` and `min_clip_sec`, metrics `<tool>_event_*` and `macro_event_f1`, and artifacts `clips/`. Each setting also writes a CSV to `/Volumes/workspace/default/surgf/predictions/<TRAINING_RUN>/<CASE>-gap<G>-min<M>.csv`; `0:1` keeps the name `<CASE>.csv`. Existing CSVs are never overwritten. Choose the setting by `macro_event_f1` across the **validation** cases only, then import just that setting's CSVs with `scripts/clips_job.py run --csv`.

## Feature contract

Each `/Volumes/workspace/default/surgf/features/<case_id>/` bundle contains:

- `features.npy`: raw projected float32 `[frames,768]` features.
- `manifest.csv`: exactly `case_id,frame_id`, in feature-row order.
- `annotations.json`: aligned instrument labels; missing annotations stay `null`.
- `metadata.json`: checkpoint/input hashes, model revision, preprocessing, versions, timing, completeness, and file checksums.

The image branch follows [official SurgVLP source](https://github.com/CAMMA-public/SurgVLP/tree/85e858998eec47614614b89f6af1363e0ad3f47b): ResNet-50 plus the learned 2,048-to-768 projection, with strict official checkpoint loading and no random-weight fallback. Preprocessing is RGB, resize to 360x640, center crop 224, and ImageNet mean/std normalization. Features are not L2-normalized. Local parity testing matched the official encoder and preprocessing exactly on VID01 frame 680.

Checkpoint SHA-256: `4db3eb9dc53aa46f69a8adaeffa115fa75c9a15c08e60638011b812a6b128b3d`. Asset preparation verifies weights and labels before extraction. Validation rejects partial cases, incorrect IDs, mismatched labels, bad hashes, and nonfinite or zero feature rows. Publication refuses overwrites and checks readback. No source frames are deleted automatically.

## Local checks

Local tests use synthetic data and previously downloaded labels. Full extraction stays on Databricks.

```sh
pip install -r ml/requirements.txt
pip install scikit-learn==1.6.1 scipy==1.15.3
python -m unittest discover -s ml -p 'test_*.py' -v
python -m unittest discover -s scripts -p 'test_*.py' -v
```

References: [shared contract](../agent-kit/CONTRACTS.md), [serverless environments](https://docs.databricks.com/aws/en/compute/serverless/dependencies), [SDK authentication](https://docs.databricks.com/aws/en/dev-tools/sdk-python).

## Audit annotation coverage

Run without downloading frames or starting Databricks jobs:

```sh
python ml/audit_tool_coverage.py --samples ~/madhacks2026/data/cholect50/samples.json \
  --split ml/case_split.json --output ml/tool_coverage.json
```

The saved report includes source SHA-256, per-case counts, dataset totals, and counts for each split. Positive coverage is reported both as frames and surgeries. Missing/null instruments are unknown; an empty classifications list is a known negative. Counts cover observed samples only and do not infer labels for absent frame IDs. Duplicate frames, invalid labels, empty input, overlapping splits and unavailable cases fail validation. This project reserves the previously inspected VID02 for diagnostics.

The fixed split has 12 training, 3 validation, 4 final-test surgeries and diagnostic VID02. Keep membership unchanged during model comparisons. Coverage establishes label availability, not independent-frame sample size or model quality. Use validation for model selection; the other training workstream owns execution.

## Check readiness before expanded training

From the repo root with its existing `.env`, run this read-only check:

```sh
python scripts/check_training_readiness.py --databricks --output /tmp/surgf-training-readiness.json
```

It downloads one bundle at a time into temporary storage, validates full-case coverage and file checksums, checks instrument labels and compatible checkpoint/preprocessing/source provenance, and reports all missing or invalid cases. It excludes the diagnostic partition and starts no compute jobs. Exit code 0 means every required bundle passed; 1 means blockers remain. The report also flags tools without both training classes, which the classifier cannot fit. Availability is a snapshot: rerun after extraction finishes.

For an independent source annotation join, add `--samples path/to/samples.json`. Without it, only internal bundle integrity and recorded source provenance are checked. For already mounted/local bundles, omit `--databricks` and use `--features-root /path/to/features`. The training notebook still validates its inputs; this report does not replace those checks.

## Compare models without evaluating the final test set

Check only the bundles needed for model selection first (exit 1 means blockers remain):

```sh
python scripts/check_training_readiness.py --databricks --validation-only --output /tmp/surgf-validation-readiness.json
```

Once training and validation bundles are available, run:

```sh
python scripts/train_databricks_tools.py --split ml/case_split.json --validation-only
```

This compares balanced and unweighted logistic regression on validation macro F1, keeps the threshold at 0.5, and saves the selected candidate model without reading final-test bundles. Ties select balanced weighting. `metrics.json` records both validation scores, per-tool metrics, package versions and bundle hashes, plus `evaluation_partition=validation` and `final_test_evaluated=false`. MLflow records the selection scores and partition. The existing artifact keys `test_cases` and `test_frames` describe the evaluated partition; in this mode they contain validation cases/frames. Read `evaluation_partition` when interpreting results.

After model choices are fixed and all required bundles pass readiness, omit `--validation-only` for the final evaluation. That command repeats the same deterministic comparison and evaluates the selected setting on the final-test partition. It does not enforce a global one-run limit; do not change choices based on final-test results or repeatedly use that command for experimentation. The original two-case smoke command remains unchanged.

## Per-surgery comparison reports

New training runs save `comparison.md` beside `metrics.json` and `tool_classifiers.joblib`, both in MLflow artifacts and the model Volume directory. The table shows each validation candidate's per-tool F1 and positive/known-frame support for each surgery. `metrics.json` includes confusion counts, precision, recall and AP under `case_metrics`; selection runs retain both candidates under `validation_case_metrics` and their pooled reference metrics under `validation_baselines`.

Reference baselines predict always absent or use the constant positive prevalence calculated only from training labels. Probabilities are thresholded at 0.5, including ties. Missing annotations are excluded. Precision/recall/F1 with zero denominators are recorded as 0; AP is null for single-class evaluation labels. A tool without both training classes has null model metrics, not a zero-quality fitted model. Reference metrics remain available. These reports do not change the existing pooled validation macro-F1 selection criterion.

For final-evaluation runs, the Markdown candidate table remains validation-only; final-test per-surgery results are in `case_metrics` in JSON. Older saved runs are not backfilled. See the [reporting and error-review assignments](PROGRESS.md#reporting-and-error-review-assignments-2026-11-14) for Aadhitya's next task and the handoff.

## Generate timestamp error-review files

```sh
python scripts/review_databricks_errors.py --model-run-id MODEL_RUN_ID --case-id VID15
# Existing baseline diagnostics only:
python scripts/review_databricks_errors.py --model-run-id 54659bc60d734052927dadf80ea16e13 --case-id VID02 --diagnostic
```

The runner downloads the model from MLflow inside Databricks ML v6, creates up to 20 rows per tool/error type, and saves `review.csv` plus `review.json` in a child MLflow run and `/Volumes/workspace/default/surgf/reviews/<review-run-id>/`. Readback hashes are checked. CSV columns include case, tool, frame/second, expected label, probability, threshold, error type, model run and partition. The sidecar records total error counts before sampling, unknown-frame count, provenance and `visually_reviewed=false`.

Training/final-test cases are rejected; VID02 requires `--diagnostic`. Only known labels are reviewed. Chronologically spaced sampling is reproducible, not an unbiased estimate of model quality. Review rows describe raw frame decisions before smoothing and must not be imported into the clip search table. Local/mounted use: `python ml/review_prediction_errors.py MODEL_DIR BUNDLE_DIR review.csv --split ml/case_split.json` (use the model's package versions).

## Select smoothing across validation surgeries

After the validation model is available, run the same predeclared sweep on VID15, VID25 and VID26 with `scripts/export_databricks_clips.py`. Download each new child run's `clips/evaluation.json` from MLflow (use unique local filenames), or save each notebook's complete sweep-result JSON. Then run:

```sh
python ml/select_smoothing.py /path/to/validation-results/*.json \
  --split ml/case_split.json --settings 0:1,1:1,2:2,3:3,5:3,10:5 \
  --output /tmp/smoothing-selection.json
```

This writes a ranked Markdown table and a JSON decision with input hashes, model/code/bundle provenance, per-case/per-tool scores and the fixed split. Every requested setting must have exactly one result for every validation surgery. Diagnostic/final-test cases, incomplete sweeps, changed annotations, mixed models/code/thresholds and duplicate results are rejected. Existing output files are not overwritten.

Selection averages event F1 over all six tools (no-event tools score zero), then equally across validation surgeries. This fixed-denominator criterion is recorded in advance and differs from the older `macro_event_f1`, which averages only defined values. New sweep runs also log `six_tool_macro_event_f1` to MLflow. Ties choose smaller gap, then smaller minimum length. Record the resulting setting before final-test export; do not tune against final-test or VID02 diagnostic results. Historical reports without model split and provenance fields cannot be used by this selector; new runs capture those fields.

## Prediction export integrity

Clip export requires model and bundle checkpoint, preprocessing and source-label provenance to match. It also checks the saved model threshold against `metrics.json`, binary class order, recognized tools, and finite normalized probabilities. A mismatch fails before any clip CSV is written. Use the model and complete feature bundles from the same verified pipeline; do not remove provenance fields to make an old artifact pass. Smoothing accepts integer gap/length settings and sorted nonempty intervals.
