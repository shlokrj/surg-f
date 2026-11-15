"""Resume-safe Endoscapes train/validation keyframe download with source checks."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path

from PIL import Image
from prepare_anatomy import prepare

URL = 'https://s3.unistra.fr/camma_public/datasets/endoscapes/endoscapes.zip'


def digest(content):
    return hashlib.sha256(content).hexdigest()


def save_json(path, value):
    temporary = path.with_name(path.name + '.part')
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + '\n')
    os.replace(temporary, path)


def check_image(content, image):
    with Image.open(io.BytesIO(content)) as decoded:
        if decoded.size != (image['width'], image['height']):
            raise ValueError(f"image dimensions disagree: {image['file_name']}")
        decoded.verify()


def fetch(archive, root, split_bytes, partitions=('train', 'val'), limit=None):
    """Fetch prepared partitions; never accept stale source, split, or image bytes."""
    root = Path(root)
    root.mkdir(parents=True, exist_ok=True)
    split_hash = digest(split_bytes)
    manifest_path = root / 'manifest.json'
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {
        'source': URL, 'split_sha256': split_hash, 'partitions': {}, 'files': {}}
    if manifest['source'] != URL or manifest['split_sha256'] != split_hash:
        raise ValueError('existing data directory belongs to a different source or split')
    split = json.loads(split_bytes)
    for partition in partitions:
        raw = archive.read(f'endoscapes/{partition}/annotation_coco.json')
        annotations, report = prepare(json.loads(raw), split, partition)
        annotation_hash = digest(raw)
        prepared_hash = digest(json.dumps(annotations, sort_keys=True).encode())
        old = manifest['partitions'].get(partition)
        if old and old['annotation_sha256'] != annotation_hash:
            raise ValueError(f'{partition} annotations changed since the first download')
        if old and old.get('prepared_sha256', prepared_hash) != prepared_hash:
            raise ValueError(f'{partition} prepared labels changed since the first download')
        directory = root / partition
        directory.mkdir(exist_ok=True)
        selected = sorted(annotations['images'], key=lambda image: image['id'])
        if limit is not None:
            selected = selected[:limit]
        for image in selected:
            name = image['file_name']
            if Path(name).name != name or name in ('.', '..'):
                raise ValueError('unsafe image filename')
            key = f'{partition}/{name}'
            destination = directory / name
            if destination.exists():
                content = destination.read_bytes()
                check_image(content, image)
                checksum = digest(content)
                if key in manifest['files'] and manifest['files'][key] != checksum:
                    raise ValueError(f'previously verified image changed: {key}')
            else:
                content = archive.read(f'endoscapes/{key}')
                check_image(content, image)
                checksum = digest(content)
                temporary = directory / (name + '.part')
                temporary.write_bytes(content)
                os.replace(temporary, destination)
            manifest['files'][key] = checksum
            save_json(manifest_path, manifest)
        annotation_path = directory / 'annotations.json'
        if annotation_path.exists():
            existing = json.loads(annotation_path.read_text())
            if existing != annotations:
                raise ValueError(f'{partition} prepared annotations changed')
        else:
            save_json(annotation_path, annotations)
        report.update(annotation_sha256=annotation_hash, prepared_sha256=prepared_hash, downloaded_images=sum(
            (directory / image['file_name']).exists() for image in annotations['images']))
        manifest['partitions'][partition] = report
        save_json(manifest_path, manifest)
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', required=True)
    parser.add_argument('--split', default='ml/case_split.json')
    parser.add_argument('--partition', choices=['train', 'val', 'both'], default='both')
    parser.add_argument('--limit', type=int, help='Download first N images per partition for a bounded check')
    args = parser.parse_args()
    if args.limit is not None and args.limit < 1:
        parser.error('--limit must be positive')
    from remotezip import RemoteZip
    partitions = ('train', 'val') if args.partition == 'both' else (args.partition,)
    with RemoteZip(URL, timeout=60) as archive:
        result = fetch(archive, args.output_dir, Path(args.split).read_bytes(), partitions, args.limit)
    print(json.dumps({p: result['partitions'][p]['downloaded_images'] for p in partitions}, indent=2))
