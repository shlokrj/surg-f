"""Stream annotation counts without treating missing annotations as negatives."""
import argparse
import json
from collections import defaultdict
from pathlib import Path
import ijson
from extract_features import sha256
from train_tools import TOOLS


def audit(samples):
    cases = defaultdict(lambda: {'known_frames': 0, 'unknown_frames': 0,
                                 'positive_frames': dict.fromkeys(TOOLS, 0)})
    seen = set()
    with open(samples, 'rb') as f:
        for sample in ijson.items(f, 'samples.item'):
            case, frame = sample['video_id'], sample['frame_number']
            if (case, frame) in seen:
                raise ValueError('duplicate case/frame')
            seen.add((case, frame))
            row = cases[case]
            instruments = sample.get('instruments')
            if instruments is None:
                row['unknown_frames'] += 1
                continue
            row['known_frames'] += 1
            labels = {item['label'] for item in instruments['classifications']}
            if labels - set(TOOLS):
                raise ValueError(f'unknown labels: {labels - set(TOOLS)}')
            for tool in labels:
                row['positive_frames'][tool] += 1
    return {'samples_sha256': sha256(samples), 'cases': dict(sorted(cases.items()))}


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--samples', required=True)
    p.add_argument('--output', required=True)
    a = p.parse_args()
    Path(a.output).write_text(json.dumps(audit(a.samples), indent=2) + '\n')
