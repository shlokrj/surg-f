# Stage 3: localized video overlays

Status: **experimental offline runner and player integration implemented; browser acceptance pending; started 2026-11-14 at Shlok's explicit request; owner Shlok, branch `feat/spatial-overlays`**. Aadhitya independently continues stage 2 on `ml-dev`. This adds spatial localization to the current search and tool-presence pipeline. The initial deliverable is an offline detector-to-player prototype. Verification results will be recorded as work completes; this is not a production-accuracy claim.

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

## Later implementation sequence and handoffs

These are proposed responsibilities consistent with existing lanes, not work started now:

1. **Shlok / ML:** audit taxonomy and localization labels, define held-out evaluation, benchmark the detector on a small representative subset; only then decide on fine-tuning or tracking.
2. **Aadhitya / ML-data:** obtain/version available spatial annotations, verify image/video coordinates and timebase, package overlay artifacts with provenance. Review tracking/mask export if added.
3. **Rohan / backend-data:** agree with ML on separate storage and a bounded frame/time-range response; validate coordinates, taxonomy, source and asset version. No route/table name is committed by this document.
4. **Mihir / frontend:** build toggle and overlay layer against an explicitly labeled fixture after the schema is agreed; verify pause, seek, resizing, fullscreen and stale-data removal.

Acceptance later: per-class box AP/recall and localization IoU on held-out surgeries, separate tool versus anatomy results, false-positive review, missing-label accounting, latency and memory measurements. If masks/tracks are used, add mask quality and identity/jitter checks. If verbs/triplets are shown, evaluate those predictions and instance associations separately. Record demo-only or unsupported categories honestly; do not derive correctness from attractive overlays.

## Current stopping point

Shlok is implementing a versioned artifact, bounded offline Grounding DINO inference and a player toggle. No stage-2 jobs or shared clip-table schemas are changed. Initial labels use the six existing instrument names plus explicitly experimental anatomy prompts; no seventh instrument or verb detector is invented. Separate masks/tracking and action relations remain deferred.

Anatomy preparation now uses Endoscapes cystic duct/gallbladder boxes with published cross-dataset overlap checks; see [localization setup](localization/README.md). This is label preparation, not a trained or validated replacement model.
