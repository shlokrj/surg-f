# Databricks notebook source
from pathlib import Path
import json
import sys
import tempfile
import shutil
import mlflow

for name in ['module_dir', 'experiment_path', 'source_revision', 'model_run_id', 'case_id', 'diagnostic']:
    dbutils.widgets.text(name, '')
ml_dir = Path(dbutils.widgets.get('module_dir'))
sys.path.insert(0, str(ml_dir))
from review_prediction_errors import review
from extract_features import sha256

model_run_id = dbutils.widgets.get('model_run_id')
case_id = dbutils.widgets.get('case_id')
model_dir = Path(mlflow.artifacts.download_artifacts(run_id=model_run_id, artifact_path='baseline'))
experiment = dbutils.widgets.get('experiment_path')
if not experiment.startswith('/Users/'):
    raise ValueError('explicit user experiment required')
mlflow.set_experiment(experiment)
with tempfile.TemporaryDirectory(prefix='surgf-review-') as tmp:
    output = Path(tmp) / 'review.csv'
    summary = review(model_dir, Path('/Volumes/workspace/default/surgf/features') / case_id,
                     json.loads((ml_dir / 'case_split.json').read_text()), output,
                     diagnostic=dbutils.widgets.get('diagnostic') == 'true')
    with mlflow.start_run(run_name=f'error-review-{case_id}', tags={'mlflow.parentRunId': model_run_id}) as run:
        mlflow.log_params({'case_id': case_id, 'model_run_id': model_run_id,
                          'partition': summary['partition'], 'source_revision': dbutils.widgets.get('source_revision')})
        mlflow.log_metric('review_rows', summary['rows'])
        mlflow.log_artifacts(tmp, artifact_path='review')
        destination = Path('/Volumes/workspace/default/surgf/reviews') / run.info.run_id
        destination.mkdir(parents=True, exist_ok=False)
        for source in [output, output.with_suffix('.json')]:
            target = destination / source.name
            shutil.copyfile(source, target)
            if sha256(source) != sha256(target):
                raise RuntimeError('review readback checksum mismatch')
        summary.update(review_run_id=run.info.run_id, destination=str(destination))
dbutils.notebook.exit(json.dumps(summary))
