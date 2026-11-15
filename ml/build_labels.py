"""Build a compact per-frame label file (instruments, verbs, targets) from the verified samples.json.

Output: {"source_sha256", "groups": {group: [labels]}, "cases": {case_id: [[group labels...] per frame]}}
Frames are listed in frame_number order (0..n-1). null_verb / null_target mean "no action/target"
and are dropped; an empty list is a known negative. Upload the result to the Volume for training:
  python ml/build_labels.py samples.json labels_v1.json
"""
import json
import sys

from extract_features import sha256
from prepare_assets import SAMPLES_SHA256

GROUPS = {
    'instruments': ['bipolar', 'clipper', 'grasper', 'hook', 'irrigator', 'scissors'],
    'verbs': ['aspirate', 'clip', 'coagulate', 'cut', 'dissect', 'grasp', 'irrigate', 'pack', 'retract'],
    'targets': ['abdominal_wall_cavity', 'adhesion', 'blood_vessel', 'cystic_artery', 'cystic_duct',
                'cystic_pedicle', 'cystic_plate', 'fluid', 'gallbladder', 'gut', 'liver', 'omentum',
                'peritoneum', 'specimen_bag'],
}


def build(samples):
    if sha256(samples) != SAMPLES_SHA256:
        raise ValueError(f'{samples}: not the verified CholecT50 labels file')
    frames = {}
    for s in json.load(open(samples))['samples']:
        row = []
        for group, known in GROUPS.items():
            labels = sorted({c['label'] for c in s[group]['classifications']} - {'null_verb', 'null_target'})
            if not set(labels) <= set(known):
                raise ValueError(f'unexpected {group} label in {s["video_id"]}: {labels}')
            row.append(labels)
        frames.setdefault(s['video_id'], {})[s['frame_number']] = row
    cases = {}
    for case, rows in frames.items():
        if sorted(rows) != list(range(len(rows))):
            raise ValueError(f'{case}: frames must be contiguous from 0')
        cases[case] = [rows[i] for i in range(len(rows))]
    return {'source_sha256': SAMPLES_SHA256, 'groups': GROUPS, 'cases': cases}


if __name__ == '__main__':
    out = build(sys.argv[1])
    with open(sys.argv[2], 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    print(f'{sys.argv[2]}: {len(out["cases"])} cases, {sum(map(len, out["cases"].values()))} frames')
