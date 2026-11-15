"""Merge overlay artifacts exported in time chunks (for example by parallel Databricks jobs).

All chunks must come from the same checkpoint, video, thresholds and sampling interval;
frame IDs must not overlap. The merged artifact keeps each chunk's frame-hash digest
and is revalidated with artifact.validate.
"""
import argparse
import json
from pathlib import Path

from artifact import validate

SAME = ('schema_version', 'case_id', 'video_asset_id', 'source', 'image_width', 'image_height',
        'display_width', 'display_height', 'max_age_sec')
SAME_PROVENANCE = ('checkpoint_sha256', 'checkpoint_epoch', 'architecture', 'data_signature', 'video_sha256',
                   'fps', 'video_stream', 'class_map', 'score_thresholds', 'timebase', 'quality')


def merge(chunks):
    if len(chunks) < 2:
        raise ValueError('need at least two chunks')
    first = chunks[0]
    every = {c['provenance'].get('sampling', {}).get('every_sec') if isinstance(c['provenance'].get('sampling'), dict) else None
             for c in chunks}
    if len(every) != 1:
        raise ValueError('chunks use different sampling intervals')
    for chunk in chunks[1:]:
        for key in SAME:
            if chunk.get(key) != first.get(key):
                raise ValueError(f'chunks disagree on {key}')
        for key in SAME_PROVENANCE:
            if chunk['provenance'].get(key) != first['provenance'].get(key):
                raise ValueError(f'chunks disagree on provenance.{key}')
    frames = sorted((f for c in chunks for f in c['frames']), key=lambda f: f['frame_id'])
    ids = [f['frame_id'] for f in frames]
    if len(ids) != len(set(ids)):
        raise ValueError('chunks overlap in frame IDs')
    ordered = sorted(chunks, key=lambda c: c['frames'][0]['frame_id'])
    merged = {key: first[key] for key in SAME if key in first}
    merged['frames'] = frames
    provenance = {k: v for k, v in first['provenance'].items() if k not in ('source_frames', 'sampling')}
    provenance.update(
        sampling=dict(every_sec=every.pop(), chunks=[c['provenance']['sampling'] for c in ordered]),
        source_frames=dict(count=sum(c['provenance']['source_frames']['count'] for c in ordered),
                           chunk_digests=[c['provenance']['source_frames']['digest'] for c in ordered],
                           digest_input=first['provenance']['source_frames']['digest_input']))
    merged['provenance'] = provenance
    return validate(merged)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('chunks', nargs='+')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    result = merge([json.loads(Path(p).read_text()) for p in args.chunks])
    text = json.dumps(result, separators=(',', ':'), allow_nan=False) + '\n'
    with Path(args.output).open('x') as stream:
        stream.write(text)
    print(args.output, 'frames', len(result['frames']), 'detections',
          sum(len(f['detections']) for f in result['frames']), 'characters', len(text))


if __name__ == '__main__':
    main()
