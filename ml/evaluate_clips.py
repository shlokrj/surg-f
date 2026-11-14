"""Event-level evaluation of predicted tool clips against annotation clips for one case.

Intervals are [start_sec, end_sec) at 1 fps (frame N = second N), as written by export_predictions.py.
Ground truth comes from the bundle's annotations.json; frames with instruments=None are unknown.
IoU is measured on known frames only; a predicted interval with no known frames is dropped, not an FP.
Per tool, pairs are matched one-to-one greedily by descending IoU, counting a match at IoU >= threshold.
Fragmentation: annotation intervals touched by more than one prediction, and the extra pieces.
Usage: python ml/evaluate_clips.py pred.csv BUNDLE_DIR [--iou 0.5] > report.json
"""
import argparse
import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'databricks'))
from make_clips_csv import to_intervals  # noqa: E402


def check(intervals):
    for start, end in intervals:
        if not 0 <= start < end:
            raise ValueError(f'invalid interval [{start}, {end})')
    return intervals


def known_overlap(a, b, unknown):
    lo, hi = max(a[0], b[0]), min(a[1], b[1])
    return sum(1 for f in range(lo, hi) if f not in unknown)


def known_length(a, unknown):
    return sum(1 for f in range(*a) if f not in unknown)


def evaluate_tool(predicted, truth, unknown=frozenset(), iou=0.5):
    predicted = [p for p in check(predicted) if known_length(p, unknown)]
    truth = check(truth)
    pairs = []
    for i, p in enumerate(predicted):
        for j, t in enumerate(truth):
            inter = known_overlap(p, t, unknown)
            if inter:
                union = known_length(p, unknown) + known_length(t, unknown) - inter
                pairs.append((inter / union, i, j))
    # ponytail: greedy matching by IoU; Hungarian (scipy) only if greedy ties ever matter
    used_p, used_t = set(), set()
    for score, i, j in sorted(pairs, reverse=True):
        if score >= iou and i not in used_p and j not in used_t:
            used_p.add(i)
            used_t.add(j)
    tp, fp, fn = len(used_p), len(predicted) - len(used_p), len(truth) - len(used_t)
    touching = defaultdict(int)
    for _, _, j in pairs:
        touching[j] += 1
    return {
        'tp': tp, 'fp': fp, 'fn': fn,
        'precision': tp / (tp + fp) if tp + fp else None,
        'recall': tp / (tp + fn) if tp + fn else None,
        'f1': 2 * tp / (2 * tp + fp + fn) if tp + fp + fn else None,
        'predicted_events': len(predicted), 'annotated_events': len(truth),
        'fragmented_annotations': sum(1 for n in touching.values() if n > 1),
        'extra_fragments': sum(n - 1 for n in touching.values() if n > 1),
    }


def load_truth(annotations):
    """annotations.json rows -> ({tool: intervals}, unknown frame set)."""
    unknown = {r['frame_id'] for r in annotations if r['instruments'] is None}
    frames = defaultdict(list)
    for r in annotations:
        for tool in r['instruments'] or []:
            frames[tool].append(r['frame_id'])
    return {tool: to_intervals(sorted(fs)) for tool, fs in frames.items()}, unknown


def evaluate(pred_csv, bundle, iou=0.5):
    annotations = json.loads((Path(bundle) / 'annotations.json').read_text())
    case_id = annotations[0]['case_id']
    truth, unknown = load_truth(annotations)
    predicted = defaultdict(list)
    with open(pred_csv, newline='') as f:
        for r in csv.DictReader(f):
            if r['case_id'] == case_id and r['source'] == 'prediction':
                predicted[r['label']].append((int(r['start_sec']), int(r['end_sec'])))
    tools = {tool: evaluate_tool(predicted[tool], truth.get(tool, []), unknown, iou)
             for tool in sorted(set(truth) | set(predicted))}
    return {'case_id': case_id, 'iou_threshold': iou, 'matching': 'one-to-one greedy by IoU',
            'unknown_frames': len(unknown), 'tools': tools}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pred_csv')
    parser.add_argument('bundle')
    parser.add_argument('--iou', type=float, default=0.5)
    args = parser.parse_args()
    print(json.dumps(evaluate(args.pred_csv, args.bundle, args.iou), indent=2))
