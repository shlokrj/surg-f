"""Run the fixed VID01/VID02 classifier baseline on Databricks serverless CPU."""
import argparse
import json
import subprocess

from databricks.sdk.service.compute import Environment
from databricks.sdk.service.jobs import JobEnvironment, NotebookTask, Source, SubmitTask
from databricks.sdk.service.workspace import ImportFormat, Language
from run_databricks_features import ROOT, client, snapshot


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--split", help="Committed split JSON path, e.g. ml/case_split.json; omit for smoke baseline")
    args = parser.parse_args()
    w = client()
    revision, remote = snapshot(w)
    w.workspace.mkdirs(remote)
    for name in ['train_tools.py', 'train_tools_databricks.py', 'extract_features.py']:
        notebook = name == 'train_tools_databricks.py'
        content = subprocess.check_output(['git', 'show', f'{revision}:ml/{name}'], cwd=ROOT)
        w.workspace.upload(remote + '/' + (name.removesuffix('.py') if notebook else name), content,
                           format=ImportFormat.SOURCE if notebook else ImportFormat.RAW,
                           language=Language.PYTHON if notebook else None, overwrite=True)
    split_json = subprocess.check_output(['git', 'show', f'{revision}:{args.split}'], cwd=ROOT, text=True) if args.split else ''
    if split_json:
        import sys
        sys.path.insert(0, str(ROOT / 'ml'))
        from train_tools import validate_split
        validate_split(json.loads(split_json))
    owner = w.current_user.me().user_name
    response = w.jobs.submit(
        run_name=f'surg-f-tool-baseline-{revision[:7]}', timeout_seconds=1200,
        environments=[JobEnvironment(environment_key='training', spec=Environment(
            base_environment='workspace-base-environments/databricks_ml_v6', dependencies=['ijson==3.6.0']))],
        tasks=[SubmitTask(task_key='train', environment_key='training', max_retries=0,
                          notebook_task=NotebookTask(notebook_path=remote + '/train_tools_databricks',
                              source=Source.WORKSPACE, base_parameters={
                                  'module_dir': '/Workspace' + remote,
                                  'experiment_path': f'/Users/{owner}/surg-f-tool-baseline',
                                  'source_revision': revision, 'split_json': split_json}))],
    ).response
    print(json.dumps({'run_id': response.run_id, 'revision': revision,
                      'url': w.jobs.get_run(response.run_id).run_page_url}, indent=2))


if __name__ == '__main__':
    main()
