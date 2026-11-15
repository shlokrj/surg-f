# Spatial overlay prototype (stage 3)

Owner: Shlok. Branch: `feat/spatial-overlays`. Aadhitya continues stage 2 independently on `ml-dev`.

The offline runner uses IDEA-Research's Transformers conversion of Grounding DINO-T, not the SurgVLP classifier. Install `requirements.txt` into a separate environment. It processes at most 100 explicitly chosen full-resolution PNG frames, writes a versioned JSON artifact, and refuses to overwrite output. No remote compute job or shared clip-table change is needed.

```sh
python ml/localization/detect_frames.py \
  --frames-dir /path/to/frames/VID01 --frame-ids 674 680 689 \
  --case-id VID01 --video-asset-id VID01-cholec80-25fps-v1 \
  --time-offset -0.04 --output /tmp/VID01.json
python -m unittest discover -s ml/localization -p 'test_*.py'
```

Use `--revision` to reproduce the exact model commit saved in the artifact. Package versions, checkpoint SHA-256, prompts, source frame hashes, thresholds, unmapped phrases and timing are recorded. Phrases that do not exactly match the prompt map are dropped, not silently assigned labels. Images are resized by the processor; output coordinates are projected back to original source dimensions and normalized, with no center crop. The six instrument names remain unchanged; anatomy prompts (gallbladder, liver, cystic duct) are experimental. No verbs, action relations or tracking are inferred.

A three-frame CPU smoke run on real VID01 frames succeeded. See `frontend/public/overlays/VID01.json` for exact model/image provenance and detections. These are actual model predictions, not verified boxes. Their scores are not calibrated probabilities. No localization AP is claimed: the current mirror audit found classification labels and no top-level spatial fields among 100,863 samples. An official box-bearing dataset or reviewed annotations are still needed for quality evaluation. Do not use existing final-test cases for prompt tuning.

For the player, place the generated artifact at `frontend/public/overlays/CASE.json`. It must match the versioned asset identifier in `frontend/src/cases.js`. VID01 offset -0.04 s refers to the known 25 fps Cholec80 asset; verify offsets for any replacement asset. The current frontend checks asset ID and dimensions, not video bytes: the deployer must maintain the asset-version binding. Sparse detections expire after 120 ms, never more than 250 ms. This avoids pretending one sampled frame is continuous tracking. Use the sampled-frame selector to inspect paused detections.

Sources: [official model card](https://huggingface.co/IDEA-Research/grounding-dino-tiny), [Transformers usage](https://huggingface.co/docs/transformers/model_doc/grounding-dino). Model code/weights are Apache-2.0. Source frames are CholecT50 (Nwoye et al., Medical Image Analysis 2022, CC BY-NC-SA 4.0); no source images or videos are committed. Preserve the dataset attribution and terms for derived preview artifacts.

## Evaluate reviewed boxes

```sh
python ml/localization/evaluate.py predictions.json reviewed-annotations.json --iou 0.5 --score 0.3
```

The reference uses the same artifact schema with `source: annotation` and `provenance.reviewed_complete_frames: true`. Set this flag only after a reviewer has annotated **every visible instance of the supported labels** in each included frame. Include reviewed empty frames explicitly; omit unreviewed frames. Missing prediction frames count as missed objects; prediction-only frames are ignored and counted separately. Preserve identical case, asset, dimensions, frame IDs and player timestamps. Record reviewer, annotation origin and split in provenance. Do not promote model predictions to annotations automatically.

Evaluation uses confidence-ordered one-to-one matches of the same category/label at the requested IoU. It reports per-label and micro TP/FP/FN, precision and recall; undefined ratios are null. This is fixed-threshold evaluation, not COCO mAP. Review data and surgery-disjoint validation are still needed before tuning; no accuracy result has been produced yet. Tests use synthetic boxes only.

## Inspect actual predictions visually

Install Matplotlib and Pillow in your preview environment, then run:

```sh
python ml/localization/preview.py frontend/public/overlays/VID01.json \
  --frames-dir /path/to/frames/VID01 --output /tmp/VID01-preview.png
```

This creates an offline plot, not a browser screenshot. Source-image SHA-256 and dimensions must match the artifact; output is never overwritten. Preview at most 12 frames. Keep generated plots outside Git because they contain dataset imagery. The first real preview shows poor labels and oversized boxes; use it to inspect failure cases, not as evidence of detector accuracy.
