"""Export sparse anatomy predictions for exact decoded video frames.

Frames are chosen by player time. Each requested second maps to the nearest decoded
frame index, and the artifact timestamp is that frame's presentation time
(stream start + index / fps), so no dataset offset is applied to decoded frames.
The video is decoded once as raw RGB and only the selected frames are kept.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess


from PIL import Image

from artifact import validate
from train_anatomy import CATEGORIES

NAMES = {c['id']: c['name'] for c in CATEGORIES}


def sha(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def probe_video(ffmpeg, video):
    result = subprocess.run([ffmpeg, '-hide_banner', '-i', str(video)], capture_output=True, text=True)
    stream = next((line for line in result.stderr.splitlines() if 'Video:' in line), '')
    dimensions = re.search(r'(\d+)x(\d+) \[SAR (\d+):(\d+)', stream)
    rate = re.search(r', ([\d.]+) fps,', stream)
    timing = re.search(r'Duration: (\d+):(\d+):([\d.]+), start: (-?[\d.]+)', result.stderr)
    if not dimensions or not rate or not timing:
        raise ValueError('could not verify decoded dimensions, pixel aspect ratio, frame rate and duration')
    width, height, sar_n, sar_d = map(int, dimensions.groups())
    hours, minutes, seconds, start = timing.groups()
    return dict(width=width, height=height, pixel_aspect_ratio=f'{sar_n}:{sar_d}', fps=float(rate.group(1)),
                duration_sec=int(hours)*3600 + int(minutes)*60 + float(seconds), start_sec=float(start))


def frame_indices(seconds, fps, start):
    """Map player seconds to unique decoded frame indices (nearest frame)."""
    indices = sorted({round((t - start) * fps) for t in seconds})
    if not indices or indices[0] < 0:
        raise ValueError('requested times precede the video stream')
    return indices


def iter_frames(ffmpeg, video, indices, width, height):
    """Decode the video once as raw RGB and yield (index, image, sha256 of raw RGB) for requested indices."""
    wanted, size = set(indices), width * height * 3
    process = subprocess.Popen([ffmpeg, '-nostdin', '-v', 'error', '-i', str(video), '-fps_mode', 'passthrough',
                                '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], stdout=subprocess.PIPE)
    found, index = 0, 0
    try:
        while found < len(wanted):
            raw = process.stdout.read(size)
            if len(raw) < size:
                break
            if index in wanted:
                found += 1
                yield index, Image.frombytes('RGB', (width, height), raw), hashlib.sha256(raw).hexdigest()
            index += 1
    finally:
        process.stdout.close(); process.kill(); process.wait()
    if found != len(wanted):
        raise ValueError(f'decoded {found} frames, expected {len(wanted)}; check requested times and video length')


def thresholds_for(default, overrides):
    thresholds = {name: default for name in NAMES.values()}
    for name, value in overrides.items():
        if name not in thresholds or not 0 <= value <= 1:
            raise ValueError(f'invalid class threshold: {name}={value}')
        thresholds[name] = value
    return thresholds


def detections_for(result, size, frame_id, thresholds):
    detections = []
    for index, (box, label, score) in enumerate(zip(result['boxes'].tolist(),
             result['labels'].tolist(), result['scores'].tolist())):
        if label not in NAMES or score < thresholds[NAMES[label]]:
            continue
        x1, y1, x2, y2 = box
        x1, x2 = max(0, x1), min(size[0], x2)
        y1, y2 = max(0, y1), min(size[1], y2)
        if x1 >= x2 or y1 >= y2:
            continue
        bbox = [round(x1/size[0], 4), round(y1/size[1], 4), round(x2/size[0], 4), round(y2/size[1], 4)]
        if bbox[0] >= bbox[2] or bbox[1] >= bbox[3]:
            continue
        detections.append(dict(instance_id=f'{frame_id:06}-{index}', category='anatomy', label=NAMES[label],
                               score=round(score, 3), bbox_xyxy=bbox))
    return detections


def export(model, video, seconds, ffmpeg, case_id, asset_id, fps, display_width=None, display_height=None,
           score_threshold=.3, class_thresholds=None, max_age_sec=.12, provenance=None):
    import torch
    from torchvision.transforms.functional import pil_to_tensor
    stream = probe_video(ffmpeg, video)
    if abs(stream['fps'] - fps) > 1e-6:
        raise ValueError('requested frame rate disagrees with the video')
    thresholds = thresholds_for(score_threshold, class_thresholds or {})
    indices = frame_indices(seconds, fps, stream['start_sec'])
    frames, source_hashes = [], {}
    model.eval()
    for frame_id, image, digest in iter_frames(ffmpeg, video, indices, stream['width'], stream['height']):
        source_hashes[f'{frame_id:06}'] = digest
        with torch.inference_mode():
            result = model([pil_to_tensor(image).float() / 255])[0]
        frames.append(dict(frame_id=frame_id, timestamp_sec=round(stream['start_sec'] + frame_id/fps, 6),
                           detections=detections_for(result, image.size, frame_id, thresholds)))
    artifact = dict(schema_version=1, case_id=case_id, video_asset_id=asset_id,
        source='prediction', image_width=stream['width'], image_height=stream['height'],
        max_age_sec=max_age_sec, frames=frames,
        provenance=dict(provenance or {}, video_sha256=sha(video),
                        source_frames=dict(count=len(source_hashes), digest=hashlib.sha256(''.join(
                            f'{name}:{digest}\n' for name, digest in sorted(source_hashes.items())).encode()).hexdigest(),
                            digest_input='sorted lines "<frame_id:06>:<sha256 of decoded rgb24 bytes>\\n"'),
                        fps=fps, video_stream=stream,
                        timebase='frame_id is the decoded frame index; timestamp_sec = stream start + frame_id / fps',
                        class_map={str(k): v for k, v in NAMES.items()}, score_thresholds=thresholds,
                        quality='experimental, not medically reviewed'))
    if display_width is not None or display_height is not None:
        artifact.update(display_width=display_width, display_height=display_height)
    return validate(artifact)


def parse_class_threshold(text):
    name, separator, value = text.rpartition('=')
    if not separator:
        raise argparse.ArgumentTypeError('use "class name=threshold"')
    return name.strip(), float(value)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--checkpoint', required=True)
    parser.add_argument('--video', required=True)
    parser.add_argument('--case-id', required=True)
    parser.add_argument('--video-asset-id', required=True)
    times = parser.add_mutually_exclusive_group(required=True)
    times.add_argument('--seconds', nargs='+', type=float, help='Player times to sample')
    times.add_argument('--every-sec', type=float, help='Sample the whole video (or --start/--end) at this interval')
    parser.add_argument('--start', type=float, default=0)
    parser.add_argument('--end', type=float)
    parser.add_argument('--fps', type=float, default=25)
    parser.add_argument('--display-width', type=int)
    parser.add_argument('--display-height', type=int)
    parser.add_argument('--score-threshold', type=float, default=.3)
    parser.add_argument('--class-threshold', type=parse_class_threshold, action='append', default=[],
                        help='Per-class override, e.g. "cystic duct=0.7"')
    parser.add_argument('--max-age-sec', type=float, default=.12)
    parser.add_argument('--ffmpeg', default='ffmpeg')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    if args.fps <= 0 or not 0 <= args.score_threshold <= 1:
        parser.error('fps or threshold out of range')
    if args.seconds is not None and any(t < 0 for t in args.seconds):
        parser.error('times must be nonnegative')
    if args.every_sec is not None and args.every_sec <= 0:
        parser.error('--every-sec must be positive')
    output = Path(args.output)
    if output.exists():
        parser.error(f'refusing to overwrite {output}')
    import torch
    from torchvision.models.detection import fasterrcnn_mobilenet_v3_large_320_fpn
    from torchvision.models.detection.faster_rcnn import FastRCNNPredictor
    stream = probe_video(args.ffmpeg, args.video)
    if args.every_sec is not None:
        end = stream['start_sec'] + stream['duration_sec'] - 1/args.fps if args.end is None else args.end
        count = int((end - args.start) / args.every_sec + 1e-9) + 1
        seconds = [args.start + i*args.every_sec for i in range(count)]
    else:
        seconds = args.seconds
    model = fasterrcnn_mobilenet_v3_large_320_fpn(weights=None, weights_backbone=None)
    model.roi_heads.box_predictor = FastRCNNPredictor(model.roi_heads.box_predictor.cls_score.in_features, 3)
    checkpoint = torch.load(args.checkpoint, map_location='cpu', weights_only=False)
    model.load_state_dict(checkpoint['model'])
    report = Path(args.checkpoint).parent / 'report.json'
    provenance = dict(checkpoint_sha256=sha(args.checkpoint), checkpoint_epoch=checkpoint.get('epoch'),
                      data_signature=checkpoint['data_signature'],
                      training_report_sha256=sha(report) if report.exists() else None,
                      validation_status=json.loads(report.read_text()).get('status') if report.exists() else 'unknown',
                      sampling=dict(every_sec=args.every_sec, start=args.start, end=args.end) if args.every_sec else 'explicit seconds')
    artifact = export(model, args.video, seconds, args.ffmpeg, args.case_id, args.video_asset_id, args.fps,
        args.display_width, args.display_height, args.score_threshold, dict(args.class_threshold),
        args.max_age_sec, provenance)
    text = json.dumps(artifact, separators=(',', ':'), allow_nan=False) + '\n'
    with output.open('x') as stream_out:
        stream_out.write(text)
    print(args.output, 'frames', len(artifact['frames']), 'detections',
          sum(len(f['detections']) for f in artifact['frames']), 'characters', len(text))


if __name__ == '__main__':
    main()
