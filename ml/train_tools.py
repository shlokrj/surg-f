"""CPU baseline for tool presence on frozen features, split by surgery.

A fixed 0.5 threshold is used. No test-case fitting or threshold tuning occurs.
Missing annotations are excluded rather than treated as negative examples.
"""
import argparse
import json
from pathlib import Path

import numpy as np

from extract_features import validate_bundle

TOOLS = ['bipolar', 'clipper', 'grasper', 'hook', 'irrigator', 'scissors']


def load_cases(root, case_ids):
    matrices, labels, provenance = [], [], {}
    for case in case_ids:
        path = Path(root) / case
        metadata = validate_bundle(path, require_complete=True)
        if metadata['case_id'] != case:
            raise ValueError('bundle case ID differs from requested case')
        annotations = json.loads((path / 'annotations.json').read_text())
        keep = [i for i, row in enumerate(annotations) if row['instruments'] is not None]
        if not keep:
            raise ValueError(f'{case} has no annotated frames')
        matrices.append(np.load(path / 'features.npy', allow_pickle=False)[keep])
        labels.extend([annotations[i]['instruments'] for i in keep])
        provenance[case] = metadata
    first = next(iter(provenance.values()))
    for metadata in provenance.values():
        for key in ['checkpoint_sha256', 'preprocessing', 'samples_sha256']:
            if metadata[key] != first[key]:
                raise ValueError(f'incompatible bundle provenance: {key}')
    return np.concatenate(matrices), np.array([[tool in row for tool in TOOLS] for row in labels], dtype=np.int32), provenance


def fit_baseline(features_root, train_cases, test_cases, output, class_weight="balanced"):
    import joblib
    import sklearn
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import average_precision_score, precision_recall_fscore_support
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler

    if not train_cases or not test_cases or set(train_cases) & set(test_cases):
        raise ValueError('nonempty, disjoint training and test surgery IDs required')
    if len(set(train_cases)) != len(train_cases) or len(set(test_cases)) != len(test_cases):
        raise ValueError('duplicate surgery IDs')
    output = Path(output)
    if output.exists():
        raise FileExistsError(output)
    x_train, y_train, train_meta = load_cases(features_root, train_cases)
    x_test, y_test, test_meta = load_cases(features_root, test_cases)
    # Also require matching preprocessing and checkpoint across the split.
    first_train = next(iter(train_meta.values()))
    first_test = next(iter(test_meta.values()))
    for key in ['checkpoint_sha256', 'preprocessing', 'samples_sha256']:
        if first_train[key] != first_test[key]:
            raise ValueError(f'train/test provenance mismatch: {key}')
    models, metrics = {}, {}
    for index, tool in enumerate(TOOLS):
        target = y_train[:, index]
        test_target = y_test[:, index]
        if len(np.unique(target)) != 2:
            metrics[tool] = {'status': 'not_trained', 'reason': 'training case lacks both classes',
                             'train_positive_frames': int(target.sum())}
            continue
        model = make_pipeline(StandardScaler(), LogisticRegression(
            C=1.0, class_weight=class_weight, solver='liblinear', max_iter=1000, random_state=0))
        model.fit(x_train, target)
        probabilities = model.predict_proba(x_test)[:, 1]
        predictions = probabilities >= 0.5
        precision, recall, f1, _ = precision_recall_fscore_support(
            test_target, predictions, average='binary', zero_division=0)
        metrics[tool] = {'status': 'trained', 'precision': float(precision), 'recall': float(recall),
                         'f1': float(f1), 'average_precision': float(average_precision_score(test_target, probabilities))
                         if 0 < test_target.sum() < len(test_target) else None,
                         'train_positive_frames': int(target.sum()), 'test_positive_frames': int(test_target.sum()),
                         'test_frames': len(test_target)}
        models[tool] = model
    if not models:
        raise ValueError('no tool has both classes in the training set')
    report = {'train_cases': train_cases, 'test_cases': test_cases, 'threshold': 0.5,
              'class_weight': class_weight, 'train_frames': len(x_train), 'test_frames': len(x_test), 'tools': metrics,
              'checkpoint_sha256': first_train['checkpoint_sha256'],
              'preprocessing': first_train['preprocessing'],
              'samples_sha256': first_train['samples_sha256'],
              'versions': {'numpy': np.__version__, 'sklearn': sklearn.__version__, 'joblib': joblib.__version__},
              'feature_bundle_hashes': {case: metadata.get('file_sha256', {})
                                       for case, metadata in {**train_meta, **test_meta}.items()},
              'limitations': 'Surgery-held-out engineering baseline. No test-set tuning; not clinical validation.'}
    output.mkdir(parents=True)
    joblib.dump({'models': models, 'threshold': 0.5, 'tools': TOOLS}, output / 'tool_classifiers.joblib')
    (output / 'metrics.json').write_text(json.dumps(report, indent=2) + '\n')
    # Confirm serialization preserves outputs on the held-out features.
    reloaded = joblib.load(output / 'tool_classifiers.joblib')
    for tool in models:
        np.testing.assert_allclose(models[tool].predict_proba(x_test),
                                   reloaded['models'][tool].predict_proba(x_test), rtol=0, atol=0)
    return report



