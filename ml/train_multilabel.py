"""Neural-network baseline for 29 labels at once: 6 instruments, 9 verbs, 14 targets.

Frozen SurgVLP features -> StandardScaler -> MLP (multi-label). Optional temporal context appends the
mean feature over +-window seconds within the same surgery. Model config and one decision threshold
per label are chosen on the validation surgeries only; the test surgeries are read only with
--final. Frames with no annotation row are excluded; empty lists are known negatives.

  python ml/train_multilabel.py FEATURES_ROOT labels_v1.json ml/case_split.json OUT_DIR [--final]
"""
import argparse
import json
from pathlib import Path

import numpy as np

from extract_features import validate_bundle
from train_tools import validate_split

CONFIGS = [{'window': 0, 'hidden': 256}, {'window': 5, 'hidden': 256}]  # predeclared; picked on validation
THRESHOLDS = np.round(np.arange(0.05, 0.96, 0.05), 2)


def label_names(labels):
    return [f'{g}:{name}' for g, names in labels['groups'].items() for name in names]


def with_context(x, window):
    """Append the mean of rows within +-window (clipped at the surgery's ends)."""
    if window == 0:
        return x
    c = np.vstack([np.zeros((1, x.shape[1])), np.cumsum(x, axis=0, dtype=np.float64)])
    i = np.arange(len(x))
    lo, hi = np.maximum(i - window, 0), np.minimum(i + window + 1, len(x))
    return np.hstack([x, ((c[hi] - c[lo]) / (hi - lo)[:, None]).astype(np.float32)])


PROVENANCE = ['checkpoint_sha256', 'preprocessing', 'samples_sha256']


def load(features_root, labels, cases, window):
    """Return features, label matrix, and the bundles' shared provenance (must match across cases)."""
    names, xs, ys, provenance = label_names(labels), [], [], None
    for case in cases:
        path = Path(features_root) / case
        metadata = validate_bundle(path, require_complete=True)
        if metadata['case_id'] != case:
            raise ValueError(f'{path}: bundle case ID differs')
        if provenance is None:
            provenance = {k: metadata[k] for k in PROVENANCE}
        elif any(metadata[k] != provenance[k] for k in PROVENANCE):
            raise ValueError(f'{case}: incompatible bundle provenance')
        frames = np.loadtxt(path / 'manifest.csv', delimiter=',', skiprows=1, usecols=1, dtype=int, ndmin=1)
        rows = labels['cases'][case]
        if list(frames) != list(range(len(rows))):
            raise ValueError(f'{case}: manifest frames do not match label frames')
        xs.append(with_context(np.load(path / 'features.npy', allow_pickle=False), window))
        ys.append(np.array([[name.split(':', 1)[1] in r[gi] for gi, g in enumerate(labels['groups'])
                             for name in names if name.startswith(g + ':')] for r in rows], dtype=np.int8))
    return np.concatenate(xs), np.concatenate(ys), provenance


def f1(y, p):
    tp = int((y & p).sum()); fp = int((~y & p).sum()); fn = int((y & ~p).sum())
    return {'precision': tp / (tp + fp) if tp + fp else 0.0, 'recall': tp / (tp + fn) if tp + fn else 0.0,
            'f1': 2 * tp / (2 * tp + fp + fn) if tp else 0.0, 'positives': int(y.sum())}


def pick_thresholds(y, prob):
    """Per label, the threshold maximizing validation F1 (0.5 if validation has no positives)."""
    out = []
    for j in range(y.shape[1]):
        yj = y[:, j].astype(bool)
        out.append(0.5 if not yj.any() else
                   float(max(THRESHOLDS, key=lambda t: (f1(yj, prob[:, j] >= t)['f1'], -abs(t - 0.5)))))
    return np.array(out)


def evaluate(y, prob, thresholds, names):
    per = {n: f1(y[:, j].astype(bool), prob[:, j] >= thresholds[j]) for j, n in enumerate(names)}
    scored = [v['f1'] for v in per.values() if v['positives']]
    return {'macro_f1': float(np.mean(scored)) if scored else 0.0, 'labels': per}


