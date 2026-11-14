"""Extract frozen SurgVLP image features for one CholecT50 case.

Image branch and preprocessing follow CAMMA-public/SurgVLP at 85e8589.
The text encoder is not needed for cached image features. See ml/README.md.
"""
import argparse
import csv
import hashlib
import json
import re
import shutil
import tempfile
from pathlib import Path

import ijson
import numpy as np

UPSTREAM_REVISION = '85e858998eec47614614b89f6af1363e0ad3f47b'
CHECKPOINT_URL = 'https://seafile.unistra.fr/f/93757ace1bfc47248e1e/?dl=1'
CHECKPOINT_SHA256 = '4db3eb9dc53aa46f69a8adaeffa115fa75c9a15c08e60638011b812a6b128b3d'
PREPROCESSING = {
    'resize_hw': [360, 640], 'center_crop': 224, 'color': 'RGB',
    'interpolation': 'bilinear', 'antialias': True,
    'mean': [0.485, 0.456, 0.406], 'std': [0.229, 0.224, 0.225],
    'feature_normalization': 'none',
}


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def case_rows(samples, case_id):
    """Stream the labels file; retain only one case and reject ambiguous joins."""
    if not re.fullmatch(r'VID\d+', case_id):
        raise ValueError('case_id must be a CholecT50 VID number')
    rows = {}
    with open(samples, 'rb') as f:
        for sample in ijson.items(f, 'samples.item'):
            if sample.get('video_id') != case_id:
                continue
            frame = sample.get('frame_number')
            if type(frame) is not int or frame < 0 or frame in rows:
                raise ValueError(f'invalid or duplicate frame ID: {frame}')
            labels = sample.get('instruments')
            # Missing annotation is unknown, never a negative training label.
            labels = None if labels is None else sorted({x['label'] for x in labels['classifications']})
            rows[frame] = {'case_id': case_id, 'frame_id': frame, 'instruments': labels}
    if not rows:
        raise ValueError(f'{case_id} is absent from samples')
    if sorted(rows) != list(range(len(rows))):
        raise ValueError('case frame IDs must be contiguous from zero')
    return [rows[i] for i in sorted(rows)]


def load_encoder(checkpoint, device):
    """Load only the official image branch, strictly, with no random fallback."""
    import torch
    from torchvision import models, transforms

    class ImageEncoder(torch.nn.Module):
        def __init__(self):
            super().__init__()
            self.model = models.resnet50(weights=None)
            self.model.fc = torch.nn.Identity()
            self.global_embedder = torch.nn.Linear(2048, 768)

        def forward(self, images):
            return self.global_embedder(self.model(images))

    if sha256(checkpoint) != CHECKPOINT_SHA256:
        raise ValueError('checkpoint does not match the verified official SurgVLP weights')
    state = torch.load(checkpoint, map_location='cpu', weights_only=True)
    prefix = 'backbone_img.'
    image_state = {k[len(prefix):]: v for k, v in state.items() if k.startswith(prefix)}
    model = ImageEncoder()
    model.load_state_dict(image_state, strict=True)
    model.requires_grad_(False).eval().to(device)
    preprocess = transforms.Compose([
        transforms.Resize((360, 640), interpolation=transforms.InterpolationMode.BILINEAR, antialias=True),
        transforms.CenterCrop(224), transforms.ToTensor(),
        transforms.Normalize(PREPROCESSING['mean'], PREPROCESSING['std']),
    ])
    return model, preprocess


def validate_bundle(bundle, samples=None, require_complete=False):
    bundle = Path(bundle)
    metadata = json.loads((bundle / 'metadata.json').read_text())
    features = np.load(bundle / 'features.npy', allow_pickle=False)
    with (bundle / 'manifest.csv').open(newline='') as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != ['case_id', 'frame_id']:
            raise ValueError('manifest must have exactly case_id,frame_id columns')
        manifest = list(reader)
    if features.dtype != np.float32 or features.shape != (len(manifest), 768) or not manifest:
        raise ValueError('expected nonempty float32 [frames,768] features matching manifest')
    if not np.isfinite(features).all() or np.any(np.linalg.norm(features, axis=1) == 0):
        raise ValueError('features contain nonfinite or zero rows')
    ids = [int(row['frame_id']) for row in manifest]
    if ids != sorted(set(ids)) or ids[0] < 0:
        raise ValueError('manifest IDs must be unique, nonnegative and sorted')
    if any(row['case_id'] != metadata['case_id'] for row in manifest):
        raise ValueError('mixed or incorrect case IDs')
    if metadata['shape'] != list(features.shape):
        raise ValueError('metadata shape mismatch')
    complete = ids == list(range(metadata['total_case_frames']))
    if metadata['complete_case'] != complete or (require_complete and not complete):
        raise ValueError('partial or incorrectly marked case bundle')
    for name, expected in metadata['file_sha256'].items():
        if name not in {'features.npy', 'manifest.csv', 'annotations.json'}:
            raise ValueError('unexpected hashed file')
        if sha256(bundle / name) != expected:
            raise ValueError(f'checksum mismatch: {name}')
    if set(metadata['file_sha256']) != {'features.npy', 'manifest.csv', 'annotations.json'}:
        raise ValueError('missing bundle checksum')
    annotations = json.loads((bundle / 'annotations.json').read_text())
    if [(r['case_id'], r['frame_id']) for r in annotations] != [(r['case_id'], int(r['frame_id'])) for r in manifest]:
        raise ValueError('annotation rows do not align with manifest')
    if samples is not None:
        source = case_rows(samples, metadata['case_id'])
        if len(source) != metadata['total_case_frames'] or any(i >= len(source) for i in ids):
            raise ValueError('source case frame count mismatch')
        if annotations != [source[i] for i in ids]:
            raise ValueError('annotation join differs from source labels')
    return metadata


