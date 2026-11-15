# Databricks notebook source
# MAGIC %md
# MAGIC # Spatial anatomy jobs on Databricks serverless (probe, train, export)
# MAGIC Submitted by `scripts/run_databricks_anatomy.py` from a committed snapshot. Data and runs live on the
# MAGIC team Volume under `/Volumes/workspace/default/surgf/localization/`. Each run copies its inputs to local
# MAGIC disk, runs the same `train_anatomy.py` / `export_anatomy_video.py` used locally, and copies results back.

# COMMAND ----------
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import tempfile
import time

for name in ['module_dir', 'mode', 'run_name', 'args_json', 'source_revision', 'experiment_path']:
    dbutils.widgets.text(name, '')
module_dir = Path(dbutils.widgets.get('module_dir'))
mode = dbutils.widgets.get('mode')
run_name = dbutils.widgets.get('run_name')
extra = json.loads(dbutils.widgets.get('args_json') or '[]') if mode == 'train' else []
volume = Path('/Volumes/workspace/default/surgf/localization')
started = time.perf_counter()


def ffmpeg_binary():
    found = shutil.which('ffmpeg')
    if found:
        return found
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def run(args):
    print('$', ' '.join(map(str, args)), flush=True)
    completed = subprocess.run([sys.executable, *map(str, args)], cwd=module_dir, capture_output=True, text=True)
    print(completed.stdout[-20000:]); print(completed.stderr[-20000:], file=sys.stderr)
    return completed.returncode


# COMMAND ----------
if mode == 'probe':
    import torch, torchvision
    info = dict(cpus=os.cpu_count(), torch=torch.__version__, torchvision=torchvision.__version__,
                torch_threads=torch.get_num_threads(), python=platform.python_version(),
                ffmpeg=ffmpeg_binary(), cuda=torch.cuda.is_available(),
                volume_data=sorted(p.name for p in (volume / 'anatomy-data').iterdir()) if (volume / 'anatomy-data').exists() else None)
    try:
        from torchvision.models.detection import FasterRCNN_MobileNet_V3_Large_FPN_Weights as W
        torch.hub.load_state_dict_from_url(W.COCO_V1.url, progress=False, check_hash=True)
        info['weights_download'] = 'ok'
    except Exception as error:  # report, do not hide
        info['weights_download'] = repr(error)
    x = torch.randn(2048, 2048)
    tick = time.perf_counter(); [x @ x for _ in range(10)]; info['matmul_10x2048_sec'] = round(time.perf_counter() - tick, 3)
    dbutils.notebook.exit(json.dumps(info))

# COMMAND ----------
if mode == 'train':
    work = Path(tempfile.mkdtemp(prefix='surgf-anatomy-'))
    shutil.copytree(volume / 'anatomy-data', work / 'data')
    destination = volume / 'runs' / run_name
    output = work / 'run'
    if (destination / 'last.pt').exists():  # resume a previous Databricks run of the same name
        shutil.copytree(destination, output)
        extra = [*extra, '--resume']
    import torch
    torch.set_num_threads(os.cpu_count())
    code = run(['train_anatomy.py', '--data-dir', work / 'data', '--output-dir', output, '--device', 'cpu', *extra])
    if output.exists():
        destination.mkdir(parents=True, exist_ok=True)
        for item in output.iterdir():
            shutil.copyfile(item, destination / item.name)
    report = json.loads((output / 'report.json').read_text()) if (output / 'report.json').exists() else {}
    if dbutils.widgets.get('experiment_path') and report:
        import mlflow
        mlflow.set_experiment(dbutils.widgets.get('experiment_path'))
        with mlflow.start_run(run_name=f'anatomy-{run_name}'):
            mlflow.log_params({'architecture': report.get('architecture'), 'hflip': report.get('hflip'),
                               'grad_clip': report.get('grad_clip'), 'learning_rate': report.get('learning_rate'),
                               'batch_size': report.get('batch_size'), 'seed': report.get('seed'),
                               'data_signature': report.get('data_signature'),
                               'source_revision': dbutils.widgets.get('source_revision')})
            for row in report.get('history', []):
                metrics = row['validation']
                mlflow.log_metric('validation_ap', metrics['ap'] or 0, step=row['epoch'])
                mlflow.log_metric('validation_ap50', metrics['ap50'] or 0, step=row['epoch'])
                mlflow.log_metric('train_loss', row['mean_loss'], step=row['epoch'])
                for name, value in metrics['per_class'].items():
                    mlflow.log_metric(f"ap50_{name.replace(' ', '_')}", value['ap50'] or 0, step=row['epoch'])
            mlflow.log_artifact(str(output / 'report.json'))
    dbutils.notebook.exit(json.dumps(dict(exit_code=code, destination=str(destination), best_ap=report.get('best_ap'),
                                          epochs=len(report.get('history', [])), seconds=round(time.perf_counter() - started))))

# COMMAND ----------
if mode == 'export':
    # args_json: {"checkpoint_run": NAME, "video": FILE, "output": FILE, "args": [extra exporter args]}
    spec = json.loads(dbutils.widgets.get('args_json'))
    work = Path(tempfile.mkdtemp(prefix='surgf-export-'))
    checkpoint, video, output = work / 'best.pt', work / spec['video'], work / spec['output']
    shutil.copyfile(volume / 'runs' / spec['checkpoint_run'] / 'best.pt', checkpoint)
    shutil.copyfile(Path('/Volumes/workspace/default/surgf/videos') / spec['video'], video)
    import torch
    torch.set_num_threads(os.cpu_count())
    code = run(['export_anatomy_video.py', '--checkpoint', checkpoint, '--video', video, '--ffmpeg', ffmpeg_binary(),
                '--output', output, *spec['args']])
    destination = volume / 'exports' / spec['output']
    if output.exists():
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(output, destination)
    dbutils.notebook.exit(json.dumps(dict(exit_code=code, output=str(destination) if output.exists() else None,
                                          seconds=round(time.perf_counter() - started))))
