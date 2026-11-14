"""Download the full-resolution frames for one CholecT50 case (or one clip of it) from Hugging Face.

Frames are 1 fps, so frame N = second N. Files are saved as <out_dir>/<case_id>/<NNNNNN>.png.
Usage:
  python3 ml/download_case.py path/to/samples.json VID01 out_dir/            # whole case
  python3 ml/download_case.py path/to/samples.json VID01 out_dir/ 674 690    # one clip, end exclusive
Get samples.json (labels, ~500 MB) from
https://huggingface.co/datasets/Voxel51/cholect50/resolve/main/samples.json
"""
import json
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

BASE = "https://huggingface.co/datasets/Voxel51/cholect50/resolve/main/"


def download_frames(samples, case_id, out_dir, start=None, end=None):
    """Return (frames_dir, total_frames_in_case) after downloading frames start..end-1."""
    paths = {s["frame_number"]: s["filepath"].removeprefix("./")
             for s in json.load(open(samples))["samples"] if s["video_id"] == case_id}
    n = len(paths)
    if not n:
        sys.exit(f"{case_id} not found in {samples}")
    assert sorted(paths) == list(range(n)), "frames must be contiguous from 0"
    start, end = start or 0, min(end or n, n)
    frames_dir = Path(out_dir) / case_id
    frames_dir.mkdir(parents=True, exist_ok=True)

    def fetch(i):
        dst = frames_dir / f"{i:06d}.png"
        if not dst.exists():  # resumable
            tmp = dst.with_suffix(".part")
            for attempt in range(8):  # Hugging Face rate-limits (429) when many runs download at once
                try:
                    urllib.request.urlretrieve(BASE + paths[i], tmp)
                    break
                except urllib.error.HTTPError as e:
                    if e.code != 429 and e.code < 500 or attempt == 7:
                        raise
                    time.sleep(float(e.headers.get("Retry-After") or 0) or min(60, 2 ** attempt))
            tmp.rename(dst)

    with ThreadPoolExecutor(16) as pool:
        list(pool.map(fetch, range(start, end)))
    print(f"{frames_dir}: frames {start}-{end - 1} of {n}")
    return frames_dir, n


if __name__ == "__main__":
    a = sys.argv[1:]
    download_frames(a[0], a[1], a[2], *(int(x) for x in a[3:5]))
