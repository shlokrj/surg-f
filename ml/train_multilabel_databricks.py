# Databricks notebook source
# MAGIC %md
# MAGIC # 29-label neural network (instruments, verbs, targets) on cached SurgVLP features
# MAGIC Config and per-label thresholds are chosen on validation surgeries; test is read only when `final=true`.

# COMMAND ----------
from pathlib import Path
import json
import shutil
import sys
import tempfile
import time

import mlflow

for name in ['module_dir', 'experiment_path', 'source_revision', 'split_json']:
    dbutils.widgets.text(name, '')
dbutils.widgets.text('final', 'false')
ml_dir = Path(dbutils.widgets.get('module_dir'))
sys.path.insert(0, str(ml_dir))
from extract_features import sha256
from train_multilabel import run

labels_path = Path('/Volumes/workspace/default/surgf/labels/labels_v1.json')
features_root = Path('/Volumes/workspace/default/surgf/features')
split = json.loads(dbutils.widgets.get('split_json'))
final = dbutils.widgets.get('final') == 'true'
mlflow.set_experiment(dbutils.widgets.get('experiment_path'))
started = time.perf_counter()
with mlflow.start_run(run_name=f"multilabel-mlp-{split['name']}-{'final' if final else 'validation'}") as mlrun:
    local = Path(tempfile.mkdtemp(prefix='surgf-mlp-')) / 'model'
    report = run(features_root, labels_path, split, local, final=final)
    mlflow.log_params({'model': 'mlp', 'split': split['name'], 'labels': len(report['labels']),
                       'window': report['selected']['window'], 'hidden': report['selected']['hidden'],
                       'final_test_used': final, 'source_revision': dbutils.widgets.get('source_revision'),
                       'labels_sha256': sha256(labels_path), 'train_cases': ','.join(split['train']),
                       'validation_cases': ','.join(split['validation']),
                       'test_cases': ','.join(split['test']) if final else ''})
    for c in report['candidates']:
        mlflow.log_metric(f"validation_macro_f1_window{c['config']['window']}", c['validation_macro_f1'])
    mlflow.log_metric('validation_macro_f1', report['validation']['macro_f1'])
    for part in ['validation', 'test'] if final else ['validation']:
        if part == 'test':
            mlflow.log_metric('test_macro_f1', report['test']['macro_f1'])
        for label, m in report[part]['labels'].items():
            mlflow.log_metric(f"{part}_{label.replace(':', '_')}_f1", m['f1'])
    mlflow.log_metrics({'train_frames': report['train_frames'], 'training_seconds': time.perf_counter() - started})
    mlflow.log_artifacts(str(local), artifact_path='multilabel')
    destination = Path('/Volumes/workspace/default/surgf/models/multilabel') / mlrun.info.run_id
    destination.mkdir(parents=True, exist_ok=False)
    for name in ['multilabel_mlp.joblib', 'metrics.json', 'comparison.md']:
        shutil.copyfile(local / name, destination / name)
        if sha256(local / name) != sha256(destination / name):
            raise RuntimeError('artifact readback checksum mismatch')
    summary = {'mlflow_run_id': mlrun.info.run_id, 'destination': str(destination), 'selected': report['selected'],
               'candidates': report['candidates'], 'validation_macro_f1': report['validation']['macro_f1'],
               'test_macro_f1': report['test']['macro_f1'] if final else None,
               'f1': {part: {k: round(v['f1'], 3) for k, v in report[part]['labels'].items()}
                      for part in (['validation', 'test'] if final else ['validation'])}}
dbutils.notebook.exit(json.dumps(summary))
