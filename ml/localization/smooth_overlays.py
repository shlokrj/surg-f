"""Temporal smoothing for anatomy boxes in an exported overlay artifact.

Anatomy barely moves between samples 0.24 s apart, so detections in neighbouring frames
support each other. Two optional steps, applied per anatomy label:

* gap fill: when a label is detected in samples i and j at most `max_gap` samples apart, with
  overlapping boxes (IoU >= `link_iou`) and missing in between, insert linearly interpolated
  boxes scored at the lower of the two endpoints (instance IDs end in "-s<n>");
* drop isolated: remove a detection of the given labels that has no detection of the same
  label within `isolated_window` samples on either side (one-off flicker).

This changes playback only; single-frame validation scores cannot measure it. Instrument
boxes are left untouched.
"""
import argparse
import json
from pathlib import Path

from artifact import validate
from name_instruments import iou


def top(frame, label):
    hits = [d for d in frame['detections'] if d['category'] == 'anatomy' and d['label'] == label]
    return max(hits, key=lambda d: d['score']) if hits else None


def smooth(artifact, max_gap=4, link_iou=0.3, drop_isolated=(), isolated_window=2):
    frames = [dict(f, detections=list(f['detections'])) for f in artifact['frames']]
    labels = sorted({d['label'] for f in frames for d in f['detections'] if d['category'] == 'anatomy'})
    stats = dict(filled={}, dropped_isolated={})
    for label in drop_isolated:
        present = [top(f, label) is not None for f in frames]
        dropped = 0
        for i, frame in enumerate(frames):
            if not present[i]:
                continue
            near = any(present[j] for j in range(max(0, i - isolated_window), min(len(frames), i + isolated_window + 1)) if j != i)
            if not near:
                before = len(frame['detections'])
                frame['detections'] = [d for d in frame['detections'] if not (d['category'] == 'anatomy' and d['label'] == label)]
                dropped += before - len(frame['detections'])
        stats['dropped_isolated'][label] = dropped
    for label in labels:
        filled, last = 0, None
        for i, frame in enumerate(frames):
            hit = top(frame, label)
            if hit is None:
                continue
            if last is not None and 1 < i - last[0] <= max_gap + 1 and iou(hit['bbox_xyxy'], last[1]['bbox_xyxy']) >= link_iou:
                a, b = last[1], hit
                for k in range(last[0] + 1, i):
                    w = (k - last[0]) / (i - last[0])
                    box = [round(x + (y - x) * w, 4) for x, y in zip(a['bbox_xyxy'], b['bbox_xyxy'])]
                    frames[k]['detections'].append(dict(instance_id=f"{frames[k]['frame_id']:06}-s{label.replace(' ', '')}",
                        category='anatomy', label=label, score=round(min(a['score'], b['score']), 3), bbox_xyxy=box))
                    filled += 1
            last = (i, hit)
        stats['filled'][label] = filled
    result = dict(artifact, frames=frames)
    result['provenance'] = dict(artifact['provenance'], temporal_smoothing=dict(
        max_gap_samples=max_gap, link_iou=link_iou, drop_isolated=list(drop_isolated),
        isolated_window_samples=isolated_window, stats=stats,
        note='playback smoothing; interpolated boxes have instance IDs ending in -s<label>'))
    return validate(result)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('artifact')
    parser.add_argument('--max-gap', type=int, default=4, help='largest gap (in samples) to fill')
    parser.add_argument('--link-iou', type=float, default=0.3)
    parser.add_argument('--drop-isolated', action='append', default=[], help='label whose one-off detections are dropped')
    parser.add_argument('--isolated-window', type=int, default=2)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    result = smooth(json.loads(Path(args.artifact).read_text()), args.max_gap, args.link_iou, args.drop_isolated,
                    args.isolated_window)
    text = json.dumps(result, separators=(',', ':'), allow_nan=False) + '\n'
    with Path(args.output).open('x') as stream:
        stream.write(text)
    print(args.output, 'characters', len(text), result['provenance']['temporal_smoothing']['stats'])


if __name__ == '__main__':
    main()
