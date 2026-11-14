"""Download and independently validate a complete Volume bundle against labels."""
import argparse
import json
import re
import shutil
import sys
import tempfile
from pathlib import Path

from run_databricks_features import ROOT, client
sys.path.insert(0, str(ROOT / 'ml'))
from extract_features import validate_bundle


def verify(case_id, samples):
    if not re.fullmatch(r'VID\d+', case_id):
        raise ValueError('case-id must be a CholecT50 VID number')
    remote = f'/Volumes/workspace/default/surgf/features/{case_id}'
    w = client()
    # Only these downloaded verification copies are removed on exit.
    with tempfile.TemporaryDirectory(prefix='surgf-verify-') as tmp:
        local = Path(tmp)
        for name in ['features.npy', 'manifest.csv', 'annotations.json', 'metadata.json']:
            response = w.files.download(remote + '/' + name)
            with response.contents as source, (local / name).open('wb') as destination:
                shutil.copyfileobj(source, destination)
        metadata = validate_bundle(local, samples, require_complete=True)
        return {'case_id': case_id, 'shape': metadata['shape'], 'device': metadata['device'],
                'complete_case': metadata['complete_case'], 'volume_path': remote,
                'checkpoint_sha256': metadata['checkpoint_sha256'],
                'timing': metadata.get('timing'), 'file_sha256': metadata['file_sha256']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case-id', required=True)
    parser.add_argument('--samples', required=True)
    print(json.dumps(verify(**vars(parser.parse_args())), indent=2))
