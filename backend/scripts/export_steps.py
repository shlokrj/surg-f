"""Regenerate backend/fixtures/steps.<case>.json from the Cholec80 phase annotations.

Pulls only the small per-video phase files out of the public cholec80.zip with HTTP range
requests. The demo videos are the original 25 fps Cholec80 files (copied without
re-encoding), so frame N is second N / 25 of the playable video. Works for VID01-VID80.
License: CC BY-NC-SA 4.0. Cite EndoNet (Twinanda et al., IEEE TMI 2017).

Run from backend/:
    python -m uv run --with remotezip python scripts/export_steps.py VID01 VID02
"""

import json
import sys
from pathlib import Path

from remotezip import RemoteZip

URL = "https://s3.unistra.fr/camma_public/datasets/cholec80/cholec80.zip"
FPS = 25
FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"
# Dataset phase name -> plain label. Cholec80 calls the final extraction "retraction".
LABELS = {
    "Preparation": "Preparation",
    "CalotTriangleDissection": "Calot's triangle dissection",
    "ClippingCutting": "Clipping and cutting",
    "GallbladderDissection": "Gallbladder dissection",
    "GallbladderPackaging": "Gallbladder packaging",
    "CleaningCoagulation": "Cleaning and coagulation",
    "GallbladderRetraction": "Gallbladder removal",
}


def segments(text: str) -> list[dict]:
    rows = [line.split("\t") for line in text.strip().splitlines()[1:]]
    steps, start = [], 0
    for index, (frame, phase) in enumerate(rows):
        last = index == len(rows) - 1
        if last or rows[index + 1][1] != phase:
            end = int(frame) + 1
            steps.append(
                {
                    "order": len(steps) + 1,
                    "key": phase,
                    "label": LABELS[phase],
                    "start_sec": round(start / FPS, 2),
                    "end_sec": round(end / FPS, 2),
                }
            )
            start = end
    return steps


def main(case_ids: list[str]) -> None:
    with RemoteZip(URL) as archive:
        for case_id in case_ids:
            number = int(case_id.removeprefix("VID"))
            text = archive.read(f"phase_annotations/video{number:02d}-phase.txt").decode()
            payload = {"case_id": case_id, "source": "cholec80_phase", "steps": segments(text)}
            path = FIXTURES / f"steps.{case_id}.json"
            path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8", newline="\n")
            print(f"wrote {path.name}: {len(payload['steps'])} steps")


if __name__ == "__main__":
    main(sys.argv[1:] or ["VID01", "VID02"])
