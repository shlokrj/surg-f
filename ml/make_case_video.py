"""Build a playable 1 fps .mp4 for one CholecT50 case from the Hugging Face frames.

Frame N becomes second N of the video, matching start_sec/end_sec in surgf_clips.
Usage: python3 ml/make_case_video.py path/to/samples.json VID01 out_dir/
Needs ffmpeg on PATH, or `pip install imageio-ffmpeg`.
"""
import json
import shutil
import subprocess
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

BASE = "https://huggingface.co/datasets/Voxel51/cholect50/resolve/main/"


def ffmpeg():
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def main(samples, case_id, out_dir):
    out = Path(out_dir)
    frames_dir = out / case_id
    frames_dir.mkdir(parents=True, exist_ok=True)
    paths = {s["frame_number"]: s["filepath"].removeprefix("./")
             for s in json.load(open(samples))["samples"] if s["video_id"] == case_id}
    n = len(paths)
    assert sorted(paths) == list(range(n)), "frames must be contiguous from 0"

    def fetch(i):
        dst = frames_dir / f"{i:06d}.png"
        if not dst.exists():  # resumable
            tmp = dst.with_suffix(".part")
            urllib.request.urlretrieve(BASE + paths[i], tmp)
            tmp.rename(dst)

    with ThreadPoolExecutor(16) as pool:
        list(pool.map(fetch, range(n)))
    video = out / f"{case_id}.mp4"
    # -g 1: every frame is a keyframe, so seeking to second N lands exactly on frame N
    subprocess.run([ffmpeg(), "-y", "-loglevel", "error", "-framerate", "1", "-i", str(frames_dir / "%06d.png"),
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-g", "1", "-movflags", "+faststart", str(video)],
                   check=True)
    print(f"{video}: {n} frames = {n} seconds")


if __name__ == "__main__":
    main(*sys.argv[1:4])
