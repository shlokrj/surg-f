"""Generate frame-error review artifacts on Databricks without changing search data."""
import argparse
import json
import subprocess

from databricks.sdk.service.compute import Environment
from databricks.sdk.service.jobs import JobEnvironment, NotebookTask, Source, SubmitTask
from databricks.sdk.service.workspace import ImportFormat, Language
from run_databricks_features import ROOT, client, snapshot

FILES = ['ml/review_errors_databricks.py', 'ml/review_prediction_errors.py', 'ml/extract_features.py', 'ml/case_split.json']


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--model-run-id', required=True)
    parser.add_argument('--case-id', required=True)
    parser.add_argument('--diagnostic', action='store_true', help='Explicitly permit diagnostic VID02')
    args = parser.parse_args()
    import re
    if not re.fullmatch(r'VID\d+', args.case_id) or not re.fullmatch(r'[a-f0-9]{32}', args.model_run_id):
        parser.error('expected a case ID and a 32-character MLflow run ID')
    w = client()
    revision, remote = snapshot(w)
    w.workspace.mkdirs(remote)
    for path in FILES:
        name = path.rsplit('/', 1)[1]
        notebook = name == 'review_errors_databricks.py'
        content = subprocess.check_output(['git', 'show', f'{revision}:{path}'], cwd=ROOT)
        w.workspace.upload(remote + '/' + (name.removesuffix('.py') if notebook else name), content,
                           format=ImportFormat.SOURCE if notebook else ImportFormat.RAW,
                           language=Language.PYTHON if notebook else None, overwrite=True)
    owner = w.current_user.me().user_name
    response = w.jobs.submit(
        run_name=f'surg-f-review-{args.case_id}-{revision[:7]}', timeout_seconds=1200,
        environments=[JobEnvironment(environment_key='export', spec=Environment(
            base_environment='workspace-base-environments/databricks_ml_v6', dependencies=['ijson==3.6.0']))],
        tasks=[SubmitTask(task_key='export', environment_key='export', max_retries=0,
                          notebook_task=NotebookTask(notebook_path=remote + '/review_errors_databricks',
                              source=Source.WORKSPACE, base_parameters={
                                  'module_dir': '/Workspace' + remote,
                                  'experiment_path': f'/Users/{owner}/surg-f-tool-baseline',
                                  'source_revision': revision, 'model_run_id': args.model_run_id,
                                  'case_id': args.case_id, 'diagnostic': str(args.diagnostic).lower()}))],
    ).response
    print(json.dumps({'run_id': response.run_id, 'revision': revision,
                      'url': w.jobs.get_run(response.run_id).run_page_url}, indent=2))


if __name__ == '__main__':
    main()
