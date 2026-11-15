# Stage 3: localized video overlays

Status: **Mihir owns the remaining spatial implementation alone; Aadhi has moved to other work and Shlok owns general frontend design.** This supersedes earlier spatial assignments. The earlier integrated frontend was published to `main` through `6d468dd` at Mihir's request. New spatial work stays on `feat/spatial-overlays` until explicitly published.

Current checkpoint (2026-11-14, latest): v2 of the two-class Endoscapes model (8 epochs; the earlier NaN stops were all-negative batches, now skipped and recorded) reached validation AP 0.352 at epoch 7, with cystic duct recall 0.37 at precision 0.66 (v1: 0.22). The branch overlay uses v2; `main` still has v1 (AP 0.345). `frontend/public/overlays/VID01.json` is now a full-length anatomy-only export (every 0.24 s, per-class thresholds chosen on validation), checked in headless Chrome 157 during seeking, playback, resize and case switching. Six-instrument boxes, liver, reviewed VID01 ground truth and better cystic duct quality remain open. See the [handoff](../agent-kit/HANDOFFS.md#mihir-anatomy-model-and-vid01-overlay-deployed-2026-11-14) and [runner instructions](localization/README.md#full-anatomy-data-training-and-export-mihir).

## Current assignments and shared workflow

| Owner | Current scope | Owned paths / handoff |
|---|---|---|
| Shlok | General frontend design: layout, typography, styling, responsiveness and overall presentation | General frontend components and styles. Coordinate shared `main.js`, `style.css` and player markup with Mihir before either edits the same sections. Preserve working search, quiz, chart, steps and overlay behavior. No remaining spatial ML assignment. |
| Mihir | Spatial data/model/evaluation/export, player integration and real-browser acceptance | `ml/localization/`, overlay artifacts, `frontend/src/overlays.js` and overlay tests. Coordinate shared frontend markup/styles with Shlok. Keep experimental predictions and quality limits explicit. |

Mihir fetches/pulls and pushes spatial work on `feat/spatial-overlays`. Preserve concurrent commits; reconcile rejected pushes without force-push or resets. Commit completed changes with lowercase Conventional Commit subjects and no co-author trailers. Shlok's design work remains a separate lane.

### Mihir — data, models and evaluation (transferred from Aadhi)

1. Pull the latest spatial branch before starting. It includes Shlok's scoped COCO evaluator in `78dfef0`, beyond the earlier main snapshot. Retain that work; do not rebuild it from scratch. The real two-image smoke result is pipeline evidence only, not representative accuracy.
2. Complete resume-safe train/validation image downloads, hashes, decode checks, overlap protection and readiness manifests. Keep images/checkpoints outside Git. Audit genuine six-instrument box supervision; Endoscapes generic tool labels cannot provide instrument subtypes.
3. Continue the configurable full anatomy trainer from the smoke runner: seed/device/epochs, checkpoint and resume handling, provenance, finite-loss checks and validation-only selection. Use scoped anatomy metrics and a declared baseline; do not tune on final-test surgeries.
4. Export predictions with exact model/class mapping, source dimensions, asset IDs, timestamps and hashes. Validate against `artifact.py` and give Mihir a reproducible sample. Document unsupported classes and failure cases honestly.
5. Preserve existing stage-2 jobs; do not restart jobs accidentally while taking over spatial training. Update the tracker with actual commands, results, blockers and next handoff.

### Mihir — spatial player and acceptance

1. Verify actual VID01 playback with the current sparse artifact; record browser/version and screenshots or a short recording. DOM media simulations do not establish playback/fullscreen correctness.
2. Finish toggle/category/score controls, loading/error/retry, keyboard interaction, seek/play expiry, resize/letterboxing/fullscreen, missing data and local-upload behavior. Ensure case switches and late responses never leak stale boxes.
3. Bind any new artifacts to the actual video asset and coordinate presentation/shared files with Shlok. Keep predictions experimental until evidence supports otherwise; never substitute fabricated boxes for real results.
4. Add regression coverage, run the build, and hand off browser evidence and remaining defects. Avoid broad layout/style redesign in Shlok's lane.

## Handoffs and final completion gate

Mihir owns validated artifacts, model/class map, data and checkpoint provenance, measured validation quality, matching video asset, player integration and browser acceptance. Mihir → Shlok: integration points, visual constraints and browser acceptance evidence. Shlok → Mihir: design changes affecting player layout or shared DOM/CSS. Record schema changes in `agent-kit/CONTRACTS.md` before changing producers/consumers.

Before spatial publication: reproducible training/evaluation, explicitly supported classes, correct video alignment, passing automated/browser checks and documented limitations. Tracking, action recognition, six validated instrument types and all anatomy targets are not implied by the two-class smoke. Main publication still requires Shlok's request. On 2026-11-14 Shlok approved publishing the anatomy model tooling and full-length VID01 anatomy overlay; `main` was fast-forwarded to `feat/spatial-overlays`.

## Intended experience

The player will offer a toggle for boxes on visible instruments and anatomical targets, with readable labels and model scores. Separate instrument/anatomy filters are implemented on the feature branch. Overlays should follow playback, pause and seek correctly, clear when cases change, and remain aligned in fullscreen or resized players. Missing localization data should show an unavailable state, not fabricated boxes.

The supplied reference image shows purple instrument/anatomy boxes, labels and scores in a surgical player. Treat this as visual direction only. It depicts robotic prostatectomy with ProGrasp, monopolar scissors and neurovascular bundle labels; those names, its case identity, procedure phases and displayed scores are not our cholecystectomy taxonomy or verified outputs. No reference-image file has been added to the repository.

The proposed roadmap is:

1. Search annotation clips and seek to the right video moment.
2. Learn tool presence from SurgVLP features, evaluate by surgery, and export predicted intervals.
3. Localize visible objects in frames, then connect supported actions to the localized instruments/targets and expose optional video overlays.

A whole-image classifier answers what is present; a detector supplies boxes; a segmenter supplies masks. Existing SurgVLP embeddings and frame-level labels do not directly provide coordinates. Verbs such as grasp/retract/coagulate describe interactions, not objects with their own boxes. Triplet association requires a separate action/relation model or verified annotations; proximity between two boxes does not establish an action.

## Taxonomy and annotation audit first

Shlok's proposed scope was **7 instrument categories, 10 verbs and 15 targets**, with examples grasper/bipolar/hook, grasp/retract/cauterize, and gallbladder/cystic duct/liver. Preserve this product intent, but resolve the seventh instrument and verb display-name mapping before implementation. Do not silently add a background class or treat every target (including null categories) as boxable anatomy.

The official CholecT50 release lists **6 instruments, 10 verbs and 15 targets**, with instrument boxes and box-to-triplet matching on **5 of 50 videos**. It does not establish anatomy-box coverage for all targets. Access is through the official dataset request; its stated license is CC BY-NC-SA 4.0. These facts describe the official release, not what our current Hugging Face mirror contains. [Official downloads and annotation inventory](https://github.com/CAMMA-public/cholect50/blob/master/docs/README-Downloads.md).

The official format uses normalized top-left x/y plus width/height for boxes, with negative sentinels for absent values. Audit the exact downloaded version and convert valid coordinates explicitly; frame-level presence labels cannot fill absent boxes. [Official format](https://github.com/CAMMA-public/cholect50/blob/master/docs/README-Format.md).

Later audit: inventory actual box-bearing cases/frames and class mappings; check whether existing `samples.json` retained coordinates and relations; distinguish absent labels from confirmed negatives. Establish a separate surgery-level localization split based on box availability, recording overlap with the current split. Do not tune new models using surgeries already designated for final evaluation. Anatomy may need a separately annotated subset with appropriate review.

## Recommended model experiment

**First candidate: Grounding DINO-T (Swin-T)**, using the official `GroundingDINO_SwinT_OGC.py` configuration and `groundingdino_swint_ogc.pth` checkpoint. The project provides text-conditioned object detection, public pretrained weights, a CPU inference option and Apache-2.0 repository licensing. Start with noun prompts for instruments and visible anatomy, retaining exact prompt-to-dataset mappings. [Official repository and checkpoint instructions](https://github.com/IDEA-Research/GroundingDINO).

This is our proposed starting experiment, not a claim of surgical accuracy. Its general-domain performance cannot establish recognition of cystic ducts, instruments under occlusion, smoke or blood. Compare predictions against verified boxes; if inadequate, annotate/fine-tune a supervised detector rather than presenting zero-shot output as established ground truth. Pin source revision, checkpoint checksum, prompts, thresholds, package versions and license information when the experiment actually begins. Do not substitute an API-only model for the named downloadable checkpoint without a new decision.

**Optional second component: SAM 2.1**, for prompted masks and propagation across video frames after detections or reviewed manual prompts are available. The official project supplies image/video segmentation, pretrained checkpoints and training code under Apache 2.0 for its model/code. It is not a semantic instrument/verb classifier. [Official SAM 2 repository](https://github.com/facebookresearch/sam2).

Our proposed architecture is detector on selected frames → optional mask/tracking propagation → versioned overlay artifacts → player rendering. Tracking identity and semantic labels need separate validation. Initially use offline inference and cached results; measure cost, latency and available compute before choosing sampling density or claiming live inference. Current CPU feature-extraction throughput says nothing about detector/segmenter throughput.

## Spatial data boundary

Spatial detections remain separate from `surgf_clips`. The static artifact v1 is implemented on the feature branch; see [shared contracts](../agent-kit/CONTRACTS.md). The table below preserves the broader design, including deferred tracking and relations:

| Field | Proposed meaning |
|---|---|
| `case_id`, `video_asset_id` | Surgery and exact playable asset/version |
| `frame_id`, `timestamp_sec`, `image_width`, `image_height` | Source frame identity, playback time and uncropped source dimensions |
| `detections[]` | Zero or more instances; repeated instances of the same class are allowed |
| `instance_id`, `track_id` | Frame instance identity and optional validated temporal identity |
| `category`, `label` | Instrument or anatomy, using an agreed versioned taxonomy |
| `bbox_xyxy` | Proposed normalized source-image coordinates `[x1,y1,x2,y2]`, each in [0,1], with positive area |
| `score`, `source` | Model score (not assumed calibrated probability); annotation/prediction origin |
| `model_run_id`, `model_revision`, `taxonomy_version` | Reproducibility and interpretation |
| `relations[]` | Optional later verb/triplet links between instance IDs with their own provenance; absent until supported |

Source boxes in xywh or model coordinates must be converted, undoing crop/resize transforms. Do not use classifier center-crop coordinates as full-frame boxes. Map into the rendered video content rectangle, accounting for letterboxing. The dataset's 1 fps frame ID is not a 25 fps encoded-video frame index. Carry timestamps and verified per-asset offsets explicitly. Define a maximum overlay age; do not hold a one-second sampled box over arbitrary motion or invent intermediate tracking results.

## Current stopping point

The versioned artifact, bounded Grounding DINO runner, player prototype and supervised anatomy smoke test are implemented. The assignments above cover the remaining full training, data and browser work. No stage-2 jobs or shared clip-table schemas are changed. Initial labels use the six existing instrument names plus explicitly experimental anatomy prompts; no seventh instrument or verb detector is invented. Separate masks/tracking and action relations remain deferred.

Anatomy preparation now uses Endoscapes cystic duct/gallbladder boxes with published cross-dataset overlap checks; see [localization setup](localization/README.md). This is label preparation, not a trained or validated replacement model.
