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

Use a separate Python environment with `requirements.txt` (including `remotezip==0.12.6` and pycocotools); keep images, checkpoints and derived video frames outside Git. `fetch_anatomy_data.py` reads the official train/validation detection-keyframe annotations through bounded remote ZIP reads, applies the existing surgery-overlap guard, checks each downloaded image's decode size and SHA-256, and resumes without replacing verified files. Its manifest binds source annotations, prepared labels, the CholecT50 split and every image hash. `--limit 2` is a bounded pipeline check only; rerun without it to finish all images. The local full download under `~/madhacks2026/localization/anatomy-data/` completed: 1,212 train and 409 validation images. A second downloader pass and `ready_data` verified every selected image hash, prepared labels and surgery separation (signature `0c003c2f469468b0acf3cb61a2788c7aff77b5b8d72ad9f59800ce1f71b07eff`). The five-epoch CPU run at `~/madhacks2026/localization/anatomy-full-v1/` completed epochs 0–3 (about 3 minutes each) and stopped at epoch 4 on the `nonfinite training loss` guard; `--resume` reproduces the stop. `best.pt` is epoch 3: validation AP 0.345, AP50 0.633; gallbladder AP50 0.945, cystic duct AP50 0.321. The stop was caused by an all-negative batch (two box-free images), for which torchvision's ROI-head losses are NaN; the trainer now skips only such batches and records them per epoch. **v2** (`anatomy-full-v2`, `--epochs 8 --grad-clip 10`) completed all 8 epochs; its epoch-7 `best.pt` reached AP 0.352, AP50 0.665, cystic duct AP50 0.396, and backs the current VID01 artifact. Compare runs with `analyze_anatomy_errors.py` (`anatomy_full_v1_errors.json`, `anatomy_full_v2_errors.json`).

**Architecture and augmentation options (2026-11-14).** `--architecture mobilenet_v3_320` (default, the v1/v2 model: frames resized to a 320-pixel short side) or `mobilenet_v3_hires` (`fasterrcnn_mobilenet_v3_large_fpn`, COCO_V1, `min_size=480, max_size=854`, so 854×480 frames are not downscaled). `--hflip` adds random horizontal flips of image and boxes during training only. Both are stored in the checkpoint config and `report.json`; `export_anatomy_video.py` rebuilds the matching network from the checkpoint (checkpoints without an `architecture` field are the 320 model; re-exporting v2 frames 673.92/698.16 s through the new builder reproduced the deployed detections exactly). Setup notes: python.org Python on macOS may fail the pretrained-weight download with `CERTIFICATE_VERIFY_FAILED`; download the URL printed by `FasterRCNN_MobileNet_V3_Large_FPN_Weights.COCO_V1.url` with curl into `torch.hub.get_dir()/checkpoints/` (the trainer checks the SHA-256 prefix in the file name; `fb6a3cc7…` verified). On this Mac the MPS device hung for over 10 minutes on a 40-image hires check that took 15 s on CPU, so use `--device cpu`.

```sh
python ml/localization/fetch_anatomy_data.py --output-dir /path/to/anatomy-data --limit 2
python ml/localization/fetch_anatomy_data.py --output-dir /path/to/anatomy-data
python ml/localization/train_anatomy.py --data-dir /path/to/anatomy-data \
  --output-dir /path/to/new/anatomy-run --epochs 5 --batch-size 2 --device cpu
```

The trainer refuses missing or changed images, unexpected categories, changed prepared labels and overlapping train/validation surgeries. It loads images lazily, trains the two-class Faster R-CNN MobileNetV3 320 model, checks finite losses and predictions, measures the initial-head validation baseline, and selects `best.pt` by validation COCO AP. `last.pt` and `--resume` retain optimizer and random-generator state; `report.json` includes split/data signature, seed, versions and per-epoch metrics. Use a new output directory for a new run. `--max-train-images` and `--max-val-images` permit bounded pipeline checks; their reports are explicitly marked as such and cannot establish accuracy. A real two-image/two-image run completed one epoch with finite mean loss 1.1615 and undefined AP because that tiny validation slice contains no supported reference object.

After a representative validation run, export sampled-frame predictions to a **new file outside Git** before considering player deployment:

Analyze fixed-threshold validation errors and choose per-class export thresholds:

```sh
python ml/localization/analyze_anatomy_errors.py /path/to/anatomy-data/val/annotations.json \
  /path/to/anatomy-run/best-predictions.json --output /path/to/new/errors.json
```

It matches boxes one-to-one per class at IoU 0.5, sweeps score thresholds 0.05–0.95, picks each class's threshold by validation F1 and reports false-positive types (duplicate, localization, class confusion, background), misses by box size and per-surgery recall. Thresholds chosen this way are optimistic because no untouched test split is used. The committed `anatomy_full_v1_errors.json` is the report for the epoch-3 checkpoint.

