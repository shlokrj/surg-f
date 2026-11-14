# Databricks notebook source
# MAGIC %md
# MAGIC # SurgVLP extraction on Databricks
# MAGIC Use `scripts/gpu_run.py start --cpu` for a timed serverless CPU smoke run.
# MAGIC The launcher installs pinned dependencies and supplies an absolute module path.
# MAGIC Full cases publish only after validation. Smoke results remain on Databricks.

# COMMAND ----------
from pathlib import Path
import sys
import tempfile
import time
import json

run_started = time.perf_counter()
dbutils.widgets.text('module_dir', '')
dbutils.widgets.text('case_id', 'VID01')
dbutils.widgets.dropdown('full_case', 'false', ['false', 'true'])
dbutils.widgets.dropdown('device', 'cpu', ['cpu', 'cuda'])
module_dir = dbutils.widgets.get('module_dir')
ml_dir = Path(module_dir) if module_dir else Path.cwd()
if not (ml_dir / 'extract_features.py').is_file():
    raise RuntimeError('Set module_dir to the absolute /Workspace/.../ml snapshot path')
sys.path.insert(0, str(ml_dir))

import torch
import torchvision
from packaging.version import Version
from download_case import download_frames
from extract_features import extract, validate_bundle
from prepare_assets import prepare
from publish_features import publish

case_id = dbutils.widgets.get('case_id')
full_case = dbutils.widgets.get('full_case') == 'true'
device = dbutils.widgets.get('device')
if Version(torch.__version__.split('+')[0]) < Version('2.6'):
    raise RuntimeError('Use torch >= 2.6 and its matching torchvision')
if device == 'cuda' and not torch.cuda.is_available():
    raise RuntimeError('CUDA was requested but is unavailable')
print('Device:', device, 'torch:', torch.__version__, 'torchvision:', torchvision.__version__)
spark.sql('DESCRIBE VOLUME workspace.default.surgf').show(truncate=False)
volume = Path('/Volumes/workspace/default/surgf')
if not volume.is_dir():
    raise RuntimeError('Unity Catalog Volume is not mounted')

# COMMAND ----------
run_root = Path(tempfile.mkdtemp(prefix='surgf-'))
assets_started = time.perf_counter()
samples, checkpoint = prepare(run_root / 'assets')
assets_seconds = time.perf_counter() - assets_started

# COMMAND ----------
start = 0 if full_case or case_id != 'VID01' else 674
end = None if full_case else start + 16
download_started = time.perf_counter()
frames_dir, total = download_frames(str(samples), case_id, str(run_root / 'frames'), start, end)
download_seconds = time.perf_counter() - download_started
local_bundle = run_root / 'features' / case_id
metadata = extract(samples, case_id, frames_dir, checkpoint, local_bundle,
                   device=device, batch_size=4 if device == 'cpu' else 16, start=start, end=end)
validate_bundle(local_bundle, samples, require_complete=full_case)
print('Validated:', metadata['shape'], 'complete case:', metadata['complete_case'])

# COMMAND ----------
destination = None
if full_case:
    destination = volume / 'features' / case_id
    if destination.exists():
        existing = validate_bundle(destination, samples, require_complete=True)
        if (existing['checkpoint_sha256'] != metadata['checkpoint_sha256']
                or existing['samples_sha256'] != metadata['samples_sha256']
                or existing['preprocessing'] != metadata['preprocessing']):
            raise RuntimeError('Existing bundle has different provenance; coordinate before replacing')
        print('Existing complete bundle validated; left unchanged:', destination)
    else:
        publish(local_bundle, destination, samples)
        print('Published and read back:', destination)
result = {'case_id': case_id, 'full_case': full_case, 'device': device,
          'shape': metadata['shape'], 'total_case_frames': total,
          'timing': metadata['timing'], 'assets_seconds': assets_seconds,
          'download_seconds': download_seconds, 'elapsed_seconds': time.perf_counter() - run_started,
          'checkpoint_sha256': metadata['checkpoint_sha256'],
          'destination': str(destination) if destination else None}
print(json.dumps(result, indent=2))
dbutils.notebook.exit(json.dumps(result))