def extract(samples, case_id, frames_dir, checkpoint, output, device='cpu', batch_size=16, start=0, end=None):
    import torch
    import torchvision
    from PIL import Image

    rows = case_rows(samples, case_id)
    total = len(rows)
    end = total if end is None else end
    if batch_size < 1 or not 0 <= start < end <= total:
        raise ValueError('invalid batch size or frame interval')
    selected = rows[start:end]
    frames_dir, output = Path(frames_dir), Path(output)
    if output.exists():
        raise FileExistsError(f'refusing to overwrite {output}')
    for row in selected:
        p = frames_dir / f"{row['frame_id']:06d}.png"
        if not p.is_file():
            raise FileNotFoundError(p)
    if device == 'cuda' and not torch.cuda.is_available():
        raise RuntimeError('CUDA requested but unavailable; attach a GPU cluster')
    if device == 'cpu':
        torch.set_num_threads(min(4, torch.get_num_threads()))
    model, preprocess = load_encoder(checkpoint, device)
    batches = []
    with torch.inference_mode():
        for offset in range(0, len(selected), batch_size):
            tensors = []
            for row in selected[offset:offset + batch_size]:
                with Image.open(frames_dir / f"{row['frame_id']:06d}.png") as image:
                    tensors.append(preprocess(image.convert('RGB')))
            batches.append(model(torch.stack(tensors).to(device)).float().cpu().numpy())
            print(f'{case_id}: {min(offset + batch_size, len(selected))}/{len(selected)} frames', flush=True)
    features = np.concatenate(batches).astype(np.float32)
    output.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f'.{output.name}-', dir=output.parent))
    try:
        np.save(staging / 'features.npy', features, allow_pickle=False)
        with (staging / 'manifest.csv').open('w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['case_id', 'frame_id'])
            writer.writerows((case_id, row['frame_id']) for row in selected)
        (staging / 'annotations.json').write_text(json.dumps(selected, indent=2) + '\n')
        metadata = {
            'case_id': case_id, 'total_case_frames': total, 'complete_case': start == 0 and end == total,
            'shape': list(features.shape), 'dtype': str(features.dtype), 'model': 'SurgVLP',
            'upstream_revision': UPSTREAM_REVISION, 'checkpoint_url': CHECKPOINT_URL,
            'checkpoint_sha256': sha256(checkpoint), 'samples_sha256': sha256(samples),
            'preprocessing': PREPROCESSING, 'device': device,
            'torch': torch.__version__, 'torchvision': torchvision.__version__,
            'file_sha256': {name: sha256(staging / name) for name in ['features.npy', 'manifest.csv', 'annotations.json']},
        }
        (staging / 'metadata.json').write_text(json.dumps(metadata, indent=2) + '\n')
        validate_bundle(staging, samples)
        # Only a fully written, validated directory becomes the local output.
        staging.rename(output)
    finally:
        if staging.exists():
            shutil.rmtree(staging)
    return metadata


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    run = sub.add_parser('extract')
    for name in ['samples', 'case-id', 'frames-dir', 'checkpoint', 'output']:
        run.add_argument('--' + name, required=True)
    run.add_argument('--device', choices=['cpu', 'cuda', 'mps'], default='cpu')
    run.add_argument('--batch-size', type=int, default=16)
    run.add_argument('--start', type=int, default=0)
    run.add_argument('--end', type=int)
    check = sub.add_parser('validate')
    check.add_argument('bundle')
    check.add_argument('--samples')
    check.add_argument('--require-complete', action='store_true')
    args = vars(parser.parse_args())
    command = args.pop('command')
    metadata = extract(**args) if command == 'extract' else validate_bundle(**args)
    print(json.dumps(metadata, indent=2))


if __name__ == '__main__':
    main()
