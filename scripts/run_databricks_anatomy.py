"""Run spatial anatomy jobs on Databricks serverless CPU from a committed snapshot.

  python scripts/run_databricks_anatomy.py upload-data ~/madhacks2026/localization/anatomy-data
  python scripts/run_databricks_anatomy.py upload-run ~/madhacks2026/localization/anatomy-hires-v3 anatomy-hires-v3
  python scripts/run_databricks_anatomy.py probe
  python scripts/run_databricks_anatomy.py train RUN_NAME -- --epochs 10 --architecture mobilenet_v3_hires --hflip --grad-clip 10
  python scripts/run_databricks_anatomy.py export RUN_NAME OUTPUT.json -- --every-sec 0.24 ...
  python scripts/run_databricks_anatomy.py status RUN_ID
  python scripts/run_databricks_anatomy.py fetch REMOTE_FILE LOCAL_FILE

Data, runs and exports live under /Volumes/workspace/default/surgf/localization/. Only committed
code is uploaded. Each job has a hard timeout; nothing idles afterwards. Reuses client() and
snapshot() from run_databricks_features.py.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys

from databricks.sdk.service.compute import Environment
from databricks.sdk.service.jobs import JobEnvironment, NotebookTask, Source, SubmitTask
from databricks.sdk.service.workspace import ImportFormat, Language

from run_databricks_features import ROOT, client, snapshot

VOLUME = '/Volumes/workspace/default/surgf/localization'
CODE = ['anatomy_databricks.py', 'train_anatomy.py', 'export_anatomy_video.py', 'evaluate_anatomy_coco.py',
        'audit_coco.py', 'artifact.py']
DEPENDENCIES = ['torch==2.6.0', 'torchvision==0.21.0', 'pycocotools==2.0.11', 'imageio-ffmpeg==0.5.1', 'Pillow==11.3.0']


def deploy(w):
    revision, remote = snapshot(w)
    remote = remote.removesuffix('/ml') + '/localization'
    w.workspace.mkdirs(remote)
    for name in CODE:
        notebook = name == 'anatomy_databricks.py'
        w.workspace.upload(remote + '/' + (name.removesuffix('.py') if notebook else name),
                           subprocess.check_output(['git', 'show', f'{revision}:ml/localization/{name}'], cwd=ROOT),
                           format=ImportFormat.SOURCE if notebook else ImportFormat.RAW,
                           language=Language.PYTHON if notebook else None, overwrite=True)
    return revision, remote


def submit(mode, run_name='', args=None, timeout_min=60):
    if not 1 <= timeout_min <= 240:
        raise SystemExit('timeout must be 1-240 minutes')
    w = client()
    revision, remote = deploy(w)
    owner = w.current_user.me().user_name
    run = w.jobs.submit(
        run_name=f'surg-f-anatomy-{mode}-{run_name or "probe"}-{revision[:7]}', timeout_seconds=timeout_min * 60,
        environments=[JobEnvironment(environment_key='anatomy', spec=Environment(
            base_environment='workspace-base-environments/databricks_ml_v6', dependencies=DEPENDENCIES))],
        tasks=[SubmitTask(task_key='anatomy', environment_key='anatomy', max_retries=0,
                          notebook_task=NotebookTask(notebook_path=remote + '/anatomy_databricks', source=Source.WORKSPACE,
                              base_parameters={'module_dir': '/Workspace' + remote, 'mode': mode, 'run_name': run_name,
                                               'args_json': json.dumps(args if args is not None else []),
                                               'source_revision': revision,
                                               'experiment_path': f'/Users/{owner}/surg-f-anatomy'}))],
    ).response
    print(json.dumps({'run_id': run.run_id, 'revision': revision, 'timeout_min': timeout_min,
                      'url': w.jobs.get_run(run.run_id).run_page_url}))


def upload_data(local):
    """Upload prepared images/annotations/manifest, skipping files whose size already matches."""
    w, root = client(), Path(local).expanduser()
    manifest = json.loads((root / 'manifest.json').read_text())
    files = ['manifest.json', 'train/annotations.json', 'val/annotations.json', *sorted(manifest['files'])]
    sent = skipped = 0
    for relative in files:
        path, remote = root / relative, f'{VOLUME}/anatomy-data/{relative}'
        if relative in manifest['files'] and hashlib.sha256(path.read_bytes()).hexdigest() != manifest['files'][relative]:
            raise SystemExit(f'local image changed since preparation: {relative}')
        try:
            if w.files.get_metadata(remote).content_length == path.stat().st_size:
                skipped += 1; continue
        except Exception:
            pass
        w.files.upload(remote, io.BytesIO(path.read_bytes()), overwrite=True); sent += 1
    print(json.dumps({'uploaded': sent, 'already_present': skipped, 'destination': f'{VOLUME}/anatomy-data'}))


def upload_run(local, name):
    """Upload a locally trained run (best.pt, report.json) so Databricks jobs can export from it."""
    w, root = client(), Path(local).expanduser()
    for item in ('best.pt', 'report.json'):
        w.files.upload(f'{VOLUME}/runs/{name}/{item}', io.BytesIO((root / item).read_bytes()), overwrite=True)
        size = w.files.get_metadata(f'{VOLUME}/runs/{name}/{item}').content_length
        if size != (root / item).stat().st_size:
            raise SystemExit(f'upload size mismatch for {item}')
    print(json.dumps({'run': name, 'destination': f'{VOLUME}/runs/{name}',
                      'best_pt_sha256': hashlib.sha256((root / 'best.pt').read_bytes()).hexdigest()}))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='action', required=True)
    sub.add_parser('upload-data').add_argument('local')
    up = sub.add_parser('upload-run'); up.add_argument('local'); up.add_argument('name')
    probe = sub.add_parser('probe'); probe.add_argument('--timeout-min', type=int, default=20)
    train = sub.add_parser('train'); train.add_argument('run_name'); train.add_argument('--timeout-min', type=int, default=180)
    export = sub.add_parser('export'); export.add_argument('run_name'); export.add_argument('output')
    export.add_argument('--video', default='VID01.mp4'); export.add_argument('--timeout-min', type=int, default=120)
    sub.add_parser('status').add_argument('run_id', type=int)
    fetch = sub.add_parser('fetch'); fetch.add_argument('remote'); fetch.add_argument('local')
    argv = sys.argv[1:]
    split = argv.index('--') if '--' in argv else len(argv)
    a, extra = parser.parse_args(argv[:split]), argv[split + 1:]  # everything after -- goes to the ml script
    if a.action == 'upload-data':
        upload_data(a.local)
    elif a.action == 'upload-run':
        upload_run(a.local, a.name)
    elif a.action == 'probe':
        submit('probe', timeout_min=a.timeout_min)
    elif a.action == 'train':
        submit('train', a.run_name, extra, a.timeout_min)
    elif a.action == 'export':
        submit('export', a.run_name, dict(checkpoint_run=a.run_name, video=a.video, output=a.output, args=extra),
               a.timeout_min)
    elif a.action == 'status':
        w = client(); run = w.jobs.get_run(a.run_id)
        task = (run.tasks or [None])[0]
        output = w.jobs.get_run_output(task.run_id) if task and run.state and run.state.life_cycle_state.value == 'TERMINATED' else None
        print(json.dumps({'state': run.state.as_dict() if run.state else None, 'url': run.run_page_url,
                          'result': output.notebook_output.result if output and output.notebook_output else None,
                          'error': output.error if output else None}, indent=2))
    else:
        target = Path(a.local).expanduser()
        if target.exists():
            raise SystemExit(f'refusing to overwrite {target}')
        target.write_bytes(client().files.download(f'{VOLUME}/{a.remote}').contents.read())
        print(target, target.stat().st_size)


if __name__ == '__main__':
    main()
