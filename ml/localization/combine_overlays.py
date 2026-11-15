"""Add one artifact's instrument boxes to another artifact's anatomy boxes.

Used to keep the better anatomy model (e.g. v3) while taking named instrument boxes from a
model trained with the tool class (v4). Both artifacts must describe the same video asset
with identical frames (IDs and timestamps), dimensions and expiry. The result keeps the base
artifact's provenance and records the instrument source under `instrument_source`.
"""
import argparse
import json
from pathlib import Path

from artifact import validate

SAME = ('schema_version', 'case_id', 'video_asset_id', 'source', 'image_width', 'image_height',
        'display_width', 'display_height', 'max_age_sec')
INSTRUMENT_PROVENANCE = ('checkpoint_sha256', 'checkpoint_epoch', 'architecture', 'data_signature', 'class_map',
                         'score_thresholds', 'instrument_naming', 'video_sha256', 'validation_status')


def combine(base, instruments):
    for key in SAME:
        if base.get(key) != instruments.get(key):
            raise ValueError(f'artifacts disagree on {key}')
    if base['provenance'].get('video_sha256') != instruments['provenance'].get('video_sha256'):
        raise ValueError('artifacts were exported from different video files')
    if [(f['frame_id'], f['timestamp_sec']) for f in base['frames']] != \
       [(f['frame_id'], f['timestamp_sec']) for f in instruments['frames']]:
        raise ValueError('artifacts sample different frames')
    frames = []
    for anatomy, tools in zip(base['frames'], instruments['frames']):
        kept = [d for d in anatomy['detections'] if d['category'] == 'anatomy']
        added = [d for d in tools['detections'] if d['category'] == 'instrument']
        ids = {d['instance_id'] for d in kept}
        if any(d['instance_id'] in ids for d in added):
            raise ValueError(f"instance IDs collide in frame {anatomy['frame_id']}")
        frames.append(dict(anatomy, detections=kept + added))
    result = dict(base, frames=frames)
    result['provenance'] = dict(base['provenance'], anatomy_source='this provenance (base artifact)',
                                instrument_source={k: instruments['provenance'][k] for k in INSTRUMENT_PROVENANCE
                                                   if k in instruments['provenance']})
    return validate(result)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('base', help='artifact whose anatomy boxes are kept')
    parser.add_argument('instruments', help='artifact whose instrument boxes are added')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    result = combine(json.loads(Path(args.base).read_text()), json.loads(Path(args.instruments).read_text()))
    text = json.dumps(result, separators=(',', ':'), allow_nan=False) + '\n'
    with Path(args.output).open('x') as stream:
        stream.write(text)
    counts = {}
    for frame in result['frames']:
        for d in frame['detections']:
            counts[d['label']] = counts.get(d['label'], 0) + 1
    print(args.output, 'frames', len(result['frames']), 'characters', len(text), counts)


if __name__ == '__main__':
    main()
