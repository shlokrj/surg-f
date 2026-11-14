# ML workflow

Shlok owns SurgVLP features, classifier training, and MLflow. Aadhitya owns videos, prediction export/import, and clip-level evaluation. Shlok also owns annotation coverage analysis and the fixed surgery-level split. Start with the [assigned parallel tasks](PROGRESS.md#assigned-parallel-work-2026-11-14), which list file ownership, dependencies, and completion criteria. See [progress](PROGRESS.md). Work on `ml-dev`; push to `main` only when Shlok requests it.

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
