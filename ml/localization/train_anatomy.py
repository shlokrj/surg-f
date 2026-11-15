"""Train the two-class Endoscapes anatomy detector with validation-only selection."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import random
from urllib.parse import urlparse

from PIL import Image

from evaluate_anatomy_coco import evaluate

CATEGORIES = [{'id': 1, 'name': 'cystic duct', 'supercategory': 'anatomy'},
              {'id': 2, 'name': 'gallbladder', 'supercategory': 'anatomy'}]


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def ready_data(root, max_train=None, max_val=None):
    """Refuse missing, changed, or overlapping training/validation imagery."""
    root = Path(root)
    manifest = json.loads((root / 'manifest.json').read_text())
    subsets = {}
    selected_hashes = {}
    prepared_hashes = {}
    for partition, limit in (('train', max_train), ('val', max_val)):
        data = json.loads((root / partition / 'annotations.json').read_text())
        prepared_hash = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()
        recorded_hash = manifest['partitions'][partition].get('prepared_sha256')
        if recorded_hash and recorded_hash != prepared_hash:
            raise ValueError(f'{partition} prepared annotations changed')
        prepared_hashes[partition] = prepared_hash
        if data['categories'] != CATEGORIES or not data['images']:
            raise ValueError(f'{partition} anatomy categories/images are invalid')
        images = sorted(data['images'], key=lambda image: image['id'])
        if limit is not None:
            images = images[:limit]
        ids = {image['id'] for image in images}
        annotations = [a for a in data['annotations'] if a['image_id'] in ids]
        if any(a['category_id'] not in (1, 2) for a in annotations):
            raise ValueError('out-of-scope anatomy annotation')
        for image in images:
            name = image['file_name']
            if Path(name).name != name:
                raise ValueError('unsafe image filename')
            key = f'{partition}/{name}'
            path = root / key
            if not path.is_file() or manifest['files'].get(key) != sha(path):
                raise ValueError(f'missing or changed image: {key}')
            with Image.open(path) as decoded:
                if decoded.size != (image['width'], image['height']):
                    raise ValueError(f'image dimensions changed: {key}')
                decoded.verify()
            selected_hashes[key] = manifest['files'][key]
        subsets[partition] = dict(images=images, annotations=annotations, categories=CATEGORIES)
    train_cases = {i['video_id'] for i in subsets['train']['images']}
    val_cases = {i['video_id'] for i in subsets['val']['images']}
    if train_cases & val_cases:
        raise ValueError('train/validation surgery overlap')
    signature = hashlib.sha256(json.dumps(dict(split=manifest['split_sha256'],
        annotations={p: dict(source=manifest['partitions'][p]['annotation_sha256'],
                             prepared=prepared_hashes[p]) for p in subsets},
        files=selected_hashes), sort_keys=True).encode()).hexdigest()
    return subsets, signature


class Images:
    def __init__(self, root, partition, data):
        self.root = Path(root) / partition
        self.images = data['images']
        rows = {}
        for annotation in data['annotations']:
            rows.setdefault(annotation['image_id'], []).append(annotation)
        self.rows = rows

    def __len__(self):
        return len(self.images)

    def __getitem__(self, index):
        import torch
        from torchvision.transforms.functional import pil_to_tensor
        image = self.images[index]
        with Image.open(self.root / image['file_name']) as decoded:
            pixels = pil_to_tensor(decoded.convert('RGB')).float() / 255
        annotations = self.rows.get(image['id'], [])
        boxes = [[x, y, x+w, y+h] for x, y, w, h in (a['bbox'] for a in annotations)]
        target = dict(boxes=torch.tensor(boxes, dtype=torch.float32).reshape(-1, 4),
                      labels=torch.tensor([a['category_id'] for a in annotations], dtype=torch.int64))
        return pixels, target, image


def predictions_for(model, samples, device):
    import torch
    model.eval()
    output = []
    with torch.inference_mode():
        for pixels, _, image in samples:
            prediction = model([pixels.to(device)])[0]
            if not all(torch.isfinite(t).all() for t in prediction.values()):
                raise ValueError('nonfinite validation prediction')
            width, height = image['width'], image['height']
            boxes, labels, scores = [], [], []
            for box, label, score in zip(prediction['boxes'].tolist(), prediction['labels'].tolist(), prediction['scores'].tolist()):
                x1, y1, x2, y2 = box
                x1, x2 = max(0, x1), min(width, x2)
                y1, y2 = max(0, y1), min(height, y2)
                if x1 >= x2 or y1 >= y2:
                    continue
                boxes.append([x1, y1, x2, y2]); labels.append(label); scores.append(score)
            output.append(dict(image_id=image['id'], video_id=image['video_id'],
                               boxes=boxes, labels=labels, scores=scores))
    return output


def atomic_torch_save(torch, value, path):
    temporary = path.with_name(path.name + '.part')
    torch.save(value, temporary)
    os.replace(temporary, path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-dir', required=True)
    parser.add_argument('--output-dir', required=True)
    parser.add_argument('--epochs', type=int, default=5)
    parser.add_argument('--batch-size', type=int, default=2)
    parser.add_argument('--learning-rate', type=float, default=0.001)
    parser.add_argument('--seed', type=int, default=17)
    parser.add_argument('--device', default='cpu')
    parser.add_argument('--resume', action='store_true')
    parser.add_argument('--max-train-images', type=int, help='Bounded pipeline check; not an accuracy run')
    parser.add_argument('--max-val-images', type=int, help='Bounded pipeline check; not an accuracy run')
    args = parser.parse_args()
    if args.epochs < 1 or args.batch_size < 1 or args.learning_rate <= 0:
        parser.error('epochs, batch size and learning rate must be positive')
    if any(v is not None and v < 1 for v in (args.max_train_images, args.max_val_images)):
        parser.error('image limits must be positive')
    import torch
    import torchvision
    from torch.utils.data import DataLoader
    from torchvision.models.detection import fasterrcnn_mobilenet_v3_large_320_fpn, FasterRCNN_MobileNet_V3_Large_320_FPN_Weights
    from torchvision.models.detection.faster_rcnn import FastRCNNPredictor
    subsets, signature = ready_data(args.data_dir, args.max_train_images, args.max_val_images)
    out = Path(args.output_dir)
    if out.exists() and not args.resume:
        raise FileExistsError(out)
    out.mkdir(parents=True, exist_ok=True)
    random.seed(args.seed); torch.manual_seed(args.seed); torch.set_num_threads(4)
    train = Images(args.data_dir, 'train', subsets['train'])
    val = Images(args.data_dir, 'val', subsets['val'])
    loader = DataLoader(train, batch_size=args.batch_size, shuffle=True, num_workers=0,
                        collate_fn=lambda batch: tuple(zip(*batch)), generator=torch.Generator().manual_seed(args.seed))
    weights = FasterRCNN_MobileNet_V3_Large_320_FPN_Weights.COCO_V1
    model = fasterrcnn_mobilenet_v3_large_320_fpn(weights=weights)
    weight_file = Path(torch.hub.get_dir()) / 'checkpoints' / Path(urlparse(weights.url).path).name
    weights_sha256 = sha(weight_file)
    expected_prefix = weight_file.stem.rsplit('-', 1)[-1]
    if not weights_sha256.startswith(expected_prefix):
        raise ValueError('cached pretrained weights fail published hash prefix')
    model.roi_heads.box_predictor = FastRCNNPredictor(model.roi_heads.box_predictor.cls_score.in_features, 3)
    model.to(args.device)
    optimizer = torch.optim.SGD([p for p in model.parameters() if p.requires_grad], lr=args.learning_rate, momentum=.9)
    config = dict(batch_size=args.batch_size, learning_rate=args.learning_rate, device=args.device,
                  weights_sha256=weights_sha256)
    start, best_ap, history = 0, -1.0, []
    if args.resume:
        previous = torch.load(out / 'last.pt', map_location=args.device, weights_only=False)
        if previous['data_signature'] != signature or previous['seed'] != args.seed or previous['config'] != config:
            raise ValueError('resume data, seed or training configuration differs from checkpoint')
        model.load_state_dict(previous['model']); optimizer.load_state_dict(previous['optimizer'])
        start, best_ap, history = previous['epoch'] + 1, previous['best_ap'], previous['history']
        torch.set_rng_state(previous['torch_rng_state'])
        loader.generator.set_state(previous['loader_rng_state'])
        baseline = previous.get('baseline_validation')
    else:
        baseline = evaluate(subsets['val'], predictions_for(model, val, args.device))
    for epoch in range(start, args.epochs):
        model.train(); losses = []
        for pixels, targets, _ in loader:
            terms = model([x.to(args.device) for x in pixels],
                          [{k: v.to(args.device) for k, v in target.items()} for target in targets])
            loss = sum(terms.values())
            if not torch.isfinite(loss):
                raise ValueError('nonfinite training loss')
            optimizer.zero_grad(); loss.backward(); optimizer.step()
            losses.append(float(loss.detach()))
        predictions = predictions_for(model, val, args.device)
        metrics = evaluate(subsets['val'], predictions)
        ap = metrics['ap'] if metrics['ap'] is not None else -1.0
        history.append(dict(epoch=epoch, mean_loss=sum(losses)/len(losses), validation=metrics))
        improved = epoch == 0 or ap > best_ap
        if improved:
            best_ap = ap
        checkpoint = dict(model=model.state_dict(), optimizer=optimizer.state_dict(), epoch=epoch,
                          best_ap=best_ap, history=history, baseline_validation=baseline,
                          data_signature=signature,
                          seed=args.seed, config=config, torch_rng_state=torch.get_rng_state(),
                          loader_rng_state=loader.generator.get_state())
        atomic_torch_save(torch, checkpoint, out / 'last.pt')
        if improved:
            atomic_torch_save(torch, checkpoint, out / 'best.pt')
            (out / 'best-predictions.json').write_text(json.dumps(predictions))
        report = dict(status='bounded pipeline check' if args.max_train_images or args.max_val_images else 'full validation run',
                      architecture='fasterrcnn_mobilenet_v3_large_320_fpn', initial_weights=weights.name,
                      initial_weights_sha256=weights_sha256,
                      categories=CATEGORIES, seed=args.seed, device=args.device, epochs_requested=args.epochs,
                      train_images=len(train), validation_images=len(val), data_signature=signature,
                      torch=torch.__version__, torchvision=torchvision.__version__,
                      baseline_validation=baseline, best_ap=None if best_ap < 0 else best_ap,
                      history=history)
        temporary = out / 'report.json.part'
        temporary.write_text(json.dumps(report, indent=2, allow_nan=False) + '\n')
        os.replace(temporary, out / 'report.json')
        print(f'epoch {epoch+1}/{args.epochs}: loss={history[-1]["mean_loss"]:.4f}, AP={metrics["ap"]}', flush=True)


if __name__ == '__main__':
    main()
