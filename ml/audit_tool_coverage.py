"""Audit annotation coverage and a surgery split without extracting features."""
import argparse
import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path

import ijson

TOOLS = ('bipolar', 'clipper', 'grasper', 'hook', 'irrigator', 'scissors')


def summarize(rows):
    """Count known negatives separately from missing annotations."""
    known = sum(row['known_frames'] for row in rows)
    positives = {tool: sum(row['positive_frames'][tool] for row in rows) for tool in TOOLS}
    return {
        'case_count': len(rows),
        'known_frames': known,
        'unknown_frames': sum(row['unknown_frames'] for row in rows),
        'positive_frames': positives,
        'negative_frames': {tool: known - positives[tool] for tool in TOOLS},
        'cases_with_positive_frames': {
            tool: sum(row['positive_frames'][tool] > 0 for row in rows) for tool in TOOLS},
    }


def split_coverage(cases, split):
    """Reject overlap, missing cases and an inspected diagnostic case in evaluation."""
    seen, result = set(), {}
    if not isinstance(split, dict) or not isinstance(split.get('name'), str) or not split['name'].strip():
        raise ValueError('split must have a nonempty name')
    for group in ('train', 'validation', 'test', 'diagnostic'):
        ids = split.get(group, [])
        if not isinstance(ids, list) or (group != 'diagnostic' and not ids):
            raise ValueError(f'{group} must be a nonempty list (diagnostic may be empty)')
        if any(not isinstance(case, str) or not re.fullmatch(r'VID\d+', case) for case in ids):
            raise ValueError(f'{group} contains an invalid case ID')
        if len(set(ids)) != len(ids) or seen.intersection(ids):
            raise ValueError('split cases must be unique and disjoint')
        if set(ids) - cases.keys():
            raise ValueError(f'{group} contains cases missing from annotations')
        seen.update(ids)
        result[group] = {'case_ids': ids, **summarize([cases[case] for case in ids])}
    if 'VID02' in seen and 'VID02' not in split.get('diagnostic', []):
        raise ValueError('previously inspected VID02 must remain diagnostic')
    return {'name': split['name'], 'groups': result,
            'unassigned_cases': sorted(cases.keys() - seen)}


def audit(samples, split=None):
    cases = defaultdict(lambda: {'known_frames': 0, 'unknown_frames': 0,
                                 'positive_frames': dict.fromkeys(TOOLS, 0)})
    seen = set()
    with open(samples, 'rb') as stream:
        for sample in ijson.items(stream, 'samples.item'):
            case, frame = sample.get('video_id'), sample.get('frame_number')
            if (not isinstance(case, str) or not re.fullmatch(r'VID\d+', case)
                    or type(frame) is not int or frame < 0):
                raise ValueError('invalid case ID or nonnegative integer frame number')
            if (case, frame) in seen:
                raise ValueError('duplicate case/frame')
            seen.add((case, frame))
            row = cases[case]
            instruments = sample.get('instruments')
            if instruments is None:
                row['unknown_frames'] += 1
                continue
            if not isinstance(instruments, dict) or not isinstance(instruments.get('classifications'), list):
                raise ValueError('instruments must contain a classifications list')
            labels = set()
            for item in instruments['classifications']:
                if not isinstance(item, dict) or item.get('label') not in TOOLS:
                    raise ValueError('unknown or malformed instrument label')
                labels.add(item['label'])
            row['known_frames'] += 1
            for tool in labels:
                row['positive_frames'][tool] += 1
    if not seen:
        raise ValueError('no annotation samples found')
    with open(samples, 'rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    result = {'samples_sha256': digest, 'cases': dict(sorted(cases.items())),
              'summary': summarize(list(cases.values())),
              'counting_policy': 'Count observed samples only; null or absent instruments are unknown. '
              'An empty classifications list is a known negative. Repeated labels count once per frame. '
              'Absent frame IDs are not inferred as negative.'}
    if split is not None:
        result['split'] = split_coverage(result['cases'], split)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--samples', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--split', help='Optional surgery split JSON to validate and summarize')
    args = parser.parse_args()
    split = json.loads(Path(args.split).read_text()) if args.split else None
    Path(args.output).write_text(json.dumps(audit(args.samples, split), indent=2) + '\n')


if __name__ == '__main__':
    main()
