"""Turn a labeling-tool COCO export (e.g. Label Studio "COCO") into a reviewed reference.

Matches exported images to pack frames by their six-digit frame file name (tools add
prefixes such as upload hashes), maps category names to cystic duct = 1 and
gallbladder = 2, and marks a frame reviewed (is_det_keyframe = true) only if it appears
in the export, which means the reviewer submitted it, including with no boxes.

  python ml/localization/import_review_labels.py PACK_DIR label-studio-export.json \
    --reviewer "Name" --output PACK_DIR/reference.reviewed.json
"""
import argparse
import json
from pathlib import Path
import re

from train_anatomy import CATEGORIES

NAMES = {'cystic duct': 1, 'cystic_duct': 1, 'gallbladder': 2}


def frame_key(file_name):
    match = re.search(r'(\d{6})\.png$', Path(file_name).name)
    if not match:
        raise ValueError(f'cannot find a six-digit frame name in {file_name}')
    return match.group(1) + '.png'


def convert(pack_reference, export, reviewer, allow_partial=False):
    frames = {image['file_name']: image for image in pack_reference['images']}
    categories = {}
    for category in export['categories']:
        name = category['name'].strip().lower()
        if name not in NAMES:
            raise ValueError(f'unexpected label "{category["name"]}"; use only cystic duct and gallbladder')
        categories[category['id']] = NAMES[name]
    exported = {}
    for image in export['images']:
        key = frame_key(image['file_name'])
        if key not in frames:
            raise ValueError(f'{key} is not part of this review pack')
        if key in exported.values():
            raise ValueError(f'{key} appears twice in the export')
        if (image.get('width'), image.get('height')) not in ((None, None), (frames[key]['width'], frames[key]['height'])):
            raise ValueError(f'{key} has different dimensions in the export')
        exported[image['id']] = key
    missing = sorted(set(frames) - set(exported.values()))
    if missing and not allow_partial:
        raise ValueError(f'{len(missing)} pack frames were not submitted (e.g. {missing[0]}); submit them or pass --allow-partial')
    images = [dict(frames[name], is_det_keyframe=name in exported.values()) for name in sorted(frames)]
    annotations = []
    for row in export['annotations']:
        frame = frames[exported[row['image_id']]]
        x, y, w, h = row['bbox']
        if w <= 0 or h <= 0 or x < -1 or y < -1 or x + w > frame['width'] + 1 or y + h > frame['height'] + 1:
            raise ValueError(f'box outside {frame["file_name"]}: {row["bbox"]}')
        x1, y1 = max(0.0, x), max(0.0, y)  # clip a sub-pixel overhang to the frame
        x2, y2 = min(float(frame['width']), x + w), min(float(frame['height']), y + h)
        x, y, w, h = x1, y1, x2 - x1, y2 - y1
        annotations.append(dict(id=len(annotations) + 1, image_id=frame['id'], category_id=categories[row['category_id']],
                                bbox=[round(x, 2), round(y, 2), round(w, 2), round(h, 2)], iscrowd=0))
    if not reviewer.strip():
        raise ValueError('record who reviewed the frames')
    info = dict(pack_reference.get('info', {}), status='reviewed' if not missing else 'partially reviewed',
                reviewer=reviewer.strip(), reviewed_frames=len(exported), boxes=len(annotations))
    return dict(images=images, annotations=annotations, categories=CATEGORIES, info=info)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('pack'); parser.add_argument('export')
    parser.add_argument('--reviewer', required=True)
    parser.add_argument('--allow-partial', action='store_true')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    reference = json.loads((Path(args.pack) / 'reference.json').read_text())
    result = convert(reference, json.loads(Path(args.export).read_text()), args.reviewer, args.allow_partial)
    with Path(args.output).open('x') as stream:
        stream.write(json.dumps(result, indent=1) + '\n')
    print(args.output, result['info'])


if __name__ == '__main__':
    main()
