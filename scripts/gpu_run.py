"""Start, list, and stop SurgVLP extraction runs on Databricks serverless compute.

Default is serverless GPU (1x A10); --cpu uses serverless CPU. Serverless bills only while a run is active; nothing idles between runs. Each run is capped
by --timeout-min (default 30) so a forgotten run stops itself.
Reuses run_databricks_features.py to upload the committed ml/ snapshot first.

  python scripts/gpu_run.py start --case-id VID01               # 16-frame smoke run
  python scripts/gpu_run.py start --case-id VID01 --full-case   # whole case, publishes to the Volume
  python scripts/gpu_run.py start --case-id VID01 --cpu         # serverless CPU instead of GPU
  python scripts/gpu_run.py list                                # active runs, with IDs and URLs
  python scripts/gpu_run.py stop RUN_ID                         # cancel a run now
"""
import argparse
import re

from databricks.sdk.service.compute import Environment, HardwareAcceleratorType
from databricks.sdk.service.jobs import Compute, JobEnvironment, NotebookTask, Source, SubmitTask

from run_databricks_features import client, deploy, snapshot


def start(case_id, full_case, timeout_min, cpu):
    if not re.fullmatch(r'VID\d+', case_id):
        raise SystemExit('case-id must look like VID01')
    w = client()
    revision, remote = snapshot(w)
    deploy(w, revision, remote)
    run = w.jobs.submit(
        run_name=f'surg-f-{case_id}-{"full" if full_case else "smoke"}-{"cpu" if cpu else "gpu"}-{revision[:7]}',
        timeout_seconds=timeout_min * 60,
        environments=[JobEnvironment(environment_key='gpu', spec=Environment(environment_version='4'))],
        tasks=[SubmitTask(task_key='extract', environment_key='gpu',
                          compute=None if cpu else Compute(hardware_accelerator=HardwareAcceleratorType.GPU_1X_A10),
                          notebook_task=NotebookTask(notebook_path=remote + '/extract_databricks',
                                                     source=Source.WORKSPACE,
                                                     base_parameters={'case_id': case_id,
                                                                      'full_case': str(full_case).lower()}),
                          max_retries=0)],
    ).response
    print(f'started run {run.run_id} (auto-stops after {timeout_min} min)')
    print(w.jobs.get_run(run.run_id).run_page_url)


def list_active():
    runs = list(client().jobs.list_runs(active_only=True))
    for r in runs:
        print(r.run_id, r.run_name, r.state.life_cycle_state.value, r.run_page_url)
    if not runs:
        print('no active runs')


def stop(run_id):
    client().jobs.cancel_run(run_id)  # returns immediately; billing stops once the run ends
    print(f'stop requested for run {run_id}; run `list` to confirm it is gone')


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='action', required=True)
    s = sub.add_parser('start')
    s.add_argument('--case-id', default='VID01')
    s.add_argument('--full-case', action='store_true')
    s.add_argument('--timeout-min', type=int, default=30)
    s.add_argument('--cpu', action='store_true', help='serverless CPU instead of GPU')
    sub.add_parser('list')
    sub.add_parser('stop').add_argument('run_id', type=int)
    a = p.parse_args()
    if a.action == 'start':
        start(a.case_id, a.full_case, a.timeout_min, a.cpu)
    elif a.action == 'list':
        list_active()
    else:
        stop(a.run_id)


if __name__ == '__main__':
    main()
