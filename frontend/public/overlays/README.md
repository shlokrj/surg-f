# Experimental localization overlays

`VID01.json` contains anatomy predictions from the two-class Endoscapes Faster R-CNN MobileNetV3 model (`anatomy-full-v2`, epoch 7, validation AP 0.352; cystic duct precision 0.66 / recall 0.37 at the export threshold) for every 0.24 s of VID01. Labels are gallbladder (score ≥ 0.65) and cystic duct (score ≥ 0.70) only: no instruments and no liver. These are model predictions, not ground truth or medical review; cystic duct detection is still the weaker class and VID01 accuracy is unmeasured. Checkpoint hash, data signature, video hash, thresholds and timebase are stored in `provenance`. See [runner documentation](../../../ml/localization/README.md#full-anatomy-data-training-and-export-mihir).

The earlier Grounding DINO preview (three frames, some wrong labels) is kept only as a test fixture at `frontend/test/fixtures/VID01-grounding-dino.json`.

Training imagery: Endoscapes, Murali et al. (CC BY-NC-SA 4.0). Source video: Cholec80, Twinanda et al., IEEE TMI 2017; CholecT50, Nwoye et al., Medical Image Analysis 2022. Dataset license: [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). Preserve attribution and the source dataset terms for this derived artifact. No source imagery is included.
