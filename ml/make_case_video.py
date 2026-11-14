"""Build a playable 1 fps .mp4 for one CholecT50 case from the Hugging Face frames.

Frame N becomes second N of the video, matching start_sec/end_sec in surgf_clips.
Usage: python3 ml/make_case_video.py path/to/samples.json VID01 out_dir/
Needs ffmpeg on PATH, or `pip install imageio-ffmpeg`.
"""
import shutil
import subprocess
import sys
from pathlib import Path

from download_case import download_frames


def ffmpeg():
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def main(samples, case_id, out_dir):
    frames_dir, n = download_frames(samples, case_id, out_dir)
    video = Path(out_dir) / f"{case_id}.mp4"
    # -g 1: every frame is a keyframe, so seeking to second N lands exactly on frame N
    subprocess.run([ffmpeg(), "-y", "-loglevel", "error", "-framerate", "1", "-i", str(frames_dir / "%06d.png"),
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-g", "1", "-movflags", "+faststart", str(video)],
                   check=True)
    print(f"{video}: {n} frames = {n} seconds")


if __name__ == "__main__":
    main(*sys.argv[1:4])
