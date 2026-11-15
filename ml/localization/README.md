# Spatial overlay prototype (stage 3)

Current ownership: **Shlok — general frontend design; Mihir — all remaining spatial data/model/export/player work and browser verification.** Aadhi has moved to other work. Spatial work stays on `feat/spatial-overlays`. Shlok and Mihir coordinate shared frontend markup/styles. See [tasks and handoffs](../LOCALIZATION_PLAN.md#current-assignments-and-shared-workflow). Earlier owner notes below are historical.


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

For the player, place the generated artifact at `frontend/public/overlays/CASE.json`. It must match the versioned asset identifier in `frontend/src/cases.js`. VID01 offset -0.04 s refers to the known 25 fps Cholec80 asset; verify offsets for any replacement asset. The current frontend checks asset ID and dimensions, not video bytes: the deployer must maintain the asset-version binding. VID01's MP4 reports decoded 854×480, SAR 253:255, and Chrome display dimensions 854×484. Its artifact therefore includes optional paired `display_width`/`display_height` fields; these are valid only after verifying the exact deployed video asset. Boxes remain normalized to the full source frame and stretch with the displayed image. Sparse detections expire after 120 ms, never more than 250 ms. This avoids pretending one sampled frame is continuous tracking. Use the sampled-frame selector to inspect paused detections.

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

## Verified annotation sources

`audit_coco.py` inventories real COCO JSON or an explicit ZIP member, checks coordinate bounds and references, and records the annotation SHA-256. It never interprets missing annotations as negative labels.

```sh
python ml/localization/audit_coco.py /path/to/cholecT50-coco.zip --member cholecT50/all/annotation_coco.json
python ml/localization/audit_coco.py /path/to/endoscapes-train-coco.json
```

Saved audit reports are adjacent to this README. The [official SurgLatentGraph COCO download](https://github.com/CAMMA-public/SurgLatentGraph#datasetannotation-downloads) contains 100,816 image records, 40 duplicate image IDs and **zero boxes** in its CholecT50 detection JSON. This does not contradict the separate box-bearing official CholecT50 release; this particular converted archive cannot supply detection supervision.

The [official Endoscapes archive](https://github.com/CAMMA-public/Endoscapes) supplies `endoscapes/train/annotation_coco.json`: 1,212 detection-keyframe records, 5,566 valid boxes, 1,186 frames with boxes. Labels include 1,174 gallbladder, 952 cystic duct and 1,946 generic tool instances. Other labels are cystic plate, cystic artery and calot triangle. Source data is CC BY-NC-SA 4.0; cite Murali et al., Endoscapes benchmark and Latent Graph Representations, as requested by the source repository. Only aggregate audit reports are committed, not the dataset.

Downloaded annotation files live outside Git under `/Users/shlokjadhav/madhacks2026/localization/`. Endoscapes JSON was read directly from the remote ZIP using `remotezip==0.12.6`; the full imagery archive was not downloaded. Its source case IDs are not CholecT50 IDs. Before training or evaluating, resolve [CAMMA cross-dataset surgery overlaps](https://github.com/CAMMA-public/camma_dataset_overlaps) against `ml/case_split.json`. Do not tune on final-test surgeries. Generic tool cannot be mapped to grasper or another instrument subtype. Anatomy scope must be mapped explicitly; the existing evaluator requires complete review of its supported categories, so do not silently claim complete liver annotations from Endoscapes. No Endoscapes model has been trained or evaluated yet.

## Prepare anatomy training data

```sh
python ml/localization/prepare_anatomy.py /path/to/endoscapes-train-coco.json \
  --split ml/case_split.json --output-dir /path/to/new/anatomy-train-v1
```

The output is COCO `train.json` plus a manifest binding source annotation and split hashes. It uses official Endoscapes training surgeries 1–120 only, requires explicit detection keyframes, and maps cystic duct → class 1 and gallbladder → class 2. All other classes are excluded. Empty frames remain negative only for these two categories; they say nothing about liver or instruments. The generated training JSON stays outside Git.

The published CAMMA overlap map at revision `8347b9f4cb02ebe739747903e6eada272ee9d25e` has no listed overlap between Endoscapes training and our current protected CholecT50 validation/test/diagnostic cases. The preparation code excludes entire overlapping surgeries if those lists change. This is based on the published map, not independent visual deduplication. The saved `anatomy_train_manifest.json` records 120 surgeries, 1,212 frames, 2,126 boxes and 34 frames without either selected anatomy class.

This prepares labels only. Training imagery, a separate validation manifest, model fine-tuning and held-out accuracy measurement are the next steps. The existing Grounding DINO preview is unchanged. Do not evaluate this two-category dataset through the all-category overlay evaluator without adding an explicit category-scope contract first.

## Real-image training smoke test

Use the isolated localization environment with pinned Torch/Torchvision requirements, plus `remotezip==0.12.6` for bounded downloads:

```sh
python ml/localization/fetch_anatomy_smoke.py --output-dir /path/to/new/anatomy-smoke-v1
python ml/localization/train_anatomy_smoke.py --data-dir /path/to/anatomy-smoke-v1 --output-dir /path/to/new/anatomy-smoke-run-v1
```

The downloader selects two positive images from distinct surgeries in each official train/validation partition, verifies decoded dimensions, and records image hashes. Validation preparation excludes published overlaps with all current stage-2 split cases, including training. `prepare_anatomy.py --partition val` also supports complete validation annotation preparation; default remains train.

The smoke runner uses [Torchvision Faster R-CNN MobileNetV3 320](https://docs.pytorch.org/vision/0.21/models/generated/torchvision.models.detection.fasterrcnn_mobilenet_v3_large_320_fpn.html), COCO_V1 pretrained weights, and a new head with background/cystic duct/gallbladder classes. It validates image hashes and surgery separation, performs exactly three CPU optimizer steps with seed 17, checks finite losses/inference and saves a local checkpoint, raw validation predictions and report. This is a lightweight alternative supervised baseline, not a fine-tuned Grounding DINO checkpoint.

The real run succeeded on Endoscapes train surgeries 1/2 and validation 121/122. `anatomy_smoke_report.json` records all losses and versions. Three updates on two images do not establish useful accuracy; the 36/37 validation detections are counts, not correct detections. No checkpoint or image is committed, and the app still uses the old experimental preview. Next: prepare full train/validation imagery, add category-scoped COCO metrics and a bounded full training experiment with best-checkpoint selection on validation only. Browser acceptance remains separate.

## Category-scoped COCO evaluation (Shlok)

Install `requirements-eval.txt` in the localization environment. Run:

```sh
python ml/localization/evaluate_anatomy_coco.py /path/to/val/annotations.json /path/to/predictions.json --output /path/to/new/metrics.json
```

Input references must explicitly contain only class 1 cystic duct and class 2 gallbladder, with reviewed detection-keyframe flags. Predictions use the smoke runner format: image_id, pixel xyxy boxes, integer labels and scores. The evaluator includes every reference image, counts missing prediction images, reports ignored out-of-scope detections, rejects invalid geometry/IDs, and leaves undefined metrics null. Uses pycocotools COCO bbox AP at IoU .50:.05:.95 and AP50, plus per-class recall at maxDets 100; bbox areas are computed from geometry. Do not use this category map with a different model without explicit conversion.

`anatomy_smoke_metrics.json` records AP 0.05047 / AP50 0.09926 on only two validation images (three reference boxes) after three optimizer steps. This verifies metrics plumbing, not generalizable performance. No threshold/model was selected from this tiny result. Full training and representative validation remain unfinished; Mihir owns the remaining inputs and experiments.

## Full anatomy data, training and export (Mihir)

Use a separate Python environment with `requirements.txt` (including `remotezip==0.12.6` and pycocotools); keep images, checkpoints and derived video frames outside Git. `fetch_anatomy_data.py` reads the official train/validation detection-keyframe annotations through bounded remote ZIP reads, applies the existing surgery-overlap guard, checks each downloaded image's decode size and SHA-256, and resumes without replacing verified files. Its manifest binds source annotations, prepared labels, the CholecT50 split and every image hash. `--limit 2` is a bounded pipeline check only; rerun without it to finish all images. The local full download under `~/madhacks2026/localization/anatomy-data/` was still running at the last check (995 of 1,621 images); do not treat it as complete until `ready_data` accepts the full set.

```sh
python ml/localization/fetch_anatomy_data.py --output-dir /path/to/anatomy-data --limit 2
python ml/localization/fetch_anatomy_data.py --output-dir /path/to/anatomy-data
python ml/localization/train_anatomy.py --data-dir /path/to/anatomy-data \
  --output-dir /path/to/new/anatomy-run --epochs 5 --batch-size 2 --device cpu
```

The trainer refuses missing or changed images, unexpected categories, changed prepared labels and overlapping train/validation surgeries. It loads images lazily, trains the two-class Faster R-CNN MobileNetV3 320 model, checks finite losses and predictions, measures the initial-head validation baseline, and selects `best.pt` by validation COCO AP. `last.pt` and `--resume` retain optimizer and random-generator state; `report.json` includes split/data signature, seed, versions and per-epoch metrics. Use a new output directory for a new run. `--max-train-images` and `--max-val-images` permit bounded pipeline checks; their reports are explicitly marked as such and cannot establish accuracy. A real two-image/two-image run completed one epoch with finite mean loss 1.1615 and undefined AP because that tiny validation slice contains no supported reference object.

After a representative validation run, export sampled-frame predictions to a **new file outside Git** before considering player deployment:

```sh
python ml/localization/export_anatomy_video.py \
  --checkpoint /path/to/anatomy-run/best.pt --video frontend/public/videos/VID01.mp4 \
  --case-id VID01 --video-asset-id VID01-cholec80-25fps-v1 \
  --frame-ids 674 680 689 --display-width 854 --display-height 484 \
  --ffmpeg /path/to/ffmpeg --output /path/to/new/VID01-anatomy.json
```

The exporter decodes the exact frame numbers, normalizes boxes to their source dimensions, binds the video's SHA-256 and model/checkpoint/data signature, records class mapping and frame hashes, and validates the artifact schema. It uses FFmpeg 5+ (`-fps_mode passthrough`). A one-frame export from the bounded model succeeded for VID01 frame 674, but that checkpoint has no defined validation AP and its 15 detections are **not** suitable for replacing the current demo artifact. The model supports only cystic duct and gallbladder anatomy; it does not validate six instrument subtypes or liver. The currently available CholecT50 mirror lacks subtype box annotations, and Endoscapes has only a generic tool box category. Official subtype-box data or independently reviewed labels remain necessary for instrument accuracy claims.
