"""Deploy a committed ML snapshot and submit one bounded extraction run.

Uses existing compute only. Defaults to smoke mode; --full-case requires a
successful smoke run ID on the same cluster and source revision.
"""
import argparse
import json
import re
import subprocess
from pathlib import Path

from databricks.sdk import WorkspaceClient
from databricks.sdk.core import Config
from databricks.sdk.service.jobs import NotebookTask, Source, SubmitTask
from databricks.sdk.service.workspace import ImportFormat, Language
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
FILES = ['extract_databricks.py', 'extract_features.py', 'prepare_assets.py',
         'publish_features.py', 'download_case.py']


def client():
    values = dotenv_values(ROOT / '.env')
    host = values.get('DATABRICKS_HOST') or 'https://' + values['DATABRICKS_SERVER_HOSTNAME']
    return WorkspaceClient(config=Config(host=host, token=values['DATABRICKS_TOKEN'], auth_type='pat',
                                         retry_timeout_seconds=20, http_timeout_seconds=30))


def validate_smoke(smoke, cluster_id, remote, case_id):
    task = next((t for t in smoke.tasks or [] if t.task_key == 'extract'), None)
    if (not task or not task.state or not task.state.result_state
            or task.state.result_state.value != 'SUCCESS'
            or task.existing_cluster_id != cluster_id or not task.notebook_task
            or task.notebook_task.notebook_path != remote + '/extract_databricks'
            or task.notebook_task.base_parameters != {'case_id': case_id, 'full_case': 'false'}):
        raise ValueError('smoke run must succeed for this case, cluster, and committed revision')


def snapshot(w):
    revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    owner = w.current_user.me().user_name
    return revision, f'/Users/{owner}/surg-f-ml/{revision}/ml'


def deploy(w, revision, remote):
    w.workspace.mkdirs(remote)
    for name in FILES:
        content = subprocess.check_output(['git', 'show', f'{revision}:ml/{name}'], cwd=ROOT)
        notebook = name == 'extract_databricks.py'
        w.workspace.upload(
            remote + '/' + (name.removesuffix('.py') if notebook else name), content,
            format=ImportFormat.SOURCE if notebook else ImportFormat.RAW,
            language=Language.PYTHON if notebook else None, overwrite=True,
        )
    return {'revision': revision, 'workspace_path': remote}


def submit(cluster_id, case_id, full_case=False, smoke_run_id=None):
    if not re.fullmatch(r'VID\d+', case_id):
        raise ValueError('case-id must be a CholecT50 VID number')
    w = client()
    revision, remote = snapshot(w)
    if full_case:
        if not smoke_run_id:
            raise ValueError('--full-case requires --smoke-run-id')
        validate_smoke(w.jobs.get_run(smoke_run_id), cluster_id, remote, case_id)
    deploy(w, revision, remote)
    response = w.jobs.submit(
        run_name=f'surg-f-{case_id}-{"full" if full_case else "smoke"}-{revision[:7]}',
        timeout_seconds=1800,
        tasks=[SubmitTask(task_key='extract', existing_cluster_id=cluster_id,
                          notebook_task=NotebookTask(notebook_path=remote + '/extract_databricks',
                                                     source=Source.WORKSPACE,
                                                     base_parameters={'case_id': case_id,
                                                                      'full_case': str(full_case).lower()}),
                          timeout_seconds=1200, max_retries=0)],
    ).response
    return {'run_id': response.run_id, 'cluster_id': cluster_id, 'revision': revision,
            'workspace_path': remote, 'case_id': case_id, 'full_case': full_case}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='action', required=True)
    run = sub.add_parser('submit')
    run.add_argument('--cluster-id', required=True)
    run.add_argument('--case-id', default='VID01')
    run.add_argument('--full-case', action='store_true')
    run.add_argument('--smoke-run-id', type=int)
    sub.add_parser('deploy', help='Upload committed code only; does not start compute')
    status = sub.add_parser('status')
    status.add_argument('run_id', type=int)
    args = vars(parser.parse_args())
    action = args.pop('action')
    if action == 'submit':
        print(json.dumps(submit(**args), indent=2))
    elif action == 'deploy':
        w = client()
        print(json.dumps(deploy(w, *snapshot(w)), indent=2))
    else:
        run = client().jobs.get_run(args['run_id'])
        print(json.dumps({'run_id': run.run_id, 'url': run.run_page_url,
                          'state': run.state.as_dict() if run.state else None,
                          'tasks': [{'run_id': t.run_id, 'state': t.state.as_dict() if t.state else None}
                                    for t in run.tasks or []]}, indent=2))


if __name__ == '__main__':
    main()
