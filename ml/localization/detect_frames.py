"""Offline Grounding DINO-T experiment on bounded full-resolution frame images."""
import argparse
import hashlib
import json
from pathlib import Path
import time
from artifact import validate

MODEL = 'IDEA-Research/grounding-dino-tiny'
PROMPTS = {'surgical grasper': ('instrument', 'grasper'), 'bipolar forceps': ('instrument', 'bipolar'),
           'surgical hook': ('instrument', 'hook'), 'surgical scissors': ('instrument', 'scissors'),
           'clip applier': ('instrument', 'clipper'), 'suction irrigation instrument': ('instrument', 'irrigator'),
           'gallbladder': ('anatomy', 'gallbladder'), 'liver': ('anatomy', 'liver'), 'cystic duct': ('anatomy', 'cystic duct')}


def digest(path):
    with open(path, 'rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--frames-dir', required=True)
    parser.add_argument('--frame-ids', type=int, nargs='+', required=True)
    parser.add_argument('--case-id', required=True)
    parser.add_argument('--video-asset-id', required=True)
    parser.add_argument('--time-offset', type=float, default=0)
    parser.add_argument('--threshold', type=float, default=0.3)
    parser.add_argument('--revision', help='HF commit; resolved and recorded when omitted')
    parser.add_argument('--device', choices=['cpu', 'cuda'], default='cpu')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    if len(args.frame_ids) > 100 or len(set(args.frame_ids)) != len(args.frame_ids) or min(args.frame_ids) < 0:
        parser.error('select 1-100 unique nonnegative frame IDs')
    if not 0 < args.threshold < 1:
        parser.error('threshold must be between zero and one')
    output = Path(args.output)
    if output.exists():
        raise FileExistsError(output)
    paths = [Path(args.frames_dir) / f'{index:06d}.png' for index in sorted(args.frame_ids)]
    if not all(path.is_file() for path in paths):
        raise FileNotFoundError('one or more source frames are missing')
    import torch
    import transformers
    from PIL import Image
    from huggingface_hub import HfApi, hf_hub_download
    from transformers import AutoProcessor, AutoModelForZeroShotObjectDetection
    revision = args.revision or HfApi().model_info(MODEL).sha
    processor = AutoProcessor.from_pretrained(MODEL, revision=revision)
    model = AutoModelForZeroShotObjectDetection.from_pretrained(MODEL, revision=revision).to(args.device).eval()
    weights = hf_hub_download(MODEL, 'model.safetensors', revision=revision)
    torch.set_num_threads(4)
    frames, timings, unmapped, dimensions = [], [], {}, None
    for path in paths:
        image = Image.open(path).convert('RGB')
        if dimensions is not None and image.size != dimensions:
            raise ValueError('mixed source dimensions')
        dimensions = image.size
        started = time.perf_counter()
        inputs = processor(images=image, text=' . '.join(PROMPTS) + ' .', return_tensors='pt').to(args.device)
        with torch.inference_mode():
            predictions = model(**inputs)
        results = processor.post_process_grounded_object_detection(
            predictions, inputs.input_ids, threshold=args.threshold, text_threshold=0.25,
            target_sizes=[image.size[::-1]])[0]
        detections = []
        for box, score, phrase in zip(results['boxes'].tolist(), results['scores'].tolist(), results['text_labels']):
            phrase = phrase.strip(' .').lower()
            if phrase not in PROMPTS:
                unmapped[phrase] = unmapped.get(phrase, 0) + 1
                continue
            category, label = PROMPTS[phrase]
            normalized = [max(0., min(1., v / dimensions[i % 2])) for i, v in enumerate(box)]
            if normalized[0] >= normalized[2] or normalized[1] >= normalized[3]:
                continue
            detections.append({'instance_id': f'{path.stem}-{len(detections)}', 'category': category,
                               'label': label, 'score': score, 'bbox_xyxy': normalized})
        seconds = time.perf_counter() - started
        timings.append(seconds)
        frames.append({'frame_id': int(path.stem), 'timestamp_sec': int(path.stem) + args.time_offset,
                       'detections': detections})
        print(f'{path.stem}: {len(detections)} boxes, {seconds:.2f}s', flush=True)
    artifact = {'schema_version': 1, 'case_id': args.case_id, 'video_asset_id': args.video_asset_id,
                'source': 'prediction', 'image_width': dimensions[0], 'image_height': dimensions[1],
                'max_age_sec': 0.12, 'frames': frames,
                'provenance': {'model_id': MODEL, 'model_revision': revision, 'weights_sha256': digest(weights),
                               'transformers': transformers.__version__, 'torch': torch.__version__,
                               'prompts': PROMPTS, 'box_threshold': args.threshold, 'text_threshold': 0.25,
                               'source_image_sha256': {p.name: digest(p) for p in paths},
                               'time_offset_sec': args.time_offset, 'inference_seconds': timings,
                               'unmapped_phrases': unmapped, 'quality': 'experimental; not surgically validated',
                               'tracking': False, 'source_dataset': 'CholecT50; CC BY-NC-SA 4.0'}}
    validate(artifact)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open('x') as stream:
        stream.write(json.dumps(artifact, indent=2, allow_nan=False) + '\n')
    print(output)


if __name__ == '__main__':
    main()
