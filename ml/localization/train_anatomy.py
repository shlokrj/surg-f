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
# Optional 3-class layout: Endoscapes' generic instrument boxes as class 3 (no subtype).
CATEGORIES_WITH_TOOL = CATEGORIES + [{'id': 3, 'name': 'tool', 'supercategory': 'instrument'}]
LAYOUTS = (CATEGORIES, CATEGORIES_WITH_TOOL)


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
        if data['categories'] not in LAYOUTS or not data['images']:
            raise ValueError(f'{partition} anatomy categories/images are invalid')
        if partition == 'val' and data['categories'] != subsets['train']['categories']:
            raise ValueError('train and validation use different categories')
        images = sorted(data['images'], key=lambda image: image['id'])
        if limit is not None:
            images = images[:limit]
        ids = {image['id'] for image in images}
        annotations = [a for a in data['annotations'] if a['image_id'] in ids]
        if any(a['category_id'] not in {c['id'] for c in data['categories']} for a in annotations):
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
        subsets[partition] = dict(images=images, annotations=annotations, categories=data['categories'])
    train_cases = {i['video_id'] for i in subsets['train']['images']}
    val_cases = {i['video_id'] for i in subsets['val']['images']}
    if train_cases & val_cases:
        raise ValueError('train/validation surgery overlap')
    signature = hashlib.sha256(json.dumps(dict(split=manifest['split_sha256'],
        annotations={p: dict(source=manifest['partitions'][p]['annotation_sha256'],
                             prepared=prepared_hashes[p]) for p in subsets},
        files=selected_hashes), sort_keys=True).encode()).hexdigest()
    return subsets, signature


ARCHITECTURES = ('mobilenet_v3_320', 'mobilenet_v3_hires')


def build_model(architecture='mobilenet_v3_320', pretrained=True, classes=2, min_size=480, small_anchors=False,
                proposals=None):
    """Two-class anatomy Faster R-CNN; returns (model, pretrained weights enum or None).

    mobilenet_v3_320 resizes frames to a 320-pixel short side; mobilenet_v3_hires keeps
    the native 854x480 Endoscapes/Cholec80 resolution, which matters for thin structures.
    """
    from torchvision.models.detection import (fasterrcnn_mobilenet_v3_large_320_fpn, fasterrcnn_mobilenet_v3_large_fpn,
        FasterRCNN_MobileNet_V3_Large_320_FPN_Weights, FasterRCNN_MobileNet_V3_Large_FPN_Weights)
    from torchvision.models.detection.faster_rcnn import FastRCNNPredictor
    if architecture == 'mobilenet_v3_320':
        weights = FasterRCNN_MobileNet_V3_Large_320_FPN_Weights.COCO_V1 if pretrained else None
        model = fasterrcnn_mobilenet_v3_large_320_fpn(weights=weights, weights_backbone=None)
    elif architecture == 'mobilenet_v3_hires':
        weights = FasterRCNN_MobileNet_V3_Large_FPN_Weights.COCO_V1 if pretrained else None
        # min_size 480 keeps native 854x480; 800 upscales so thin structures cover more pixels
        model = fasterrcnn_mobilenet_v3_large_fpn(weights=weights, weights_backbone=None, min_size=min_size,
                                                  max_size=round(min_size * 854 / 480))
    else:
        raise ValueError(f'unknown architecture: {architecture}')
    model.roi_heads.box_predictor = FastRCNNPredictor(model.roi_heads.box_predictor.cls_score.in_features, classes + 1)
    if small_anchors:
        # Half-size anchors with the same 3 ratios per location: the RPN head shape is unchanged,
        # so earlier checkpoints still load, but proposals start closer to thin, small structures.
        from torchvision.models.detection.anchor_utils import AnchorGenerator
        levels = len(model.rpn.anchor_generator.sizes)
        model.rpn.anchor_generator = AnchorGenerator(((16, 32, 64, 128, 256),) * levels, ((0.5, 1.0, 2.0),) * levels)
    if proposals:
        model.rpn._pre_nms_top_n = dict(training=proposals, testing=proposals)
        model.rpn._post_nms_top_n = dict(training=proposals, testing=proposals)
    return model, weights


def model_options(checkpoint):
    """build_model keyword arguments recorded in a checkpoint (older checkpoints: defaults)."""
    return dict(checkpoint.get('model_options', {}))


def predict(model, pixels, tta=False):
    """Run the detector; with tta, also on the mirrored image and merge with per-class NMS."""
    import torch
    from torchvision.ops import batched_nms
    result = model([pixels])[0]
    if not tta:
        return result
    width = pixels.shape[-1]
    mirrored = model([pixels.flip(-1)])[0]
    unflipped = mirrored['boxes'].clone()
    unflipped[:, 0], unflipped[:, 2] = width - mirrored['boxes'][:, 2], width - mirrored['boxes'][:, 0]
    boxes = torch.cat([result['boxes'], unflipped]); scores = torch.cat([result['scores'], mirrored['scores']])
    labels = torch.cat([result['labels'], mirrored['labels']])
    keep = batched_nms(boxes, scores, labels, 0.5)[:100]
    return dict(boxes=boxes[keep], scores=scores[keep], labels=labels[keep])


