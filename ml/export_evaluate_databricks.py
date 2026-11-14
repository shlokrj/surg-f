# Databricks notebook source
# MAGIC %md
# MAGIC # Export and evaluate tool-clip predictions for one held-out case
# MAGIC Loads the classifier from a training run's MLflow artifacts, predicts clips on a complete Volume
# MAGIC bundle, scores them against the bundle's annotations, and logs everything as a child MLflow run of
# MAGIC the training run. The CSV is also written to the Volume for `scripts/clips_job.py run --csv`.
# MAGIC `smoothing` is a comma list of `max_gap:min_len` settings (default `0:1` = unsmoothed). Each setting
# MAGIC gets its own child run and CSV, so a sweep on one validation case is a single job.

# COMMAND ----------
from pathlib import Path
import csv
import json
import sys

import mlflow

for name in ['module_dir', 'experiment_path', 'source_revision', 'model_run_id', 'case_id', 'iou', 'smoothing']:
    dbutils.widgets.text(name, '')
ml_dir = Path(dbutils.widgets.get('module_dir'))
if not (ml_dir / 'export_predictions.py').is_file():
    raise RuntimeError('Set module_dir to the absolute workspace snapshot path')
sys.path.insert(0, str(ml_dir))
from evaluate_clips import evaluate
from export_predictions import predict_clips

model_run_id, case_id = dbutils.widgets.get('model_run_id'), dbutils.widgets.get('case_id')
iou = float(dbutils.widgets.get('iou') or 0.5)
settings = [tuple(int(v) for v in s.split(':')) for s in (dbutils.widgets.get('smoothing') or '0:1').split(',')]
experiment_path = dbutils.widgets.get('experiment_path')
if not experiment_path.startswith('/Users/'):
    raise ValueError('Use an explicit user-owned MLflow experiment path')
mlflow.set_experiment(experiment_path)
bundle = Path('/Volumes/workspace/default/surgf/features') / case_id
model_dir = Path(mlflow.artifacts.download_artifacts(run_id=model_run_id, artifact_path='baseline'))
model_report = json.loads((model_dir / 'metrics.json').read_text())

out_dir = Path('/Volumes/workspace/default/surgf/predictions') / model_run_id
def destination_for(max_gap, min_len):  # unsmoothed keeps the original <CASE>.csv name
    return out_dir / (f'{case_id}.csv' if (max_gap, min_len) == (0, 1) else f'{case_id}-gap{max_gap}-min{min_len}.csv')
existing = [str(destination_for(*s)) for s in settings if destination_for(*s).exists()]
if existing:  # check before any work so a sweep never half-runs
    raise FileExistsError(f'{existing} already exist; they may already be imported')
out_dir.mkdir(parents=True, exist_ok=True)

reports = {}
for max_gap, min_len in settings:
    with mlflow.start_run(run_name=f'clips-{case_id}-gap{max_gap}-min{min_len}',
                          tags={'mlflow.parentRunId': model_run_id}) as run:
        rows = predict_clips(model_dir, bundle, max_gap, min_len)  # refuses training cases
        destination = destination_for(max_gap, min_len)
        with destination.open('w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['case_id', 'start_sec', 'end_sec', 'label', 'source'])
            writer.writerows(rows)
        report = evaluate(destination, bundle, iou)
        report.update(model_run_id=model_run_id, prediction_csv=str(destination), prediction_rows=len(rows),
                      max_gap_sec=max_gap, min_clip_sec=min_len)
        mlflow.log_params({'case_id': case_id, 'model_run_id': model_run_id, 'iou_threshold': iou,
                          'frame_threshold': model_report['threshold'], 'matching': report['matching'],
                          'max_gap_sec': max_gap, 'min_clip_sec': min_len,
                          'source_revision': dbutils.widgets.get('source_revision')})
        for tool, values in report['tools'].items():
            mlflow.log_metrics({f'{tool}_event_{k}': v for k, v in values.items() if v is not None})
        f1s = [v['f1'] for v in report['tools'].values() if v['f1'] is not None]
        if f1s:
            mlflow.log_metric('macro_event_f1', sum(f1s) / len(f1s))
        mlflow.log_metrics({'prediction_rows': len(rows), 'unknown_frames': report['unknown_frames']})
        mlflow.log_artifact(str(destination), artifact_path='clips')
        mlflow.log_dict(report, 'clips/evaluation.json')
        report['mlflow_run_id'] = run.info.run_id
    reports[f'{max_gap}:{min_len}'] = report
print(json.dumps(reports, indent=2))
dbutils.notebook.exit(json.dumps(reports))
