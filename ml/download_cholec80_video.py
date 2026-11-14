"""Download one original 25 fps Cholec80 video as a browser-ready <case_id>.mp4.

Pulls only that video out of the 75 GB cholec80.zip using HTTP range requests, then moves the
mp4 index to the front (faststart, no re-encode). Second N matches CholecT50 frame N within 0.1 s,
with a constant per-case offset and no drift (VID01 -0.04 s, VID02 +0.08 s). Works for VID01-VID80 only.
License: CC BY-NC-SA 4.0. Cite EndoNet (Twinanda et al., IEEE TMI 2017).
Usage: python3 ml/download_cholec80_video.py VID01 out_dir/
Needs `pip install remotezip` and ffmpeg (or `pip install imageio-ffmpeg`).
"""
import subprocess
import sys
import tempfile
from pathlib import Path

from remotezip import RemoteZip

from make_case_video import ffmpeg

URL = "https://s3.unistra.fr/camma_public/datasets/cholec80/cholec80.zip"


def main(case_id, out_dir):
    num = int(case_id.removeprefix("VID"))
    if not 1 <= num <= 80:
        sys.exit(f"{case_id}: Cholec80 only has VID01-VID80; use make_case_video.py for 1 fps")
    out = Path(out_dir) / f"{case_id}.mp4"
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        with RemoteZip(URL) as z:
            src = z.extract(f"videos/video{num:02d}.mp4", tmp)
        subprocess.run([ffmpeg(), "-y", "-loglevel", "error", "-i", src, "-map", "0:v", "-c", "copy",
                        "-movflags", "+faststart", str(out)], check=True)
    print(out)


if __name__ == "__main__":
    main(*sys.argv[1:3])
