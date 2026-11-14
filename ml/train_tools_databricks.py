# Databricks notebook source
# MAGIC %md
# MAGIC # Tool-presence baseline on cached SurgVLP features
# MAGIC CPU training uses VID01 and holds out VID02. No test-case threshold tuning.
# MAGIC Complete validated bundles must already exist in the shared Volume.

# COMMAND ----------
from pathlib import Path
import json
import sys
import time
import tempfile
import shutil

import mlflow

dbutils.widgets.text('module_dir', '')
dbutils.widgets.text('experiment_path', '')
dbutils.widgets.text('source_revision', '')
dbutils.widgets.text('split_json', '')
dbutils.widgets.text('validation_only', 'false')
ml_dir = Path(dbutils.widgets.get('module_dir'))
if not (ml_dir / 'train_tools.py').is_file():
    raise RuntimeError('Set module_dir to the absolute workspace snapshot path')
sys.path.insert(0, str(ml_dir))
from train_tools import fit_baseline, fit_selected, validate_split

experiment_path = dbutils.widgets.get('experiment_path')
if not experiment_path.startswith('/Users/'):
    raise ValueError('Use an explicit user-owned MLflow experiment path')
mlflow.set_experiment(experiment_path)
features_root = Path('/Volumes/workspace/default/surgf/features')
started = time.perf_counter()
split_text = dbutils.widgets.get('split_json')
split = validate_split(json.loads(split_text)) if split_text else None
validation_only = dbutils.widgets.get('validation_only') == 'true'
if validation_only and not split:
    raise ValueError('validation_only requires a split')
with mlflow.start_run(run_name=split['name'] if split else 'vid01-train-vid02-test') as run:
    local_output = Path(tempfile.mkdtemp(prefix='surgf-train-')) / 'baseline'
    report = (fit_selected(features_root, split, local_output, validation_only=validation_only) if split
              else fit_baseline(features_root, ['VID01'], ['VID02'], local_output))
    mlflow.log_params({'train_cases': ','.join(report['train_cases']), 'test_cases': ','.join(report['test_cases']),
                      'validation_cases': ','.join(report.get('validation_cases', [])), 'threshold': 0.5,
                      'checkpoint_sha256': report['checkpoint_sha256'],
                      'source_revision': dbutils.widgets.get('source_revision'),
                      'preprocessing': json.dumps(report['preprocessing']),
                      'classifier': 'standard_scaler_logistic_regression', 'C': 1.0,
                      'class_weight': str(report['class_weight']), 'random_state': 0})
    mlflow.log_param('evaluation_partition', report.get('evaluation_partition', 'test'))
    if split:
        mlflow.log_params({'selected_weighting': report['selected_weighting'],
                          'selection_metric': report['selection_metric'],
                          'final_test_evaluated': report['final_test_evaluated']})
        mlflow.log_metrics({f'validation_macro_f1_{name}': value
                           for name, value in report['validation_macro_f1'].items()})
    for tool, values in report['tools'].items():
        for metric in ['precision', 'recall', 'f1', 'average_precision']:
            if values.get(metric) is not None:
                mlflow.log_metric(f'{tool}_{metric}', values[metric])
    mlflow.log_metrics({'train_frames': report['train_frames'], 'test_frames': report['test_frames'],
                       'training_seconds': time.perf_counter() - started})
    report['mlflow_run_id'] = run.info.run_id
    report['source_revision'] = dbutils.widgets.get('source_revision')
    (local_output / 'metrics.json').write_text(json.dumps(report, indent=2) + '\n')
    # The joblib file contains the fitted pipelines and is logged with their metrics.
    mlflow.log_artifacts(str(local_output), artifact_path='baseline')
    destination = Path('/Volumes/workspace/default/surgf/models/tool-presence') / run.info.run_id
    destination.mkdir(parents=True, exist_ok=False)
    for name in ['tool_classifiers.joblib', 'metrics.json']:
        shutil.copyfile(local_output / name, destination / name)
        from extract_features import sha256
        if sha256(local_output / name) != sha256(destination / name):
            raise RuntimeError('Model artifact readback checksum mismatch')
    report['destination'] = str(destination)
print(json.dumps(report, indent=2))
dbutils.notebook.exit(json.dumps(report))
