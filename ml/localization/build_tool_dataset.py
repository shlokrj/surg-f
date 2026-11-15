"""Build the 3-class (cystic duct, gallbladder, tool) dataset from an existing anatomy data directory.

Reuses the already downloaded and hash-verified Endoscapes keyframes (hard links, or copies
across file systems), re-prepares the official train/val annotations with the generic `tool`
class added, and writes the same manifest layout that train_anatomy.ready_data checks. The raw
annotation files must hash to the values recorded in the source manifest.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil

from prepare_anatomy import prepare


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def build(source, raw_dir, split_path, output):
    source, raw_dir, output = Path(source), Path(raw_dir), Path(output)
    if output.exists():
        raise FileExistsError(output)
    manifest = json.loads((source / 'manifest.json').read_text())
    split_bytes = Path(split_path).read_bytes()
    if hashlib.sha256(split_bytes).hexdigest() != manifest['split_sha256']:
        raise ValueError('split file differs from the one the source data was prepared with')
    result = dict(source=manifest['source'], split_sha256=manifest['split_sha256'], partitions={}, files={},
                  derived_from=str(source))
    for partition in ('train', 'val'):
        raw_path = raw_dir / f'{partition}_annotation_coco.json'
        raw = raw_path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != manifest['partitions'][partition]['annotation_sha256']:
            raise ValueError(f'{partition} raw annotations differ from the source manifest')
        annotations, report = prepare(json.loads(raw), json.loads(split_bytes), partition, include_tool=True)
        old = json.loads((source / partition / 'annotations.json').read_text())
        if sorted(i['id'] for i in old['images']) != sorted(i['id'] for i in annotations['images']):
            raise ValueError(f'{partition} image set differs from the source data')
        (output / partition).mkdir(parents=True)
        for image in annotations['images']:
            key = f"{partition}/{image['file_name']}"
            if sha(source / key) != manifest['files'][key]:
                raise ValueError(f'source image changed: {key}')
            try:
                os.link(source / key, output / key)
            except OSError:
                shutil.copy2(source / key, output / key)
            result['files'][key] = manifest['files'][key]
        (output / partition / 'annotations.json').write_text(json.dumps(annotations, indent=2, sort_keys=True) + '\n')
        report.update(annotation_sha256=manifest['partitions'][partition]['annotation_sha256'],
                      prepared_sha256=hashlib.sha256(json.dumps(annotations, sort_keys=True).encode()).hexdigest(),
                      downloaded_images=len(annotations['images']))
        result['partitions'][partition] = report
    (output / 'manifest.json').write_text(json.dumps(result, indent=2, sort_keys=True) + '\n')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, help='existing anatomy data directory')
    parser.add_argument('--raw-dir', required=True, help='folder with train/val_annotation_coco.json')
    parser.add_argument('--split', default='ml/case_split.json')
    parser.add_argument('--output-dir', required=True)
    args = parser.parse_args()
    result = build(args.source, args.raw_dir, args.split, args.output_dir)
    print(json.dumps({p: dict(images=r['images'], boxes=r['boxes'], categories=[c['name'] for c in r['categories']])
                      for p, r in result['partitions'].items()}, indent=2))
