# Databricks notebook source
# MAGIC %md
# MAGIC # Export and evaluate tool-clip predictions for one held-out case
# MAGIC Loads the classifier from a training run's MLflow artifacts, predicts clips on a complete Volume
# MAGIC bundle, scores them against the bundle's annotations, and logs everything as a child MLflow run of
# MAGIC the training run. The CSV is also written to the Volume for `scripts/clips_job.py run --csv`.

# COMMAND ----------
from pathlib import Path
import csv
import json
import sys

import mlflow

for name in ['module_dir', 'experiment_path', 'source_revision', 'model_run_id', 'case_id', 'iou']:
    dbutils.widgets.text(name, '')
ml_dir = Path(dbutils.widgets.get('module_dir'))
if not (ml_dir / 'export_predictions.py').is_file():
    raise RuntimeError('Set module_dir to the absolute workspace snapshot path')
sys.path.insert(0, str(ml_dir))
from evaluate_clips import evaluate
from export_predictions import predict_clips

model_run_id, case_id = dbutils.widgets.get('model_run_id'), dbutils.widgets.get('case_id')
iou = float(dbutils.widgets.get('iou') or 0.5)
experiment_path = dbutils.widgets.get('experiment_path')
if not experiment_path.startswith('/Users/'):
    raise ValueError('Use an explicit user-owned MLflow experiment path')
mlflow.set_experiment(experiment_path)
bundle = Path('/Volumes/workspace/default/surgf/features') / case_id
model_dir = Path(mlflow.artifacts.download_artifacts(run_id=model_run_id, artifact_path='baseline'))
model_report = json.loads((model_dir / 'metrics.json').read_text())

with mlflow.start_run(run_name=f'clips-{case_id}', tags={'mlflow.parentRunId': model_run_id}) as run:
    rows = predict_clips(model_dir, bundle)  # refuses training cases
    destination = Path('/Volumes/workspace/default/surgf/predictions') / model_run_id / f'{case_id}.csv'
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        raise FileExistsError(f'{destination} already exists; it may already be imported')
    with destination.open('w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['case_id', 'start_sec', 'end_sec', 'label', 'source'])
        writer.writerows(rows)
    report = evaluate(destination, bundle, iou)
    report.update(model_run_id=model_run_id, prediction_csv=str(destination), prediction_rows=len(rows))
    mlflow.log_params({'case_id': case_id, 'model_run_id': model_run_id, 'iou_threshold': iou,
                      'frame_threshold': model_report['threshold'], 'matching': report['matching'],
                      'source_revision': dbutils.widgets.get('source_revision')})
    for tool, values in report['tools'].items():
        mlflow.log_metrics({f'{tool}_event_{k}': v for k, v in values.items() if v is not None})
    mlflow.log_metrics({'prediction_rows': len(rows), 'unknown_frames': report['unknown_frames']})
    mlflow.log_artifact(str(destination), artifact_path='clips')
    mlflow.log_dict(report, 'clips/evaluation.json')
    report['mlflow_run_id'] = run.info.run_id
print(json.dumps(report, indent=2))
dbutils.notebook.exit(json.dumps(report))