```sh
SURGF_FFMPEG=/path/to/ffmpeg python -m unittest discover -s ml/localization -p 'test_*.py'
python ml/localization/export_anatomy_video.py \
  --checkpoint /path/to/anatomy-run/best.pt --video frontend/public/videos/VID01.mp4 \
  --case-id VID01 --video-asset-id VID01-cholec80-25fps-v1 \
  --every-sec 0.24 --max-age-sec 0.25 --display-width 854 --display-height 484 \
  --score-threshold 0.65 --class-threshold "cystic duct=0.7" \
  --ffmpeg /path/to/ffmpeg --output /path/to/new/VID01-anatomy.json
```

The exporter takes **player seconds** (`--seconds` or `--every-sec` with optional `--start`/`--end`), maps each to the nearest decoded frame index, and sets `timestamp_sec` to that frame's presentation time (stream start + index/fps). Do not pass CholecT50 frame numbers as decoded indices, and do not apply the CholecT50 offset to decoded frames. It decodes the video once as raw RGB (FFmpeg 5+, `-fps_mode passthrough`), normalizes boxes to source dimensions, binds the video SHA-256, checkpoint epoch/hash and data signature, records class map, per-class thresholds and a digest of every frame's RGB hash, and validates the artifact schema. 0.24 s is exactly 6 frames at 25 fps; with `max_age_sec` 0.25 the boxes stay on during playback. The deployed VID01 export used the command above (no bundled ffmpeg on PATH here; `imageio-ffmpeg`'s FFmpeg 9.0 binary works): 7,221 frames, 7,465 boxes, 1.34 M characters. An earlier one-frame export bound frame 674 to 26.92 s because of the old frame-ID semantics; ignore it. The model supports only cystic duct and gallbladder anatomy; it does not validate six instrument subtypes or liver. The currently available CholecT50 mirror lacks subtype box annotations, and Endoscapes has only a generic tool box category. Official subtype-box data or independently reviewed labels remain necessary for instrument accuracy claims.

## Measure accuracy on a playable video (VID01 review pack)

Every anatomy number above is on Endoscapes validation images. To measure the deployed model on VID01 itself, build a review pack (outside Git) and have a reviewer box the frames:

```sh
python ml/localization/prepare_video_review.py --checkpoint /path/to/anatomy-run/best.pt \
  --video frontend/public/videos/VID01.mp4 --case-id VID01 --count 60 \
  --ffmpeg /path/to/ffmpeg --output-dir /path/to/new/review-VID01
# after review:
python ml/localization/evaluate_anatomy_coco.py /path/to/review-VID01/reference.json \
  /path/to/review-VID01/predictions.json --output /path/to/new/VID01-metrics.json
```

The seeded sample (default seed 11) takes half its frames from intervals where `shared/triplets.annotation.csv` names `cystic_duct` as a target and half spread across the video, so it tests both misses and false alarms. `reference.json` is COCO with only cystic duct and gallbladder, **blank by default** (`--prefill SCORE` copies model boxes in but can anchor the reviewer), and every image starts with `is_det_keyframe: false`; the evaluator refuses until a reviewer has boxed every visible instance in a frame and set it to `true`. `predictions.json` holds raw, unthresholded predictions so AP is defined. The manifest binds video, checkpoint (architecture, epoch, data signature), triplets file and frame PNG hashes. The same seed and count reproduce the same frames, so a later checkpoint can be scored on identical frames. Pack built 2026-11-14 from the v2 checkpoint: `~/madhacks2026/localization/review-VID01-v1/`, 60 frames (32 inside cystic duct intervals). It contains Cholec80 imagery (CC BY-NC-SA 4.0); keep it out of Git. **Not yet reviewed; no VID01 accuracy exists yet.**

### Automated review session (recommended)

`review_session.py` automates everything except drawing boxes. It needs Label Studio in its own environment (`python3 -m venv ~/madhacks2026/label-studio-env && ~/madhacks2026/label-studio-env/bin/pip install label-studio`; tested with 1.23.2).

```sh
python ml/localization/review_session.py start ~/madhacks2026/localization/review-VID01-v1    # prints URL, login, password
python ml/localization/review_session.py status ~/madhacks2026/localization/review-VID01-v1   # submitted / 60
python ml/localization/review_session.py finish ~/madhacks2026/localization/review-VID01-v1 --reviewer "Name" \
  --predictions v2=~/madhacks2026/localization/review-VID01-v1/predictions.json \
  --predictions v3=~/madhacks2026/localization/review-VID01-v3preds/predictions.json
python ml/localization/review_session.py stop ~/madhacks2026/localization/review-VID01-v1
```

`start` launches Label Studio on 127.0.0.1 with its data in the pack's `label-studio/` folder, creates a local account and API token (saved in `label-studio/session.json`, mode 600), enables that token for the local organization (Label Studio 1.23 disables legacy tokens by default), creates the project with the two labels and instructions, and uploads every pack frame that is not already a task, so rerunning it is safe. `finish` exports COCO through the API, converts it with `import_review_labels.py` into `reference.reviewed.json`, scores every `--predictions` file on exactly the reviewed frames, and writes `review-results.json` (records reviewer, frames, boxes per class, whether boxes were prefilled, and per-model AP/AP50/recall). Pipeline test on a scratch copy of the pack: 60 tasks created, one test box and one empty submission exported, converted (percent → pixel boxes correct) and scored for v2 and v3. The real VID01 session was started on 2026-11-15 at http://127.0.0.1:8080 (0/60 submitted).

### Labeling the pack with Label Studio by hand (local, nothing leaves the machine)

1. `pip install label-studio` in any separate environment, then `label-studio start` and open http://localhost:8080 (create a local account).
2. **Create project** → *Labeling Setup* → *Custom template* → paste `label-studio-config.xml` from the pack folder (two labels: Cystic duct, Gallbladder).
3. *Data Import* → upload every PNG from the pack's `frames/` folder (60 files).
4. For each frame, draw a box around **every visible** cystic duct and gallbladder, tightly around the visible part only. If neither is visible, draw nothing. Always press **Submit**, including on empty frames, because only submitted frames count as reviewed. Use the zoom; skip nothing.
5. *Export* → **COCO** → save the JSON (Label Studio may download a zip containing `result.json`).
6. Convert and score:

```sh
python ml/localization/import_review_labels.py ~/madhacks2026/localization/review-VID01-v1 result.json \
  --reviewer "Your Name" --output ~/madhacks2026/localization/review-VID01-v1/reference.reviewed.json
python ml/localization/evaluate_anatomy_coco.py ~/madhacks2026/localization/review-VID01-v1/reference.reviewed.json \
  ~/madhacks2026/localization/review-VID01-v1/predictions.json --output ~/madhacks2026/localization/VID01-v2-metrics.json
python ml/localization/evaluate_anatomy_coco.py ~/madhacks2026/localization/review-VID01-v1/reference.reviewed.json \
  ~/madhacks2026/localization/review-VID01-v3preds/predictions.json --output ~/madhacks2026/localization/VID01-v3-metrics.json
```

`import_review_labels.py` matches exported images by their six-digit frame name, accepts only the two labels, clips sub-pixel overhangs, refuses frames from outside the pack, and requires every pack frame to be submitted (`--allow-partial` marks only submitted frames reviewed). The two evaluator runs give the first real VID01 scores for v2 (deployed) and v3 on identical frames.

## Run on Databricks serverless

`scripts/run_databricks_anatomy.py` (run from `scripts/` with a venv that has `databricks-sdk` and `python-dotenv`; credentials from the repo-root `.env`) submits `ml/localization/anatomy_databricks.py` as a one-off serverless CPU job from the committed revision. Everything after `--` is passed to `train_anatomy.py` or `export_anatomy_video.py` unchanged.

```sh
python run_databricks_anatomy.py upload-data ~/madhacks2026/localization/anatomy-data   # once; skips files already present
python run_databricks_anatomy.py probe                                                    # CPUs, versions, ffmpeg, weights
python run_databricks_anatomy.py train RUN_NAME --timeout-min 180 -- --epochs 10 --architecture mobilenet_v3_hires --hflip --grad-clip 10
python run_databricks_anatomy.py upload-run ~/madhacks2026/localization/RUN_DIR RUN_NAME   # to export a locally trained run
python run_databricks_anatomy.py export RUN_NAME OUT-part0.json --timeout-min 240 -- --case-id VID01 \
  --video-asset-id VID01-cholec80-25fps-v1 --every-sec 0.24 --start 0 --end 433.2 --max-age-sec 0.25 \
  --display-width 854 --display-height 484 --score-threshold 0.65 --class-threshold "cystic duct=0.7"
python run_databricks_anatomy.py status RUN_ID
python run_databricks_anatomy.py fetch exports/OUT-part0.json /path/to/new/OUT-part0.json
python ml/localization/merge_artifacts.py part0.json part1.json part2.json part3.json --output merged.json
```

Measured on this workspace: 4 CPUs per job and a matmul benchmark about 18x slower than an Apple M4, so one job is slower than a recent Mac; split exports into time chunks on the 0.24 s grid (chunk *i* starts at *i*·433.44 s, ends 433.2 s later) and run them in parallel. A rerun of `train` with the same `RUN_NAME` resumes from the Volume checkpoint. In zsh, pass `--start`/`--end` as separate words (unquoted variables are not split).
