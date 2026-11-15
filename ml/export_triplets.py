"""Export CholecT50 instrument-verb-target annotations as [start_sec, end_sec) intervals at 1 fps.

Consecutive seconds with the same triplet are merged. null_verb / null_target mean the instrument is
visible but no action/target was annotated. A second with no row for an instrument means it was not visible.
  python ml/export_triplets.py samples.json shared/triplets.annotation.csv VID01 VID02
"""
import csv
import json
import sys

from extract_features import sha256
from prepare_assets import SAMPLES_SHA256


def intervals(frames):
    """frames: {case: {second: [triplet labels]}} -> sorted rows (case, start, end, instrument, verb, target)."""
    rows = []
    for case, by_sec in frames.items():
        open_ = {}  # triplet -> start
        for sec in range(max(by_sec) + 2):
            now = set(by_sec.get(sec, ()))
            for t in [t for t in open_ if t not in now]:
                rows.append((case, open_.pop(t), sec, *t.split(',')))
            for t in now - open_.keys():
                open_[t] = sec
    return sorted(rows)


def main(samples, out, cases):
    if sha256(samples) != SAMPLES_SHA256:
        raise ValueError(f'{samples}: not the verified CholecT50 labels file')
    frames = {}
    for s in json.load(open(samples))['samples']:
        if s['video_id'] in cases:
            frames.setdefault(s['video_id'], {})[s['frame_number']] = [
                c['label'] for c in s['triplets']['classifications']]
    with open(out, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['case_id', 'start_sec', 'end_sec', 'instrument', 'verb', 'target', 'source'])
        rows = intervals(frames)
        w.writerows(r + ('annotation',) for r in rows)
    print(f'{out}: {len(rows)} rows, {", ".join(f"{c}={len(frames[c])}s" for c in sorted(frames))}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], set(sys.argv[3:]))
