"""Score reviewed frames only, with confidence-ordered one-to-one IoU matching."""
import argparse
import json
from artifact import validate, finite


def iou(a, b):
    intersection = max(0, min(a[2], b[2]) - max(a[0], b[0])) * max(0, min(a[3], b[3]) - max(a[1], b[1]))
    return intersection / ((a[2]-a[0])*(a[3]-a[1]) + (b[2]-b[0])*(b[3]-b[1]) - intersection)


def evaluate(predictions, annotations, threshold=0.5, score_threshold=0.0):
    for data in (predictions, annotations):
        validate(data)
    if predictions['source'] != 'prediction' or annotations['source'] != 'annotation':
        raise ValueError('prediction and reviewed annotation artifacts required')
    if annotations['provenance'].get('reviewed_complete_frames') is not True:
        raise ValueError('annotation frames must be explicitly reviewed as complete')
    if not annotations['frames']:
        raise ValueError('at least one reviewed frame required')
    if not finite(threshold) or not 0 < threshold <= 1 or not finite(score_threshold) or not 0 <= score_threshold <= 1:
        raise ValueError('invalid IoU or score threshold')
    for key in ('case_id', 'video_asset_id', 'image_width', 'image_height'):
        if predictions[key] != annotations[key]:
            raise ValueError(f'mismatched {key}')
    predicted = {f['frame_id']: f for f in predictions['frames']}
    counts = {}
    for frame in annotations['frames']:
        candidate = predicted.get(frame['frame_id'])
        if candidate and abs(candidate['timestamp_sec'] - frame['timestamp_sec']) > 1e-4:
            raise ValueError('frame timestamp mismatch')
        truth = frame['detections']
        matched = set()
        for d in truth:
            counts.setdefault(f"{d['category']}:{d['label']}", dict(tp=0, fp=0, fn=0))
        detections = candidate['detections'] if candidate else []
        for detection in sorted(detections, key=lambda d: -d['score']):
            if detection['score'] < score_threshold:
                continue
            key = f"{detection['category']}:{detection['label']}"
            row = counts.setdefault(key, dict(tp=0, fp=0, fn=0))
            options = [(iou(detection['bbox_xyxy'], t['bbox_xyxy']), i) for i, t in enumerate(truth)
                       if i not in matched and (t['category'], t['label']) == (detection['category'], detection['label'])]
            overlap, index = max(options, default=(0, -1))
            if overlap >= threshold:
                matched.add(index)
                row['tp'] += 1
            else:
                row['fp'] += 1
        for i, d in enumerate(truth):
            if i not in matched:
                counts[f"{d['category']}:{d['label']}"]['fn'] += 1
    def metrics(row):
        tp, fp, fn = row['tp'], row['fp'], row['fn']
        return dict(row, precision=tp/(tp+fp) if tp+fp else None,
                    recall=tp/(tp+fn) if tp+fn else None)
    totals = {key: sum(row[key] for row in counts.values()) for key in ('tp', 'fp', 'fn')}
    return dict(reviewed_frames=len(annotations['frames']),
                ignored_prediction_frames=len(set(predicted) - {f['frame_id'] for f in annotations['frames']}),
                iou_threshold=threshold, score_threshold=score_threshold,
                micro=metrics(totals), per_label={key: metrics(row) for key, row in sorted(counts.items())})


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('predictions')
    parser.add_argument('annotations')
    parser.add_argument('--iou', type=float, default=0.5)
    parser.add_argument('--score', type=float, default=0.0)
    args = parser.parse_args()
    with open(args.predictions) as file:
        predictions = json.load(file)
    with open(args.annotations) as file:
        annotations = json.load(file)
    print(json.dumps(evaluate(predictions, annotations, args.iou, args.score), indent=2, allow_nan=False))
