# Databricks notebook source
# MAGIC %md
# MAGIC # SurgVLP feature extraction - Shlok
# MAGIC Run from a Databricks Git folder checked out to `ml-dev`.
# MAGIC Attach a GPU ML runtime with Dedicated access and access to
# MAGIC `workspace.default.surgf`. Use a single-node T4 (`g4dn.xlarge`) if available
# MAGIC under the team policy, with 30-minute auto-termination.
# MAGIC This notebook does not create compute. First run the default 16-frame smoke
# MAGIC check. Set `full_case` to `true` only after it succeeds.
# MAGIC Full-case runs publish to the Volume only after validation; smoke runs stay local.

# COMMAND ----------
# MAGIC %pip install "ijson>=3.3,<4" "Pillow>=10,<12"

# COMMAND ----------
dbutils.library.restartPython()

# COMMAND ----------
from pathlib import Path
import sys

# A Git folder notebook normally starts in ml/; root is also supported.
repo = Path.cwd()
ml_dir = repo if (repo / 'extract_features.py').is_file() else repo / 'ml'
if not (ml_dir / 'extract_features.py').is_file():
    raise RuntimeError('Open this notebook inside the surg-f Git folder on ml-dev')
sys.path.insert(0, str(ml_dir))

import torch
import torchvision
from packaging.version import Version
from download_case import download_frames
from extract_features import extract, validate_bundle
from prepare_assets import prepare
from publish_features import publish

if Version(torch.__version__.split('+')[0]) < Version('2.6'):
    raise RuntimeError('Use a GPU runtime with torch >= 2.6 and its matching torchvision')
if not torch.cuda.is_available():
    raise RuntimeError('No CUDA GPU attached; select GPU compute before continuing')
print('GPU:', torch.cuda.get_device_name(0), 'torch:', torch.__version__, 'torchvision:', torchvision.__version__)
# Verify this is a real, accessible Unity Catalog Volume before downloading.
spark.sql('DESCRIBE VOLUME workspace.default.surgf').show(truncate=False)
volume = Path('/Volumes/workspace/default/surgf')
if not volume.is_dir():
    raise RuntimeError('Unity Catalog Volume is not mounted')

# COMMAND ----------
dbutils.widgets.text('case_id', 'VID01')
dbutils.widgets.dropdown('full_case', 'false', ['false', 'true'])
case_id = dbutils.widgets.get('case_id')
full_case = dbutils.widgets.get('full_case') == 'true'
# Use an isolated per-run local directory so reruns cannot reuse stale features.
import tempfile
run_root = Path(tempfile.mkdtemp(prefix='surgf-', dir='/local_disk0'))
assets = Path('/local_disk0/surgf-assets')
samples, checkpoint = prepare(assets)

# COMMAND ----------
# Full cases use all frames. A smoke run uses the known VID01 clip or frames 0-15.
start = 0 if full_case or case_id != 'VID01' else 674
end = None if full_case else start + 16
frames_dir, total = download_frames(str(samples), case_id, str(run_root / 'frames'), start, end)
local_bundle = run_root / 'features' / case_id
metadata = extract(samples, case_id, frames_dir, checkpoint, local_bundle,
                   device='cuda', batch_size=16, start=start, end=end)
validate_bundle(local_bundle, samples, require_complete=full_case)
print('Validated:', metadata['shape'], 'complete case:', metadata['complete_case'])

# COMMAND ----------
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
else:
    print('Smoke check only. No feature bundle published:', local_bundle)

# COMMAND ----------
# MAGIC %md
# MAGIC Record the cluster/runtime, case, shape, checkpoint hash, command/result, and
# MAGIC Volume path in `ml/PROGRESS.md`. Do not mark extraction/upload complete until
# MAGIC the full-case cell succeeds. Process the next case separately. Temporary frames
# MAGIC here belong only to this run; remove them after successful publication when no
# MAGIC longer needed. Stop compute when finished.
