"""Export bounded frame-error review CSVs; never import these into search."""
import argparse
import csv
import json
from pathlib import Path

import joblib
import numpy as np
from extract_features import validate_bundle

TOOLS = {'bipolar', 'clipper', 'grasper', 'hook', 'irrigator', 'scissors'}
FIELDS = ['case_id', 'tool', 'frame_id', 'second', 'expected_label', 'probability',
          'threshold', 'error_type', 'model_run_id', 'partition']


def error_rows(case, frames, annotations, probabilities, threshold, run_id, partition, limit=20):
    """Take evenly spaced errors in time per tool/type, deterministically."""
    if not isinstance(limit, int) or isinstance(limit, bool) or limit < 1:
        raise ValueError('limit must be a positive integer')
    if not np.isfinite(threshold) or not 0 <= threshold <= 1:
        raise ValueError('threshold must be between 0 and 1')
    if len(frames) != len(annotations) or list(frames) != sorted(set(frames)):
        raise ValueError('frames must be unique, sorted and aligned with annotations')
    if any(not isinstance(frame, (int, np.integer)) or isinstance(frame, bool) or frame < 0 for frame in frames):
        raise ValueError('frame IDs must be nonnegative integers')
    if any(labels is not None and (not isinstance(labels, list) or any(tool not in TOOLS for tool in labels)) for labels in annotations):
        raise ValueError('invalid annotation labels')
    rows = []
    totals = {}
    for tool, values in sorted(probabilities.items()):
        values = np.asarray(values)
        if tool not in TOOLS or values.shape != (len(frames),) or not np.isfinite(values).all() or np.any((values < 0) | (values > 1)):
            raise ValueError('invalid tool probabilities')
        errors = {'false_positive': [], 'false_negative': []}
        for frame, labels, probability in zip(frames, annotations, values):
            if labels is None:
                continue
            expected = int(tool in labels)
            predicted = int(probability >= threshold)
            if expected == predicted:
                continue
            kind = 'false_positive' if predicted else 'false_negative'
            errors[kind].append(dict(zip(FIELDS, [case, tool, int(frame), int(frame), expected,
                                                  float(probability), float(threshold), kind, run_id, partition])))
        totals[tool] = {kind: len(items) for kind, items in errors.items()}
        for items in errors.values():
            indices = np.linspace(0, len(items)-1, min(limit, len(items)), dtype=int) if items else []
            rows.extend(items[index] for index in indices)
    return sorted(rows, key=lambda row: (row['tool'], row['error_type'], row['frame_id'])), totals


def review(model_dir, bundle, split, output, diagnostic=False, limit=20):
    model_dir, bundle, output = Path(model_dir), Path(bundle), Path(output)
    sidecar = output.with_suffix('.json')
    if output.exists() or sidecar.exists():
        raise FileExistsError('review CSV or sidecar already exists')
    metadata = validate_bundle(bundle, require_complete=True)
    case = metadata['case_id']
    report = json.loads((model_dir / 'metrics.json').read_text())
    if case in report['train_cases'] or case in split.get('train', []) or case in split.get('test', []):
        raise ValueError('training and final-test cases are excluded from iterative review')
    partition = 'diagnostic' if diagnostic else 'validation'
    if case not in split.get(partition, []):
        raise ValueError(f'{case} is not in the {partition} partition')
    if 'split' in report and report['split'] != split:
        raise ValueError('review split differs from the model split')
    for key in ['checkpoint_sha256', 'preprocessing', 'samples_sha256']:
        if report[key] != metadata[key]:
            raise ValueError(f'model/bundle provenance mismatch: {key}')
    run_id = report.get('mlflow_run_id')
    if not run_id:
        raise ValueError('model report must contain an MLflow run ID')
    saved = joblib.load(model_dir / 'tool_classifiers.joblib')
    if saved['threshold'] != report['threshold']:
        raise ValueError('saved model/report threshold mismatch')
    features = np.load(bundle / 'features.npy', allow_pickle=False)
    annotations = json.loads((bundle / 'annotations.json').read_text())
    probabilities = {}
    for tool, model in saved['models'].items():
        classes = list(model.classes_)
        if classes != [0, 1]:
            raise ValueError('expected binary model classes [0, 1]')
        probabilities[tool] = model.predict_proba(features)[:, 1]
    rows, totals = error_rows(case, [row['frame_id'] for row in annotations],
                             [row['instruments'] for row in annotations], probabilities,
                             saved['threshold'], run_id, partition, limit)
    with output.open('x', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    summary = {'model_run_id': run_id, 'case_id': case, 'partition': partition,
               'rows': len(rows), 'limit_per_tool_error_type': limit,
               'total_errors': totals, 'unknown_frames': sum(row['instruments'] is None for row in annotations),
               'sampling': 'evenly spaced chronologically within each tool/error type',
               'timebase': 'CholecT50 1 fps: second equals frame_id',
               'feature_bundle_hashes': metadata['file_sha256'],
               'visually_reviewed': False, 'scope': 'Raw frame decisions before clip smoothing; not a search import or unbiased sample.'}
    with sidecar.open('x') as stream:
        stream.write(json.dumps(summary, indent=2) + '\n')
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('model_dir')
    parser.add_argument('bundle')
    parser.add_argument('output')
    parser.add_argument('--split', default=str(Path(__file__).with_name('case_split.json')))
    parser.add_argument('--diagnostic', action='store_true')
    parser.add_argument('--limit', type=int, default=20)
    args = parser.parse_args()
    print(json.dumps(review(args.model_dir, args.bundle, json.loads(Path(args.split).read_text()),
                            args.output, args.diagnostic, args.limit), indent=2))


if __name__ == '__main__':
    main()
