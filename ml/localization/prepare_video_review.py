"""Build a reviewer pack to measure anatomy-box accuracy on a playable case video.

Samples a fixed, seeded set of decoded frames: half inside intervals where the
CholecT50 triplet annotations name a target (default cystic_duct), half spread over
the whole video. Writes, to a new directory outside Git:

  frames/<frame_id>.png     decoded frames for the reviewer
  reference.json            COCO for cystic duct / gallbladder, empty unless --prefill;
                            every image has is_det_keyframe=false until a reviewer
                            has boxed every visible instance and sets it true
  predictions.json          raw (unthresholded) model predictions for the same frames,
                            in the format evaluate_anatomy_coco.py reads
  manifest.json             video/checkpoint hashes, sampling, frame hashes, instructions

evaluate_anatomy_coco.py refuses unreviewed frames, so no accuracy is reported until
someone has actually reviewed them. Prefilled boxes can anchor a reviewer; the default
is a blank reference.
"""
import argparse
import csv
import hashlib
import json
from pathlib import Path
import random

from export_anatomy_video import iter_frames, probe_video, sha
from train_anatomy import CATEGORIES, build_model


def sample_seconds(intervals, duration, count, seed, start=0.0):
    """Half from annotated [start, end) intervals, half uniform over the video; unique, sorted."""
    rng = random.Random(seed)
    targeted, spread = count // 2, count - count // 2
    picks = set()
    total = sum(end - begin for begin, end in intervals)
    for _ in range(targeted if total > 0 else 0):
        offset = rng.uniform(0, total)
        for begin, end in intervals:
            if offset < end - begin:
                picks.add(round(begin + offset, 2)); break
            offset -= end - begin
    step = duration / spread
    for i in range(spread):
        picks.add(round(start + step * (i + rng.random()), 2))
    return sorted(t for t in picks if start <= t < start + duration)


def target_intervals(csv_path, case_id, target):
    with open(csv_path, newline='') as stream:
        return [(float(r['start_sec']), float(r['end_sec'])) for r in csv.DictReader(stream)
                if r['case_id'] == case_id and r['target'] == target]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--checkpoint', required=True)
    parser.add_argument('--video', required=True)
    parser.add_argument('--case-id', required=True)
    parser.add_argument('--triplets', default='shared/triplets.annotation.csv')
    parser.add_argument('--target', default='cystic_duct')
    parser.add_argument('--count', type=int, default=60)
    parser.add_argument('--seed', type=int, default=11)
    parser.add_argument('--fps', type=float, default=25)
    parser.add_argument('--prefill', type=float, help='Copy model boxes at or above this score into reference.json')
    parser.add_argument('--ffmpeg', default='ffmpeg')
    parser.add_argument('--output-dir', required=True)
    args = parser.parse_args()
    if args.count < 2:
        parser.error('--count must be at least 2')
    out = Path(args.output_dir)
    if out.exists():
        parser.error(f'refusing to reuse {out}')
    import torch
    from torchvision.transforms.functional import pil_to_tensor
    stream = probe_video(args.ffmpeg, args.video)
    if abs(stream['fps'] - args.fps) > 1e-6:
        raise ValueError('requested frame rate disagrees with the video')
    intervals = target_intervals(args.triplets, args.case_id, args.target)
    seconds = sample_seconds(intervals, stream['duration_sec'] - 1/args.fps, args.count, args.seed, stream['start_sec'])
    indices = sorted({round((t - stream['start_sec']) * args.fps) for t in seconds})
    checkpoint = torch.load(args.checkpoint, map_location='cpu', weights_only=False)
    architecture = checkpoint.get('architecture', 'mobilenet_v3_320')
    model, _ = build_model(architecture, pretrained=False)
    model.load_state_dict(checkpoint['model']); model.eval()
    (out / 'frames').mkdir(parents=True)
    images, annotations, predictions, frame_hashes = [], [], [], {}
    for frame_id, image, _ in iter_frames(args.ffmpeg, args.video, indices, stream['width'], stream['height']):
        name = f'{frame_id:06}.png'
        image.save(out / 'frames' / name)
        frame_hashes[name] = sha(out / 'frames' / name)
        timestamp = round(stream['start_sec'] + frame_id / args.fps, 3)
        in_target = any(begin <= timestamp < end for begin, end in intervals)
        images.append(dict(id=frame_id, file_name=name, width=image.width, height=image.height,
                           timestamp_sec=timestamp, annotated_target_interval=in_target,
                           is_det_keyframe=False))
        with torch.inference_mode():
            result = model([pil_to_tensor(image).float() / 255])[0]
        boxes = [[round(v, 2) for v in box] for box in result['boxes'].tolist()]
        labels, scores = result['labels'].tolist(), [round(s, 4) for s in result['scores'].tolist()]
        predictions.append(dict(image_id=frame_id, boxes=boxes, labels=labels, scores=scores))
        if args.prefill is not None:
            for box, label, score in zip(boxes, labels, scores):
                if score >= args.prefill and label in (1, 2):
                    x1, y1, x2, y2 = box
                    annotations.append(dict(id=len(annotations) + 1, image_id=frame_id, category_id=label,
                                            bbox=[x1, y1, x2 - x1, y2 - y1], iscrowd=0, model_prefill=True))
    reference = dict(images=images, annotations=annotations, categories=CATEGORIES,
                     info=dict(status='unreviewed', case_id=args.case_id))
    (out / 'reference.json').write_text(json.dumps(reference, indent=1) + '\n')
    (out / 'predictions.json').write_text(json.dumps(predictions) + '\n')
    manifest = dict(case_id=args.case_id, video_sha256=sha(args.video), video_stream=stream,
                    checkpoint_sha256=sha(args.checkpoint), checkpoint_epoch=checkpoint.get('epoch'),
                    architecture=architecture, data_signature=checkpoint.get('data_signature'),
                    sampling=dict(seed=args.seed, count=args.count, target=args.target,
                                  triplets_sha256=hashlib.sha256(Path(args.triplets).read_bytes()).hexdigest(),
                                  target_intervals=intervals, frames=len(images),
                                  frames_in_target_intervals=sum(i['annotated_target_interval'] for i in images)),
                    prefill_score=args.prefill, frame_png_sha256=frame_hashes,
                    instructions=('Import frames/ and reference.json into a COCO box tool. Box every visible cystic duct '
                                  'and gallbladder in each frame (none is a valid answer), remove or fix any prefilled box, '
                                  'set is_det_keyframe=true only on fully reviewed frames, record the reviewer in info, '
                                  'then run evaluate_anatomy_coco.py reference.json predictions.json --output metrics.json.'))
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=1) + '\n')
    print(out, 'frames', len(images), 'in target intervals', manifest['sampling']['frames_in_target_intervals'])


if __name__ == '__main__':
    main()
