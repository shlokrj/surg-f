"""Export and evaluate predicted clips for one held-out case on Databricks serverless CPU.

Loads the model from a training MLflow run and logs results as its child run. Then import with
  python scripts/clips_job.py run --csv /Volumes/workspace/default/surgf/predictions/<MODEL_RUN>/<CASE>.csv
Usage: python scripts/export_databricks_clips.py --model-run-id 54659bc6... --case-id VID02 [--iou 0.5]
       [--smoothing 0:1,1:2,2:2,3:3]   # max_gap:min_len sweep, one MLflow child run and CSV per setting
"""
import argparse
import json
import subprocess

from databricks.sdk.service.compute import Environment
from databricks.sdk.service.jobs import JobEnvironment, NotebookTask, Source, SubmitTask
from databricks.sdk.service.workspace import ImportFormat, Language
from run_databricks_features import ROOT, client, snapshot

FILES = ['ml/export_evaluate_databricks.py', 'ml/export_predictions.py', 'ml/evaluate_clips.py',
         'ml/extract_features.py', 'databricks/make_clips_csv.py',
         'ml/train_multilabel.py', 'ml/train_tools.py']  # MLP export reuses with_context


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--model-run-id', required=True)
    parser.add_argument('--case-id', required=True)
    parser.add_argument('--iou', default='0.5')
    parser.add_argument('--smoothing', default='0:1', help='comma list of max_gap:min_len (seconds); 0:1 = unsmoothed')
    args = parser.parse_args()
    for s in args.smoothing.split(','):  # fail here, not after a Databricks job starts
        max_gap, min_len = (int(v) for v in s.split(':'))
        if max_gap < 0 or min_len < 1:
            parser.error(f'bad smoothing setting {s}: need max_gap >= 0 and min_len >= 1')
    w = client()
    revision, remote = snapshot(w)
    w.workspace.mkdirs(remote)
    for path in FILES:
        name = path.rsplit('/', 1)[1]
        notebook = name == 'export_evaluate_databricks.py'
        content = subprocess.check_output(['git', 'show', f'{revision}:{path}'], cwd=ROOT)
        w.workspace.upload(remote + '/' + (name.removesuffix('.py') if notebook else name), content,
                           format=ImportFormat.SOURCE if notebook else ImportFormat.RAW,
                           language=Language.PYTHON if notebook else None, overwrite=True)
    owner = w.current_user.me().user_name
    response = w.jobs.submit(
        run_name=f'surg-f-clips-{args.case_id}-{revision[:7]}', timeout_seconds=1200,
        environments=[JobEnvironment(environment_key='export', spec=Environment(
            base_environment='workspace-base-environments/databricks_ml_v6', dependencies=['ijson==3.6.0']))],
        tasks=[SubmitTask(task_key='export', environment_key='export', max_retries=0,
                          notebook_task=NotebookTask(notebook_path=remote + '/export_evaluate_databricks',
                              source=Source.WORKSPACE, base_parameters={
                                  'module_dir': '/Workspace' + remote,
                                  'experiment_path': f'/Users/{owner}/surg-f-tool-baseline',
                                  'source_revision': revision, 'model_run_id': args.model_run_id,
                                  'case_id': args.case_id, 'iou': args.iou,
                                  'smoothing': args.smoothing}))],
    ).response
    print(json.dumps({'run_id': response.run_id, 'revision': revision,
                      'url': w.jobs.get_run(response.run_id).run_page_url}, indent=2))


if __name__ == '__main__':
    main()
