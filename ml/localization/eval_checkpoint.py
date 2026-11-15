"""Score a trained checkpoint on the validation split, optionally with test-time flipping.

Writes predictions.json and metrics.json (COCO AP per class plus the fixed-threshold error
analysis) to a new directory, so models can be compared on identical images and protocol.
"""
import argparse
import json
from pathlib import Path

from analyze_anatomy_errors import analyze
from evaluate_anatomy_coco import evaluate
from train_anatomy import Images, build_model, model_options, predictions_for, ready_data, sha


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-dir', required=True)
    parser.add_argument('--checkpoint', required=True)
    parser.add_argument('--tta', action='store_true')
    parser.add_argument('--output-dir', required=True)
    args = parser.parse_args()
    import torch
    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=False)
    subsets, signature = ready_data(args.data_dir)
    checkpoint = torch.load(args.checkpoint, map_location='cpu', weights_only=False)
    categories = checkpoint.get('categories', subsets['val']['categories'])
    if [c['name'] for c in categories] != [c['name'] for c in subsets['val']['categories']]:
        raise ValueError('checkpoint classes differ from the validation data')
    model, _ = build_model(checkpoint.get('architecture', 'mobilenet_v3_320'), pretrained=False,
                           classes=len(categories), **model_options(checkpoint))
    model.load_state_dict(checkpoint['model'])
    torch.set_num_threads(4)
    predictions = predictions_for(model, Images(args.data_dir, 'val', subsets['val']), 'cpu', tta=args.tta)
    (out / 'predictions.json').write_text(json.dumps(predictions))
    metrics = dict(checkpoint_sha256=sha(args.checkpoint), checkpoint_epoch=checkpoint.get('epoch'), tta=args.tta,
                   data_signature=signature, coco=evaluate(subsets['val'], predictions),
                   errors=analyze(subsets['val'], predictions))
    (out / 'metrics.json').write_text(json.dumps(metrics, indent=1) + '\n')
    coco = metrics['coco']
    print(json.dumps(dict(ap=coco['ap'], ap50=coco['ap50'], per_class={k: round(v['ap50'] or 0, 3) for k, v in coco['per_class'].items()})))


if __name__ == '__main__':
    main()
