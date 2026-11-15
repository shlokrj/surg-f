"""Fixed-threshold error analysis for anatomy predictions on validation references.

Matches each class one-to-one in descending score order at an IoU threshold, sweeps
score thresholds, and breaks errors down by type, box size and surgery. Threshold
selection here uses validation data, so the selected operating point is optimistic.
"""
import argparse
import hashlib
import json
from pathlib import Path

SCOPE = {1: 'cystic duct', 2: 'gallbladder'}
SCOPE_WITH_TOOL = {**SCOPE, 3: 'tool'}
THRESHOLDS = [round(0.05 * i, 2) for i in range(1, 20)]
SIZE_BINS = (('small', 0.01), ('medium', 0.05), ('large', float('inf')))  # box area / image area


def iou(a, b):
    w = min(a[2], b[2]) - max(a[0], b[0])
    h = min(a[3], b[3]) - max(a[1], b[1])
    if w <= 0 or h <= 0:
        return 0.0
    inter = w * h
    return inter / ((a[2]-a[0])*(a[3]-a[1]) + (b[2]-b[0])*(b[3]-b[1]) - inter)


def size_bin(box, image):
    fraction = (box[2]-box[0]) * (box[3]-box[1]) / (image['width'] * image['height'])
    return next(name for name, limit in SIZE_BINS if fraction < limit)


def match_image(references, detections, iou_threshold):
    """references: [(label, xyxy)], detections: [(label, xyxy, score)] -> per-detection kind, matched refs."""
    matched, kinds = set(), []
    for label, box, _ in sorted(detections, key=lambda d: -d[2]):
        best, best_iou = None, iou_threshold
        for index, (ref_label, ref_box) in enumerate(references):
            if ref_label != label or index in matched:
                continue
            overlap = iou(box, ref_box)
            if overlap >= best_iou:
                best, best_iou = index, overlap
        if best is not None:
            matched.add(best); kinds.append('tp'); continue
        same = [iou(box, r) for l, r in references if l == label]
        other = [iou(box, r) for l, r in references if l != label]
        if any(i in matched and l == label and iou(box, r) >= iou_threshold
               for i, (l, r) in enumerate(references)):
            kinds.append('duplicate')
        elif same and max(same) >= 0.1:
            kinds.append('localization')
        elif other and max(other) >= iou_threshold:
            kinds.append('class_confusion')
        else:
            kinds.append('background')
    return kinds, matched


def analyze(annotations, predictions, iou_threshold=0.5):
    images = {i['id']: i for i in annotations['images']}
    scope = {c['id']: c['name'] for c in annotations['categories']}
    if scope not in (SCOPE, SCOPE_WITH_TOOL):
        raise ValueError('reference must contain the two anatomy categories (optionally plus tool)')
    refs = {identity: [] for identity in images}
    for a in annotations['annotations']:
        x, y, w, h = a['bbox']
        refs[a['image_id']].append((a['category_id'], [x, y, x+w, y+h]))
    preds = {identity: [] for identity in images}
    for p in predictions:
        if p['image_id'] not in images:
            raise ValueError('prediction for unknown image')
        preds[p['image_id']] = [(l, b, s) for b, l, s in zip(p['boxes'], p['labels'], p['scores']) if l in scope]

    def run(threshold):
        stats = {name: dict(tp=0, fp=0, fn=0) for name in scope.values()}
        errors = {name: dict(duplicate=0, localization=0, class_confusion=0, background=0) for name in scope.values()}
        misses = {name: {b: [0, 0] for b, _ in SIZE_BINS} for name in scope.values()}  # [missed, support]
        surgeries = {}
        for identity, image in images.items():
            references = refs[identity]
            detections = [d for d in preds[identity] if d[2] >= threshold]
            kinds, matched = match_image(references, detections, iou_threshold)
            for (label, _, _), kind in zip(sorted(detections, key=lambda d: -d[2]), kinds):
                name = scope[label]
                if kind == 'tp':
                    stats[name]['tp'] += 1
                else:
                    stats[name]['fp'] += 1; errors[name][kind] += 1
            for index, (label, box) in enumerate(references):
                name, bin_name = scope[label], size_bin(box, image)
                surgery = surgeries.setdefault(name, {}).setdefault(image['video_id'], dict(tp=0, fn=0))
                misses[name][bin_name][1] += 1
                if index in matched:
                    surgery['tp'] += 1
                else:
                    stats[name]['fn'] += 1; misses[name][bin_name][0] += 1; surgery['fn'] += 1
        for s in stats.values():
            s['precision'] = s['tp'] / (s['tp'] + s['fp']) if s['tp'] + s['fp'] else None
            s['recall'] = s['tp'] / (s['tp'] + s['fn']) if s['tp'] + s['fn'] else None
            errors_and_hits = 2*s['tp'] + s['fp'] + s['fn']
            s['f1'] = 2*s['tp'] / errors_and_hits if errors_and_hits else None
        return stats, errors, misses, surgeries

    sweep = {str(t): {name: {k: s[k] for k in ('precision', 'recall', 'f1')} for name, s in run(t)[0].items()}
             for t in THRESHOLDS}
    selected = {}
    for name in scope.values():
        scored = [(sweep[str(t)][name]['f1'] or 0, t) for t in THRESHOLDS]
        selected[name] = max(scored, key=lambda pair: (pair[0], pair[1]))[1]
    detail = {}
    for name, threshold in selected.items():
        stats, errors, misses, surgeries = run(threshold)
        recalls = sorted(v['tp'] / (v['tp'] + v['fn']) for v in surgeries.get(name, {}).values())
        detail[name] = dict(score_threshold=threshold, **stats[name], false_positive_types=errors[name],
            missed_by_size={b: dict(missed=m, support=n, miss_rate=m/n if n else None) for b, (m, n) in misses[name].items()},
            per_surgery_recall=dict(min=recalls[0], median=recalls[len(recalls)//2], max=recalls[-1],
                                    surgeries=len(recalls)) if recalls else None)
    negatives = [i for i in images if not refs[i]]
    false_alarm_negatives = {name: sum(any(scope[l] == name and s >= selected[name] for l, _, s in preds[i]) for i in negatives)
                             for name in scope.values()}
    return dict(iou_threshold=iou_threshold, images=len(images), anatomy_negative_images=len(negatives),
                size_bins='box area / image area: small < 0.01, medium < 0.05, large otherwise',
                threshold_sweep=sweep, selected_by_validation_f1=detail,
                negative_images_with_detection_at_selected_threshold=false_alarm_negatives,
                caveat='Thresholds are selected on the same validation split; no untouched test split was used.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('annotations'); parser.add_argument('predictions')
    parser.add_argument('--iou', type=float, default=0.5)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    raw, pred = Path(args.annotations).read_bytes(), Path(args.predictions).read_bytes()
    result = analyze(json.loads(raw), json.loads(pred), args.iou)
    result.update(annotation_sha256=hashlib.sha256(raw).hexdigest(), prediction_sha256=hashlib.sha256(pred).hexdigest())
    with Path(args.output).open('x') as stream:
        stream.write(json.dumps(result, indent=2, allow_nan=False) + '\n')
    print(json.dumps(result['selected_by_validation_f1'], indent=2))


if __name__ == '__main__':
    main()
