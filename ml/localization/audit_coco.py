"""Inventory actual spatial annotations, without treating empty label files as negatives."""
import argparse
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import zipfile


def audit(data):
    images = {image['id']: image for image in data['images']}
    categories = {category['id']: category['name'] for category in data['categories']}
    duplicate_images = len(data['images']) - len(images)
    duplicate_categories = len(data['categories']) - len(categories)
    if (duplicate_images or duplicate_categories) and data['annotations']:
        raise ValueError('ambiguous annotation references: duplicate image or category IDs')
    counts, cases, invalid, annotated = Counter(), Counter(), Counter(), set()
    for annotation in data['annotations']:
        image = images.get(annotation.get('image_id'))
        label = categories.get(annotation.get('category_id'))
        if image is None or label is None:
            invalid['unknown_reference'] += 1
            continue
        box = annotation.get('bbox')
        if not isinstance(box, list) or len(box) != 4 or any(type(v) not in (int,float) or not math.isfinite(v) for v in box):
            invalid['invalid_box'] += 1
            continue
        x,y,w,h = box
        if x < 0 or y < 0 or w <= 0 or h <= 0 or x+w > image['width']+1e-6 or y+h > image['height']+1e-6:
            invalid['out_of_bounds_or_empty'] += 1
            continue
        if annotation.get('iscrowd',0) or annotation.get('ignore',0):
            invalid['crowd_or_ignored'] += 1
            continue
        counts[label] += 1
        annotated.add(image['id'])
        cases[Path(image['file_name']).stem.split('_')[0]] += 1
    return dict(image_records=len(data['images']), unique_images=len(images), duplicate_image_ids=duplicate_images, duplicate_category_ids=duplicate_categories, annotations=len(data['annotations']), valid_boxes=sum(counts.values()),
                images_with_valid_boxes=len(annotated), explicit_detection_keyframes=sum(i.get('is_det_keyframe') is True for i in images.values()),
                boxes_per_label=dict(sorted(counts.items())), boxes_per_source_case=dict(sorted(cases.items())),
                excluded=dict(invalid), category_inventory=categories,
                warning='Images without boxes are not assumed reviewed negatives. Source case IDs are dataset-specific; cross-dataset overlap must be checked.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input')
    parser.add_argument('--member', help='Explicit annotation JSON member within a ZIP')
    args = parser.parse_args()
    path = Path(args.input)
    if args.member:
        with zipfile.ZipFile(path) as archive:
            raw = archive.read(args.member)
    else:
        raw = path.read_bytes()
    report = audit(json.loads(raw))
    report['annotation_sha256'] = hashlib.sha256(raw).hexdigest()
    report['member'] = args.member
    print(json.dumps(report, indent=2))