def fit(x, y, hidden, seed=0):
    from sklearn.neural_network import MLPClassifier
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    model = make_pipeline(StandardScaler(), MLPClassifier(
        hidden_layer_sizes=(hidden,), alpha=1e-3, batch_size=256, learning_rate_init=1e-3,
        max_iter=30, early_stopping=False, random_state=seed))
    return model.fit(x, y)


def run(features_root, labels_path, split, output, final=False):
    import joblib
    split, output = validate_split(split), Path(output)
    if output.exists():
        raise FileExistsError(output)
    labels = json.loads(Path(labels_path).read_text())
    names, candidates = label_names(labels), []
    for config in CONFIGS:
        xtr, ytr, provenance = load(features_root, labels, split['train'], config['window'])
        xva, yva, val_provenance = load(features_root, labels, split['validation'], config['window'])
        if val_provenance != provenance:
            raise ValueError('train/validation provenance mismatch')
        model = fit(xtr, ytr, config['hidden'])
        prob = model.predict_proba(xva)
        thresholds = pick_thresholds(yva, prob)
        candidates.append({'config': config, 'model': model, 'thresholds': thresholds,
                           'validation': evaluate(yva, prob, thresholds, names),
                           'validation_at_0.5': evaluate(yva, prob, np.full(len(names), 0.5), names),
                           'train_frames': len(xtr)})
    best = max(candidates, key=lambda c: (c['validation']['macro_f1'], -c['config']['window']))
    report = {'model': 'mlp', 'labels': names, 'split': split, 'selected': best['config'], **provenance,
              'train_cases': split['train'], 'threshold': 'per_label',
              'train_frames': best['train_frames'], 'thresholds': dict(zip(names, best['thresholds'].tolist())),
              'candidates': [{'config': c['config'], 'validation_macro_f1': c['validation']['macro_f1'],
                              'validation_macro_f1_at_0.5': c['validation_at_0.5']['macro_f1']} for c in candidates],
              'validation': best['validation'], 'final_test_used': final,
              'limitations': 'Surgery-held-out engineering baseline; thresholds tuned on validation; not clinical validation.'}
    if final:
        xte, yte, test_provenance = load(features_root, labels, split['test'], best['config']['window'])
        if test_provenance != provenance:
            raise ValueError('train/test provenance mismatch')
        report['test'] = evaluate(yte, best['model'].predict_proba(xte), best['thresholds'], names)
        report['test_frames'] = len(xte)
    output.mkdir(parents=True)
    joblib.dump({'model': best['model'], 'labels': names, 'thresholds': best['thresholds'],
                 'window': best['config']['window']}, output / 'multilabel_mlp.joblib')
    (output / 'metrics.json').write_text(json.dumps(report, indent=2) + '\n')
    lines = ['| Label | Validation F1 | Validation positives |' + (' Test F1 | Test positives |' if final else ''),
             '|---|---:|---:|' + ('---:|---:|' if final else '')]
    for n in names:
        v = report['validation']['labels'][n]
        t = report['test']['labels'][n] if final else None
        lines.append(f"| {n} | {v['f1']:.3f} | {v['positives']} |" + (f" {t['f1']:.3f} | {t['positives']} |" if t else ''))
    (output / 'comparison.md').write_text('\n'.join(lines) + '\n')
    return report


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('features_root')
    p.add_argument('labels')
    p.add_argument('split')
    p.add_argument('output')
    p.add_argument('--final', action='store_true', help='also evaluate the test surgeries (once)')
    a = p.parse_args()
    r = run(a.features_root, a.labels, json.loads(Path(a.split).read_text()), a.output, a.final)
    print(json.dumps({k: r[k] for k in ['selected', 'candidates', 'train_frames']}, indent=2))
    print('validation macro F1', round(r['validation']['macro_f1'], 4))
