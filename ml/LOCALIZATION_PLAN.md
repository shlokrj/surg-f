# Stage 3: localized video overlays

Status: **active three-person implementation: Shlok, Aadhi (Aadhitya), and Mihir**. Shared integration branch: `feat/spatial-overlays`. Main contains the earlier prototype through `634c40f`; all further work is pushed to the spatial branch. **Do not merge or push this feature to main until Shlok explicitly requests final publication.** This instruction supersedes earlier blanket main-push permission and earlier Shlok-only stage-3 ownership. Historical progress entries remain evidence of past work, not current assignments.

## Current assignments and shared workflow

All three people and their agents should read this section and their owner section below before editing. Work concurrently on the shared remote branch, using separate clones or worktrees; do not switch a checkout another agent is using. Fetch/pull before starting and before publication. If the branch advances after local commits, preserve both histories with a normal merge (resolve conflicts and rerun affected checks); never force-push or reset another person's work. Commit each finished change with a lowercase Conventional Commit subject, using the configured user's identity and no co-author trailers. Push to `origin feat/spatial-overlays` only.

| Owner | Start now | Owns | Handoff / done when |
|---|---|---|---|
| Shlok | Build category-scoped detection metrics and a configurable full anatomy trainer from the smoke runner | `ml/localization/train_anatomy*.py`, `evaluate.py`, new metric/training/inference scripts and their tests; model run reports | Reproducible training, validation-only model selection, saved checkpoint/provenance, per-class localization metrics and exportable predictions. Give Aadhi a checkpoint and explicit class map; give Mihir honest capability/quality notes. |
| Aadhi (Aadhitya) | Prepare full train/validation imagery with verified manifests and resume-safe downloads; investigate six-instrument box supervision | `ml/localization/prepare_anatomy.py`, `fetch_anatomy*.py`, `audit_coco.py`, data/split manifests and related tests; new annotation conversion and overlay-export scripts | Shlok can load data without missing/corrupt files; surgeries remain disjoint and protected overlaps are excluded. Mihir receives validated versioned overlay artifacts bound to playable assets. Instrument annotation availability and label mappings are explicitly verified. |
| Mihir | Verify and finish the real browser player flow using the existing VID01 artifact | `frontend/src/overlays.js`, integration in `main.js`, `cases.js`, overlay CSS, frontend tests/README and published `frontend/public/overlays/` artifacts | Toggle/filter/score/seek/play/resize/fullscreen/case-switch/local-upload/missing-data behavior verified in a real browser with evidence; usable responsive controls and no stale boxes. Coordinate incoming artifact publication with Aadhi. |

Assignments are **ready to start**, not completed. No one should duplicate another owner's jobs. Existing stage-2 jobs may finish independently; Aadhi should record their state before starting expensive spatial work and avoid restarting them accidentally. Other backend and frontend work remains outside this feature's scope.

### Shlok — model and evaluation

1. Add an explicit evaluated-category scope for cystic duct/gallbladder. Do not count unannotated liver or instrument classes as negatives. Add meaningful COCO-style AP/recall or clearly documented fixed-threshold metrics, empty-frame behavior, and matching tests.
2. Build full training from the verified three-step smoke: configurable data paths, seed, epochs, device, resume/checkpoint handling, finite-loss checks and recorded input hashes. Start with a bounded run; use Aadhi's complete manifests for scaling. Compare to a declared baseline on the same validation surgeries.
3. Select checkpoints/thresholds on validation only. Keep final-test surgeries untouched until the model is fixed. Record per-class support, metrics, timing, failure cases and limitations. A falling training loss alone is not acceptance.
4. Supply Aadhi an inference entry point with the exact class map, normalization, checkpoint hash and model version. Decide whether evidence supports a demo; unsupported classes remain unavailable, not relabeled to plausible classes.

### Aadhi — data, supervision and artifact delivery

1. Extend bounded downloads to all required training and validation images, with resumability, hashes, decode/dimension validation and a missing-file report. Preserve source licenses/attribution; keep images and model weights outside Git. Use published overlap mapping plus the current frozen stage-2 split; Endoscapes IDs are not CholecT50 IDs.
2. Publish train/validation manifests and a compact readiness report for Shlok. Preserve explicit negative frames only for the two supported anatomy labels. Do not use the test partition for iteration.
3. Obtain or inventory genuine six-instrument localization annotations. The downloaded CholecT50 COCO conversion has zero boxes; Endoscapes `tool` cannot distinguish instrument types. Document access blockers rather than manufacturing ground truth or treating pseudo-labels as reviewed labels.
4. After Shlok provides a checkpoint, generate bounded predictions for agreed playable clips. Validate source dimensions, timestamps, source/asset IDs, model/image hashes and schema with `artifact.py`. Give Mihir sample artifacts plus expected timestamps. Sparse boxes must expire; dense playback or tracking needs measured throughput and separate verification.

### Mihir — player and user-facing verification

1. Run the current app with the actual VID01 video. Use sampled frames 674/680/689 and record screenshots or a short recording. DOM tests simulate media state and do not establish actual browser playback/fullscreen correctness.
2. Check loading/error/retry states, category/score filtering, readable labels, keyboard interaction, empty detections, seeking/playing, resize/letterboxing and fullscreen. Verify case changes and late fetch responses never leak old boxes; local uploads stay unavailable unless an exact artifact binding exists.
3. Coordinate frontend artifact publication with Aadhi. Retain experimental/source labeling and avoid presenting scores as calibrated probabilities. Do not replace real predictions with fabricated high-quality boxes.
4. Add regression coverage for bugs found, run the frontend build, and record actual browser/version and test results. Preserve existing quiz, charts, search and backend interpretation integration.

## Handoffs and final completion gate

Aadhi → Shlok: versioned data roots, category map, hashes, split/overlap report, missing-file count and ready command. Shlok → Aadhi: checkpoint, inference command, class map and measured validation results. Aadhi → Mihir: schema-valid artifact, matching asset version and timestamps. Mihir → team: browser evidence and remaining defects. Any schema change needs all affected owners to agree in `agent-kit/CONTRACTS.md` before producers/consumers diverge; Aadhi coordinates the data contract, Mihir the frontend adapter, Shlok the model fields.

Update only your owner row/evidence in `ml/PROGRESS.md` and relevant implementation docs at each handoff; preserve teammates' entries. For shared files (`artifact.py`, `CONTRACTS.md`, README and plan), announce intended edits in the tracker and pull the latest version first. Do not edit another owner's implementation without coordinating the handoff.

Before Shlok requests main publication: training/evaluation evidence is reproducible; the agreed classes and limitations are documented; sample artifacts match actual video time/geometry; browser acceptance and automated checks pass; no images/credentials/checkpoints accidentally enter Git; unfinished optional features are explicitly deferred. Tracking, action recognition and all 15 anatomy targets are not implied by the two-class anatomy milestone. Numeric accuracy/latency targets must be agreed from validation evidence, not invented as achieved.

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