def validate_split(split):
    import re
    if not isinstance(split, dict):
        raise ValueError('split must be an object')
    seen = set()
    for key in ['train', 'validation', 'test', 'diagnostic']:
        cases = split.get(key, [])
        if not isinstance(cases, list) or (key != 'diagnostic' and not cases):
            raise ValueError(f'{key} must be nonempty')
        if any(not isinstance(case, str) for case in cases):
            raise ValueError('split case IDs must be strings')
        if (len(set(cases)) != len(cases) or seen.intersection(cases)
                or any(not re.fullmatch(r'VID\d+', case) for case in cases)):
            raise ValueError('split requires unique, disjoint surgery IDs')
        seen.update(cases)
    if 'VID02' in seen and 'VID02' not in split.get('diagnostic', []):
        raise ValueError('previously inspected VID02 must remain diagnostic')
    return split


def fit_selected(features_root, split, output, validation_only=False):
    """Choose class weighting on validation only, then evaluate test once."""
    import tempfile
    import shutil
    validate_split(split)
    output = Path(output)
    if output.exists():
        raise FileExistsError(output)
    scores, reports, candidate_reports = {}, {}, {}
    with tempfile.TemporaryDirectory(prefix='surgf-selection-') as tmp:
        for label, weight in [('balanced', 'balanced'), ('unweighted', None)]:
            report = fit_baseline(features_root, split['train'], split['validation'],
                                  Path(tmp) / label, class_weight=weight)
            candidate_reports[label] = report
            reports[label] = report['tools']
            scores[label] = sum(m.get('f1', 0.0) for m in report['tools'].values()) / len(TOOLS)
        # Stable tie break prefers balanced. No threshold search is performed.
        chosen = max(scores, key=scores.get)
        if validation_only:
            # Copy the selected validation artifact without ever loading final-test cases.
            shutil.copytree(Path(tmp) / chosen, output)
            report = dict(candidate_reports[chosen])
        else:
            report = fit_baseline(features_root, split['train'], split['test'], output,
                                  class_weight='balanced' if chosen == 'balanced' else None)
    validation_provenance = {
        label: {key: candidate.get(key) for key in
                ['checkpoint_sha256', 'preprocessing', 'samples_sha256', 'versions', 'feature_bundle_hashes']}
        for label, candidate in candidate_reports.items()}
    report.update({'split': split, 'validation_cases': split['validation'],
                   'evaluation_partition': 'validation' if validation_only else 'test',
                   'final_test_evaluated': not validation_only,
                   'selection_metric': 'validation_macro_f1',
                   'selection_tie_break': 'balanced',
                   'validation_macro_f1': scores, 'validation_tools': reports,
                   'validation_provenance': validation_provenance,
                   'selected_weighting': chosen})
    (Path(output) / 'metrics.json').write_text(json.dumps(report, indent=2) + '\n')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--features-root', required=True)
    parser.add_argument('--train-cases', nargs='+', required=True)
    parser.add_argument('--test-cases', nargs='+', required=True)
    parser.add_argument('--output', required=True)
    print(json.dumps(fit_baseline(**vars(parser.parse_args())), indent=2))