def flip_horizontal(pixels, boxes, width):
    """Mirror a CHW image tensor and its pixel xyxy boxes."""
    flipped = boxes.clone()
    if len(boxes):
        flipped[:, 0], flipped[:, 2] = width - boxes[:, 2], width - boxes[:, 0]
    return pixels.flip(-1), flipped


class Images:
    def __init__(self, root, partition, data, hflip=False):
        self.root = Path(root) / partition
        self.hflip = hflip
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
        if self.hflip and torch.rand(()) < .5:  # torch RNG, so --resume restores the augmentation stream
            pixels, target['boxes'] = flip_horizontal(pixels, target['boxes'], image['width'])
        return pixels, target, image


def predictions_for(model, samples, device, tta=False):
    import torch
    model.eval()
    output = []
    with torch.inference_mode():
        for pixels, _, image in samples:
            prediction = predict(model, pixels.to(device), tta)
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


def skip_nonfinite(loss_is_finite, targets):
    """Torchvision's ROI-head losses can be NaN when no image in the batch has a box.

    Only such all-negative batches may be skipped; any other nonfinite loss is an error.
    """
    if loss_is_finite:
        return False
    if all(len(target['boxes']) == 0 for target in targets):
        return True
    raise ValueError('nonfinite training loss')


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
    parser.add_argument('--architecture', choices=ARCHITECTURES, default='mobilenet_v3_320')
    parser.add_argument('--hflip', action='store_true', help='Random horizontal flip augmentation (training only)')
    parser.add_argument('--grad-clip', type=float, help='Clip total gradient norm (guards against divergence)')
    parser.add_argument('--min-size', type=int, default=480, help='hires input short side (480 native, 800 upscaled)')
    parser.add_argument('--small-anchors', action='store_true', help='half-size RPN anchors for thin, small objects')
    parser.add_argument('--proposals', type=int, help='RPN proposals kept before/after NMS (train and test)')
    parser.add_argument('--lr-schedule', choices=('constant', 'cosine'), default='constant')
    parser.add_argument('--oversample-duct', type=float, default=1.0, help='sampling weight for frames with a cystic duct box')
    parser.add_argument('--init-checkpoint', help='start from these weights (same classes and head shape)')
    parser.add_argument('--resume', action='store_true')
    parser.add_argument('--max-train-images', type=int, help='Bounded pipeline check; not an accuracy run')
    parser.add_argument('--max-val-images', type=int, help='Bounded pipeline check; not an accuracy run')
    args = parser.parse_args()
    if args.epochs < 1 or args.batch_size < 1 or args.learning_rate <= 0 or (args.grad_clip is not None and args.grad_clip <= 0):
        parser.error('epochs, batch size, learning rate and gradient clip must be positive')
    if any(v is not None and v < 1 for v in (args.max_train_images, args.max_val_images)):
        parser.error('image limits must be positive')
    import torch
    import torchvision
    from torch.utils.data import DataLoader
    subsets, signature = ready_data(args.data_dir, args.max_train_images, args.max_val_images)
    out = Path(args.output_dir)
    if out.exists() and not args.resume:
        raise FileExistsError(out)
    out.mkdir(parents=True, exist_ok=True)
    random.seed(args.seed); torch.manual_seed(args.seed); torch.set_num_threads(4)
    train = Images(args.data_dir, 'train', subsets['train'], hflip=args.hflip)
    val = Images(args.data_dir, 'val', subsets['val'])
    generator = torch.Generator().manual_seed(args.seed)
    if args.oversample_duct != 1.0:
        from torch.utils.data import WeightedRandomSampler
        duct_images = {a['image_id'] for a in subsets['train']['annotations'] if a['category_id'] == 1}
        weights_per_image = [args.oversample_duct if image['id'] in duct_images else 1.0 for image in train.images]
        sampler = WeightedRandomSampler(weights_per_image, len(weights_per_image), replacement=True, generator=generator)
        loader = DataLoader(train, batch_size=args.batch_size, sampler=sampler, num_workers=0,
                            collate_fn=lambda batch: tuple(zip(*batch)))
    else:
        loader = DataLoader(train, batch_size=args.batch_size, shuffle=True, num_workers=0,
                            collate_fn=lambda batch: tuple(zip(*batch)), generator=generator)
    categories = subsets['train']['categories']
    options = {}
    if args.min_size != 480:
        options['min_size'] = args.min_size
    if args.small_anchors:
        options['small_anchors'] = True
    if args.proposals:
        options['proposals'] = args.proposals
    model, weights = build_model(args.architecture, classes=len(categories), **options)
    if args.init_checkpoint:
        initial = torch.load(args.init_checkpoint, map_location='cpu', weights_only=False)
        model.load_state_dict(initial['model'])
        init_sha256 = sha(args.init_checkpoint)
    weight_file = Path(torch.hub.get_dir()) / 'checkpoints' / Path(urlparse(weights.url).path).name
    weights_sha256 = sha(weight_file)
    expected_prefix = weight_file.stem.rsplit('-', 1)[-1]
    if not weights_sha256.startswith(expected_prefix):
        raise ValueError('cached pretrained weights fail published hash prefix')
    model.to(args.device)
    optimizer = torch.optim.SGD([p for p in model.parameters() if p.requires_grad], lr=args.learning_rate, momentum=.9)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs) if args.lr_schedule == 'cosine' else None
    config = dict(batch_size=args.batch_size, learning_rate=args.learning_rate, device=args.device,
                  weights_sha256=weights_sha256)
    if args.grad_clip is not None:  # only recorded when used, so earlier checkpoints still resume
        config['grad_clip'] = args.grad_clip
    if args.architecture != 'mobilenet_v3_320':
        config['architecture'] = args.architecture
    if args.hflip:
        config['hflip'] = True
    if categories != CATEGORIES:
        config['categories'] = [c['name'] for c in categories]
    if options:
        config['model_options'] = options
    if args.lr_schedule != 'constant':
        config['lr_schedule'] = args.lr_schedule
    if args.oversample_duct != 1.0:
        config['oversample_duct'] = args.oversample_duct
    if args.init_checkpoint:
        config['init_checkpoint_sha256'] = init_sha256
    start, best_ap, history = 0, -1.0, []
    if args.resume:
        previous = torch.load(out / 'last.pt', map_location=args.device, weights_only=False)
        if previous['data_signature'] != signature or previous['seed'] != args.seed or previous['config'] != config:
            raise ValueError('resume data, seed or training configuration differs from checkpoint')
        model.load_state_dict(previous['model']); optimizer.load_state_dict(previous['optimizer'])
        start, best_ap, history = previous['epoch'] + 1, previous['best_ap'], previous['history']
        torch.set_rng_state(previous['torch_rng_state'])
        generator.set_state(previous['loader_rng_state'])
        if scheduler is not None:
            scheduler.load_state_dict(previous['scheduler'])
        baseline = previous.get('baseline_validation')
    else:
        baseline = evaluate(subsets['val'], predictions_for(model, val, args.device))
    for epoch in range(start, args.epochs):
        model.train(); losses = []; skipped = []
        for pixels, targets, images in loader:
            terms = model([x.to(args.device) for x in pixels],
                          [{k: v.to(args.device) for k, v in target.items()} for target in targets])
            loss = sum(terms.values())
            if skip_nonfinite(bool(torch.isfinite(loss)), targets):
                skipped.append([image['file_name'] for image in images])
                continue
            optimizer.zero_grad(); loss.backward()
            if args.grad_clip is not None:
                torch.nn.utils.clip_grad_norm_(model.parameters(), args.grad_clip)
            optimizer.step()
            losses.append(float(loss.detach()))
        if scheduler is not None:
            scheduler.step()
        predictions = predictions_for(model, val, args.device)
        metrics = evaluate(subsets['val'], predictions)
        ap = metrics['ap'] if metrics['ap'] is not None else -1.0
        history.append(dict(epoch=epoch, mean_loss=sum(losses)/len(losses), validation=metrics,
                            skipped_all_negative_batches=skipped))
        improved = epoch == 0 or ap > best_ap
        if improved:
            best_ap = ap
        checkpoint = dict(model=model.state_dict(), optimizer=optimizer.state_dict(), epoch=epoch,
                          best_ap=best_ap, history=history, baseline_validation=baseline,
                          data_signature=signature, architecture=args.architecture, categories=categories,
                          seed=args.seed, config=config, torch_rng_state=torch.get_rng_state(),
                          loader_rng_state=generator.get_state(), model_options=options,
                          scheduler=scheduler.state_dict() if scheduler is not None else None)
        atomic_torch_save(torch, checkpoint, out / 'last.pt')
        if improved:
            atomic_torch_save(torch, checkpoint, out / 'best.pt')
            (out / 'best-predictions.json').write_text(json.dumps(predictions))
        report = dict(status='bounded pipeline check' if args.max_train_images or args.max_val_images else 'full validation run',
                      architecture=args.architecture, hflip=args.hflip, initial_weights=weights.name,
                      initial_weights_sha256=weights_sha256,
                      categories=categories, seed=args.seed, device=args.device, epochs_requested=args.epochs,
                      learning_rate=args.learning_rate, batch_size=args.batch_size, grad_clip=args.grad_clip,
                      model_options=options, lr_schedule=args.lr_schedule, oversample_duct=args.oversample_duct,
                      init_checkpoint=args.init_checkpoint,
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
