"""Turn tool-classifier predictions on one held-out case into clip rows for surgf_clips.

Reads train_tools.py output (tool_classifiers.joblib + metrics.json) or train_multilabel.py output
(multilabel_mlp.joblib + metrics.json; only its instrument labels are exported) and a validated feature bundle,
predicts each frame, and merges consecutive positive frames (1 fps, frame N = second N) into
case_id,start_sec,end_sec,label,source=prediction rows. Import them with databricks/import_clips.sql.
Optional smoothing cleans up flicker: --max-gap fills off-gaps of up to N seconds between clips, then
--min-len drops clips shorter than N seconds. The defaults (0, 1) leave clips unchanged. Choose them
on validation cases only.
Refuses training cases: predictions there would look better than the model really is.
Usage: python ml/export_predictions.py MODEL_DIR BUNDLE_DIR out.csv [--max-gap 0] [--min-len 1]
"""
import argparse
import csv
import json
import sys
from pathlib import Path

import joblib
import numpy as np

from extract_features import validate_bundle

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'databricks'))
from make_clips_csv import to_intervals  # noqa: E402


def smooth(intervals, max_gap=0, min_len=1):
    """Sorted [start, end) clips -> merge clips with <= max_gap seconds between them, then drop clips < min_len."""
    if type(max_gap) is not int or type(min_len) is not int or max_gap < 0 or min_len < 1:
        raise ValueError('need max_gap >= 0 and min_len >= 1')
    merged = []
    previous_start = -1
    for start, end in intervals:
        if not 0 <= start < end or start < previous_start:
            raise ValueError('intervals must be sorted and nonempty')
        previous_start = start
        if merged and start - merged[-1][1] <= max_gap:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return [(start, end) for start, end in merged if end - start >= min_len]


def predict_clips(model_dir, bundle, max_gap=0, min_len=1):
    smooth([], max_gap, min_len)  # Validate settings before reading model or features.
    model_dir, bundle = Path(model_dir), Path(bundle)
    metadata = validate_bundle(bundle, require_complete=True)
    case_id = metadata['case_id']
    report = json.loads((model_dir / 'metrics.json').read_text())
    if case_id in report['train_cases']:
        raise ValueError(f'{case_id} was used for training; export predictions only for held-out cases')
    for key in ['checkpoint_sha256', 'preprocessing', 'samples_sha256']:
        if key not in report or key not in metadata or report[key] != metadata[key]:
            raise ValueError(f'model/bundle provenance mismatch: {key}')
    if (model_dir / 'multilabel_mlp.joblib').exists():
        return mlp_clips(model_dir, bundle, case_id, max_gap, min_len)
    saved = joblib.load(model_dir / 'tool_classifiers.joblib')
    threshold = saved['threshold']
    if (not isinstance(threshold, (int, float)) or not np.isfinite(threshold)
            or not 0 <= threshold <= 1 or threshold != report.get('threshold')):
        raise ValueError('invalid or inconsistent model/report threshold')
    if not saved['models'] or set(saved['models']) - {'bipolar', 'clipper', 'grasper', 'hook', 'irrigator', 'scissors'}:
        raise ValueError('expected at least one recognized tool model')
    features = np.load(bundle / 'features.npy', allow_pickle=False)
    with open(bundle / 'manifest.csv') as f:
        frames = np.array([int(r['frame_id']) for r in csv.DictReader(f)])
    rows = []
    for tool, model in sorted(saved['models'].items()):  # untrained tools are absent
        if list(model.classes_) != [0, 1]:
            raise ValueError('expected binary model classes [0, 1]')
        probabilities = np.asarray(model.predict_proba(features))
        if (probabilities.shape != (len(frames), 2) or not np.isfinite(probabilities).all()
                or np.any((probabilities < 0) | (probabilities > 1))
                or not np.allclose(probabilities.sum(axis=1), 1.0)):
            raise ValueError('invalid model probabilities')
        hits = frames[probabilities[:, 1] >= threshold]
        rows += [(case_id, start, end, tool, 'prediction') for start, end in smooth(to_intervals(sorted(hits)), max_gap, min_len)]
    return rows


def mlp_clips(model_dir, bundle, case_id, max_gap, min_len):
    """Instrument clips from the 29-label MLP: same +-window context and per-label thresholds as training."""
    from train_multilabel import with_context
    saved = joblib.load(model_dir / 'multilabel_mlp.joblib')
    labels, thresholds = saved['labels'], np.asarray(saved['thresholds'], dtype=float)
    if (len(thresholds) != len(labels) or not np.isfinite(thresholds).all()
            or np.any((thresholds < 0) | (thresholds > 1))):
        raise ValueError('invalid MLP thresholds')
    features = np.load(bundle / 'features.npy', allow_pickle=False)
    with open(bundle / 'manifest.csv') as f:
        frames = np.array([int(r['frame_id']) for r in csv.DictReader(f)])
    probabilities = np.asarray(saved['model'].predict_proba(with_context(features, saved['window'])))
    if (probabilities.shape != (len(frames), len(labels)) or not np.isfinite(probabilities).all()
            or np.any((probabilities < 0) | (probabilities > 1))):
        raise ValueError('invalid model probabilities')
    rows = []
    for j, label in enumerate(labels):
        group, tool = label.split(':', 1)
        if group == 'instruments':  # verbs/targets wait for the search-label decision (DECISIONS.md)
            hits = frames[probabilities[:, j] >= thresholds[j]]
            rows += [(case_id, start, end, tool, 'prediction')
                     for start, end in smooth(to_intervals(sorted(hits)), max_gap, min_len)]
    return rows


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('model_dir')
    p.add_argument('bundle')
    p.add_argument('out')
    p.add_argument('--max-gap', type=int, default=0)
    p.add_argument('--min-len', type=int, default=1)
    a = p.parse_args()
    rows, out = predict_clips(a.model_dir, a.bundle, a.max_gap, a.min_len), a.out
    with open(out, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['case_id', 'start_sec', 'end_sec', 'label', 'source'])
        w.writerows(rows)
    print(f'wrote {len(rows)} prediction clips to {out}')


if __name__ == '__main__':
    main()
