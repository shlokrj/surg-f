"""Download demo videos from the shared Databricks Volume into frontend/public/videos/.

Uses the repo-root .env (same token as the backend). Videos are git-ignored there.
Usage: python scripts/fetch_videos.py VID01 [VID02 ...]
Needs `pip install databricks-sdk python-dotenv`.
"""
import shutil
import sys

from run_databricks_features import ROOT, client

VOLUME = '/Volumes/workspace/default/surgf/videos'


def main(case_ids):
    w = client()
    out = ROOT / 'frontend' / 'public' / 'videos'
    out.mkdir(parents=True, exist_ok=True)
    for case_id in case_ids:
        dst = out / f'{case_id}.mp4'
        with open(dst, 'wb') as f:
            shutil.copyfileobj(w.files.download(f'{VOLUME}/{case_id}.mp4').contents, f)
        print(dst, dst.stat().st_size, 'bytes')


if __name__ == '__main__':
    main(sys.argv[1:] or ['VID01'])
