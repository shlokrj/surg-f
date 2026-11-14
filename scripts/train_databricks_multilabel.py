"""Run the 29-label neural network (ml/train_multilabel.py) on Databricks serverless CPU, logged to MLflow.

  python scripts/train_databricks_multilabel.py            # validation only (no test bundles read)
  python scripts/train_databricks_multilabel.py --final    # also evaluate the test surgeries once
Needs /Volumes/workspace/default/surgf/labels/labels_v1.json (from ml/build_labels.py).
"""
import argparse
import json
import subprocess

from databricks.sdk.service.compute import Environment
from databricks.sdk.service.jobs import JobEnvironment, NotebookTask, Source, SubmitTask
from databricks.sdk.service.workspace import ImportFormat, Language

from run_databricks_features import ROOT, client, snapshot


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--final', action='store_true')
    p.add_argument('--split', default='ml/case_split.json')
    a = p.parse_args()
    w = client()
    revision, remote = snapshot(w)
    w.workspace.mkdirs(remote)
    for name in ['train_multilabel.py', 'train_multilabel_databricks.py', 'train_tools.py', 'extract_features.py']:
        notebook = name == 'train_multilabel_databricks.py'
        w.workspace.upload(remote + '/' + (name.removesuffix('.py') if notebook else name),
                           subprocess.check_output(['git', 'show', f'{revision}:ml/{name}'], cwd=ROOT),
                           format=ImportFormat.SOURCE if notebook else ImportFormat.RAW,
                           language=Language.PYTHON if notebook else None, overwrite=True)
    split_json = subprocess.check_output(['git', 'show', f'{revision}:{a.split}'], cwd=ROOT, text=True)
    owner = w.current_user.me().user_name
    run = w.jobs.submit(
        run_name=f'surg-f-multilabel-{"final" if a.final else "validation"}-{revision[:7]}', timeout_seconds=1800,
        environments=[JobEnvironment(environment_key='training', spec=Environment(
            base_environment='workspace-base-environments/databricks_ml_v6', dependencies=['ijson==3.6.0']))],
        tasks=[SubmitTask(task_key='train', environment_key='training', max_retries=0,
                          notebook_task=NotebookTask(notebook_path=remote + '/train_multilabel_databricks',
                              source=Source.WORKSPACE, base_parameters={
                                  'module_dir': '/Workspace' + remote,
                                  'experiment_path': f'/Users/{owner}/surg-f-tool-baseline',
                                  'source_revision': revision, 'split_json': split_json,
                                  'final': str(a.final).lower()}))],
    ).response
    print(json.dumps({'run_id': run.run_id, 'revision': revision, 'url': w.jobs.get_run(run.run_id).run_page_url}))


if __name__ == '__main__':
    main()
