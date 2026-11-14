"""Create and run the on-demand Lakeflow job `surgf-import-clips` on the team SQL warehouse.

Task 1 runs databricks/stage_clips.sql (CSV in the Volume -> surgf_clip_staging); task 2 runs
databricks/import_clips.sql (MERGE into surgf_clips; reruns insert nothing). SQL comes from the
current Git commit. No schedule: it runs only when started.

  python scripts/clips_job.py deploy                       # create or update the job
  python scripts/clips_job.py run                          # import /Volumes/.../surgf/clips.csv
  python scripts/clips_job.py run --csv /Volumes/workspace/default/surgf/pred_VID02.csv
"""
import argparse
import subprocess

from databricks.sdk.service import jobs
from databricks.sdk.service.workspace import ImportFormat
from dotenv import dotenv_values

from run_databricks_features import ROOT, client

NAME = 'surgf-import-clips'
DEFAULT_CSV = '/Volumes/workspace/default/surgf/clips.csv'


def deploy(w):
    revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    remote = f'/Users/{w.current_user.me().user_name}/surg-f-sql/{revision}'
    w.workspace.mkdirs(remote)
    for name in ['stage_clips.sql', 'import_clips.sql']:
        w.workspace.upload(f'{remote}/{name}', subprocess.check_output(['git', 'show', f'{revision}:databricks/{name}'], cwd=ROOT),
                           format=ImportFormat.RAW, overwrite=True)
    warehouse = dotenv_values(ROOT / '.env')['DATABRICKS_HTTP_PATH'].rsplit('/', 1)[1]

    def task(key, file, after=None):
        return jobs.Task(task_key=key, depends_on=[jobs.TaskDependency(after)] if after else None,
                         sql_task=jobs.SqlTask(warehouse_id=warehouse, file=jobs.SqlTaskFile(
                             path=f'{remote}/{file}', source=jobs.Source.WORKSPACE)))

    settings = dict(name=NAME, max_concurrent_runs=1, timeout_seconds=1800,
                    parameters=[jobs.JobParameterDefinition(name='csv_path', default=DEFAULT_CSV)],
                    tasks=[task('stage', 'stage_clips.sql'), task('import', 'import_clips.sql', 'stage')])
    existing = next(iter(w.jobs.list(name=NAME)), None)
    if existing:
        w.jobs.reset(existing.job_id, jobs.JobSettings(**settings))
        job_id = existing.job_id
    else:
        job_id = w.jobs.create(**settings).job_id
    print(f'job {job_id} deployed from {revision[:7]}')
    return job_id


def run(w, csv):
    job = next(iter(w.jobs.list(name=NAME)), None)
    if not job:
        raise SystemExit('run `deploy` first')
    result = w.jobs.run_now(job.job_id, job_parameters={'csv_path': csv}).result()
    print(result.state.result_state.value, result.run_page_url)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='action', required=True)
    sub.add_parser('deploy')
    sub.add_parser('run').add_argument('--csv', default=DEFAULT_CSV)
    a = p.parse_args()
    w = client()
    deploy(w) if a.action == 'deploy' else run(w, a.csv)


if __name__ == '__main__':
    main()
