"""Turn CholecT50 instrument, verb, and target labels into clip interval rows for surgf_clip_staging.

Input: samples.json from huggingface.co/datasets/Voxel51/cholect50 (labels only, ~500 MB).
Assumes frame_number == second (CholecT50 frames are sampled at 1 fps). Verify against playback.
Usage: python3 databricks/make_clips_csv.py path/to/samples.json out.csv
"""
import csv
import json
import sys
from collections import defaultdict


def to_intervals(frames):
    """Sorted frame numbers -> [(start, end_exclusive)] of consecutive runs."""
    runs = []
    for f in frames:
        if runs and f == runs[-1][1]:
            runs[-1][1] = f + 1
        else:
            runs.append([f, f + 1])
    return [tuple(r) for r in runs]


def main(src, dst):
    frames = defaultdict(list)  # (case_id, label) -> frame numbers
    for s in json.load(open(src))["samples"]:
        for group in ("instruments", "verbs", "targets"):  # all searchable labels (DECISIONS.md 2026-11-14)
            for c in (s.get(group) or {}).get("classifications", []):
                if c["label"] not in ("null_verb", "null_target"):  # "no action/target", not searchable
                    frames[(s["video_id"], c["label"])].append(s["frame_number"])
    rows = 0
    with open(dst, "w", newline="") as out:
        w = csv.writer(out)
        w.writerow(["case_id", "start_sec", "end_sec", "label", "source"])
        # ponytail: 1-frame flickers become their own clips; merge small gaps if results look noisy
        for (case, label), fs in sorted(frames.items()):
            for start, end in to_intervals(sorted(fs)):
                w.writerow([case, start, end, label, "annotation"])
                rows += 1
    print(f"wrote {rows} clips to {dst}")


assert to_intervals([0, 1, 2, 5, 6, 9]) == [(0, 3), (5, 7), (9, 10)]

if __name__ == "__main__":
    main(*sys.argv[1:3])
