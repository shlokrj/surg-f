"""Export sparse anatomy predictions for exact decoded video frames."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess

from PIL import Image

from artifact import validate
from train_anatomy import CATEGORIES


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
    if not dimensions or not rate:
        raise ValueError('could not verify decoded dimensions, pixel aspect ratio and frame rate')
    width, height, sar_n, sar_d = map(int, dimensions.groups())
    return dict(width=width, height=height, pixel_aspect_ratio=f'{sar_n}:{sar_d}',
                fps=float(rate.group(1)))


def extract_frame(ffmpeg, video, frame_id):
    command = [ffmpeg, '-nostdin', '-v', 'error', '-i', str(video), '-vf',
               f'select=eq(n\\,{frame_id})', '-fps_mode', 'passthrough', '-frames:v', '1',
               '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1']
    result = subprocess.run(command, capture_output=True, check=True)
    if not result.stdout:
        raise ValueError(f'video has no decoded frame {frame_id}')
    with Image.open(io.BytesIO(result.stdout)) as image:
        rgb = image.convert('RGB')
        size = rgb.size
    return rgb, size, hashlib.sha256(result.stdout).hexdigest()


def export(model, video, frame_ids, ffmpeg, case_id, asset_id, fps, offset,
           display_width=None, display_height=None, score_threshold=.3,
           provenance=None):
    import torch
    from torchvision.transforms.functional import pil_to_tensor
    stream = probe_video(ffmpeg, video)
    if abs(stream['fps'] - fps) > 1e-6:
        raise ValueError('requested frame rate disagrees with the video')
    frames, dimensions, source_hashes = [], None, {}
    model.eval()
    for frame_id in sorted(set(frame_ids)):
        image, size, image_hash = extract_frame(ffmpeg, video, frame_id)
        if dimensions is not None and size != dimensions:
            raise ValueError('video decoded dimensions vary between frames')
        if size != (stream['width'], stream['height']):
            raise ValueError('decoded frame disagrees with video stream dimensions')
        dimensions = size
        source_hashes[f'{frame_id:06}.png'] = image_hash
        pixels = pil_to_tensor(image).float() / 255
        with torch.inference_mode():
            result = model([pixels])[0]
        detections = []
        for index, (box, label, score) in enumerate(zip(result['boxes'].tolist(),
                 result['labels'].tolist(), result['scores'].tolist())):
            if score < score_threshold or label not in (1, 2):
                continue
            x1, y1, x2, y2 = box
            x1, x2 = max(0, x1), min(size[0], x2)
            y1, y2 = max(0, y1), min(size[1], y2)
            if x1 >= x2 or y1 >= y2:
                continue
            detections.append(dict(instance_id=f'{frame_id:06}-{index}',
                category='anatomy', label=CATEGORIES[label-1]['name'], score=score,
                bbox_xyxy=[x1/size[0], y1/size[1], x2/size[0], y2/size[1]]))
        frames.append(dict(frame_id=frame_id, timestamp_sec=frame_id/fps+offset,
                           detections=detections))
    if dimensions is None:
        raise ValueError('at least one video frame is required')
    artifact = dict(schema_version=1, case_id=case_id, video_asset_id=asset_id,
        source='prediction', image_width=dimensions[0], image_height=dimensions[1],
        max_age_sec=.12, frames=frames,
        provenance=dict(provenance or {}, video_sha256=sha(video),
                        source_image_sha256=source_hashes, fps=fps,
                        video_stream=stream,
                        time_offset_sec=offset, class_map={1:'cystic duct',2:'gallbladder'},
                        quality='experimental, not medically reviewed'))
    if display_width is not None or display_height is not None:
        artifact.update(display_width=display_width, display_height=display_height)
    return validate(artifact)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--checkpoint', required=True)
    parser.add_argument('--video', required=True)
    parser.add_argument('--case-id', required=True)
    parser.add_argument('--video-asset-id', required=True)
    parser.add_argument('--frame-ids', nargs='+', type=int, required=True)
    parser.add_argument('--fps', type=float, default=25)
    parser.add_argument('--time-offset', type=float, default=-.04)
    parser.add_argument('--display-width', type=int)
    parser.add_argument('--display-height', type=int)
    parser.add_argument('--score-threshold', type=float, default=.3)
    parser.add_argument('--ffmpeg', default='ffmpeg')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    if any(frame < 0 for frame in args.frame_ids) or args.fps <= 0 or not 0 <= args.score_threshold <= 1:
        parser.error('frame IDs, fps or threshold out of range')
    import torch
    from torchvision.models.detection import fasterrcnn_mobilenet_v3_large_320_fpn
    from torchvision.models.detection.faster_rcnn import FastRCNNPredictor
    model = fasterrcnn_mobilenet_v3_large_320_fpn(weights=None, weights_backbone=None)
    model.roi_heads.box_predictor = FastRCNNPredictor(model.roi_heads.box_predictor.cls_score.in_features, 3)
    checkpoint = torch.load(args.checkpoint, map_location='cpu', weights_only=False)
    model.load_state_dict(checkpoint['model'])
    report = Path(args.checkpoint).parent / 'report.json'
    provenance = dict(checkpoint_sha256=sha(args.checkpoint), data_signature=checkpoint['data_signature'],
                      training_report_sha256=sha(report) if report.exists() else None,
                      validation_status=json.loads(report.read_text()).get('status') if report.exists() else 'unknown')
    artifact = export(model, args.video, args.frame_ids, args.ffmpeg, args.case_id,
        args.video_asset_id, args.fps, args.time_offset, args.display_width,
        args.display_height, args.score_threshold, provenance)
    with Path(args.output).open('x') as stream:
        json.dump(artifact, stream, indent=2, allow_nan=False)
        stream.write('\n')
    print(args.output, 'frames', len(artifact['frames']))


if __name__ == '__main__':
    main()
