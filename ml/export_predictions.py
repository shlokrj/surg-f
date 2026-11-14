"""Turn tool-classifier predictions on one held-out case into clip rows for surgf_clips.

Reads train_tools.py output (tool_classifiers.joblib + metrics.json) and a validated feature bundle,
predicts each frame, and merges consecutive positive frames (1 fps, frame N = second N) into
case_id,start_sec,end_sec,label,source=prediction rows. Import them with databricks/import_clips.sql.
Refuses training cases: predictions there would look better than the model really is.
Usage: python ml/export_predictions.py MODEL_DIR BUNDLE_DIR out.csv
"""
import csv
import json
import sys
from pathlib import Path

import joblib
import numpy as np

from extract_features import validate_bundle

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'databricks'))
from make_clips_csv import to_intervals  # noqa: E402


def predict_clips(model_dir, bundle):
    model_dir, bundle = Path(model_dir), Path(bundle)
    metadata = validate_bundle(bundle, require_complete=True)
    case_id = metadata['case_id']
    if case_id in json.loads((model_dir / 'metrics.json').read_text())['train_cases']:
        raise ValueError(f'{case_id} was used for training; export predictions only for held-out cases')
    saved = joblib.load(model_dir / 'tool_classifiers.joblib')
    features = np.load(bundle / 'features.npy', allow_pickle=False)
    with open(bundle / 'manifest.csv') as f:
        frames = np.array([int(r['frame_id']) for r in csv.DictReader(f)])
    rows = []
    for tool, model in sorted(saved['models'].items()):  # untrained tools are absent
        hits = frames[model.predict_proba(features)[:, 1] >= saved['threshold']]
        rows += [(case_id, start, end, tool, 'prediction') for start, end in to_intervals(sorted(hits))]
    return rows


def main(model_dir, bundle, out):
    rows = predict_clips(model_dir, bundle)
    with open(out, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['case_id', 'start_sec', 'end_sec', 'label', 'source'])
        w.writerows(rows)
    print(f'wrote {len(rows)} prediction clips to {out}')


if __name__ == '__main__':
    main(*sys.argv[1:4])
