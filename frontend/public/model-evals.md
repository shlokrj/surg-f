# How well does Surg+F's AI see surgery?

Surg+F watches laparoscopic gallbladder surgery video and labels each second with:

- **6 instruments:** grasper, hook, bipolar, clipper, irrigator, scissors
- **9 actions:** for example dissect, retract, coagulate, clip, cut
- **14 anatomical targets:** for example gallbladder, liver, cystic duct, specimen bag

Those labels power search. Type "clipper" or "dissect", and the app jumps to that moment in the video.

## The model

| | |
|---|---|
| **Vision encoder** | SurgVLP, a model pretrained on surgical video, used frozen. It turns each video frame into a 768-number description. |
| **Classifier** | A small neural network, trained by us, that reads those descriptions plus the 5 seconds around each frame and predicts all 29 labels at once. |
| **Data** | CholecT50: 50 real surgeries labeled by surgeons. The model is trained on 42, tuned on 3 and tested on 4 it has never seen. |
| **Platform** | Feature extraction, training and evaluation all run on **Databricks** (serverless jobs). Every run is tracked in **MLflow**. |

## Results on 4 unseen surgeries

The score is **F1**, from 0 to 1, where 1 is perfect. It balances catching every true moment against avoiding false alarms. It is measured second by second.

| Instrument | F1 |
|---|---|
| Grasper | **0.89** |
| Hook | **0.83** |
| Bipolar | 0.52 |
| Scissors | 0.29 |
| Irrigator | 0.26 |
| Clipper | 0.19 |

| Best actions | F1 | | Best targets | F1 |
|---|---|---|---|---|
| Retract | **0.86** | | Gallbladder | **0.88** |
| Dissect | **0.78** | | Specimen bag | **0.75** |
| Coagulate | 0.46 | | Liver | 0.51 |
| Grasp | 0.40 | | Omentum | 0.21 |

**Average across all 29 labels: 0.34.**

## What improved

| Version | Training surgeries | Average F1 (29 labels) | Scissors F1 |
|---|---|---|---|
| Neural network v1 | 12 | 0.30 | 0.07 |
| **Neural network v2 (live)** | **42** | **0.34** | **0.29** |

The final instrument scores also beat our first model, a set of simple per-tool classifiers. For example, hook rose from 0.75 to 0.83 and bipolar from 0.34 to 0.52.

## Bounding boxes on the video (experimental)

Detectors draw boxes around the **gallbladder**, the **cystic duct** and **instruments** in the VID01 and VID02 videos, every quarter second.

| | |
|---|---|
| **Model** | Faster R-CNN (MobileNetV3 backbone, pretrained on COCO), fine-tuned by us on full-resolution frames |
| **Data** | Endoscapes: 1,212 surgeon-annotated frames from 120 surgeries for training, tested on 409 frames from 41 other surgeries |
| **What it finds** | Gallbladder and cystic duct (anatomy model), and instruments (a second version trained with Endoscapes' instrument boxes). Endoscapes boxes every instrument as one generic "tool", so the detector finds instruments but cannot tell their type |
| **Instrument names** | Taken from the surgeons' per-second labels: a box is named only when the labels list exactly one instrument for that second **and** the detector finds exactly one instrument. Otherwise it is not shown, so names are never guessed between two tools. About a quarter of detected instruments get a name this way |

| On the 409 test frames | Gallbladder | Cystic duct | Instruments (any type) |
|---|---|---|---|
| Boxes that are correct (precision) | **0.93** | 0.69 | **0.89** |
| Real ones it finds (recall) | **0.93** | 0.39 | **0.83** |

A box counts as correct when it overlaps the surgeon's box by at least half. Overall detection score (COCO AP): **0.38**, up from 0.35 for our previous version. The gallbladder and instruments are found reliably; the cystic duct is small and often hidden, so many are missed. Instrument names are not scored on a test set (no dataset has typed instrument boxes); a visual spot check of 12 named boxes across both videos found 11 clearly correct and 1 uncertain.

**Not yet checked on this video.** These numbers come from Endoscapes surgeries, not from VID01 or VID02 themselves, and the boxes have not been reviewed by a clinician. Treat them as an experimental view, not as ground truth.

## How to read the search results

- **"Labeled" clips** come from surgeon annotations. Treat them as ground truth.
- **"AI-predicted" clips** come from this model, shown for the 4 unseen surgeries. Treat them as **suggested moments**: they usually land in the right part of the video, but their start and end times are approximate.
- **Common events are reliable:** grasper, hook, retract, dissect, gallbladder and specimen bag.
- **Rare events are not:** some labels appear only a few times in all 50 surgeries. Pack, adhesion, blood vessel, cystic pedicle, gut and peritoneum are effectively never predicted correctly.

## How we kept the evaluation honest

- The 4 test surgeries were never used for training or tuning. Every setting was chosen on separate validation surgeries before the test was run.
- Clip smoothing fills gaps of 2 s or less and drops clips shorter than 2 s. That setting was also chosen on validation only.
- Every number above traces to a logged MLflow run: final model `9d18d20a`.
