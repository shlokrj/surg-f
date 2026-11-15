"""Prepare anatomy-only Endoscapes training COCO, guarding CholecT50 holdouts."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
from audit_coco import audit

# Primary-source README table at this immutable revision; IDs are dataset-specific.
OVERLAP_REVISION = '8347b9f4cb02ebe739747903e6eada272ee9d25e'
OVERLAPS = {2: 'VID68', 3: 'VID70', 10: 'VID96', 33: 'VID110', 121: 'VID66', 127: 'VID103'}
LABELS = {'cystic_duct': (1, 'cystic duct'), 'gallbladder': (2, 'gallbladder')}


def prepare(data, split):
    report = audit(data)
    if report['excluded'] or report['duplicate_image_ids']:
        raise ValueError('resolve invalid source annotations before preparation')
    protected = set(split['validation'] + split['test'] + split.get('diagnostic', []))
    excluded = {case for case, other in OVERLAPS.items() if other in protected}
    category_map = {c['id']: LABELS[c['name']][0] for c in data['categories'] if c['name'] in LABELS}
    if len(category_map) != len(LABELS):
        raise ValueError('missing required anatomy categories')
    images = []
    excluded_images = 0
    for image in data['images']:
        case = image.get('video_id')
        if type(case) is not int or not 1 <= case <= 120:
            raise ValueError('only official Endoscapes training surgeries 1-120 allowed')
        if image.get('is_det_keyframe') is not True:
            raise ValueError('unreviewed detection frame')
        if int(Path(image['file_name']).stem.split('_')[0]) != case:
            raise ValueError('filename and video ID disagree')
        if case in excluded:
            excluded_images += 1
        else:
            images.append(copy.deepcopy(image))
    keep = {image['id'] for image in images}
    annotations = []
    for annotation in data['annotations']:
        if annotation['image_id'] in keep and annotation['category_id'] in category_map:
            item = copy.deepcopy(annotation)
            item['category_id'] = category_map[item['category_id']]
            annotations.append(item)
    if not images or not annotations:
        raise ValueError('empty prepared training set')
    output = dict(images=images, annotations=annotations,
                  categories=[dict(id=i,name=name,supercategory='anatomy') for i,name in LABELS.values()])
    annotated = {a['image_id'] for a in annotations}
    manifest = dict(dataset='Endoscapes', scope='cystic duct and gallbladder only', split='official train',
                    overlap_source=f'https://github.com/CAMMA-public/camma_dataset_overlaps/blob/{OVERLAP_REVISION}/README.md',
                    protected_cholect50_cases=sorted(protected), excluded_endoscapes_cases=sorted(excluded & set(range(1,121))),
                    excluded_images=excluded_images, retained_surgeries=sorted({i['video_id'] for i in images}),
                    images=len(images), boxes=len(annotations), anatomy_negative_frames=len(keep-annotated),
                    categories=output['categories'], note='No liver or instrument subtype supervision. Overlap protection uses published mapping, not independent visual deduplication.')
    return output, manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('annotations')
    parser.add_argument('--split', default='ml/case_split.json')
    parser.add_argument('--output-dir', required=True)
    args = parser.parse_args()
    raw, split_raw = Path(args.annotations).read_bytes(), Path(args.split).read_bytes()
    data, manifest = prepare(json.loads(raw), json.loads(split_raw))
    manifest.update(annotation_sha256=hashlib.sha256(raw).hexdigest(), split_sha256=hashlib.sha256(split_raw).hexdigest())
    directory = Path(args.output_dir)
    directory.mkdir(parents=True, exist_ok=False)
    (directory/'train.json').write_text(json.dumps(data))
    (directory/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps(manifest,indent=2))
