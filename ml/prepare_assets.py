"""Fetch labels and official SurgVLP weights outside Git, with checksum verification."""
import argparse
import shutil
import urllib.request
import zipfile
from pathlib import Path

from download_case import with_retry
from extract_features import CHECKPOINT_SHA256, CHECKPOINT_URL, sha256

SAMPLES_URL = 'https://huggingface.co/datasets/Voxel51/cholect50/resolve/main/samples.json'
SAMPLES_SHA256 = 'c4791109d467ec59a05500aa3ef0b3215e9747881d97e4db9bffd135bcbe1b76'


def download(url, target):
    target = Path(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_suffix(target.suffix + '.part')

    def fetch():
        with urllib.request.urlopen(url, timeout=120) as src, partial.open('wb') as dst:
            shutil.copyfileobj(src, dst)
    with_retry(fetch)  # many parallel runs fetch the 500 MB labels file at once
    partial.replace(target)


def prepare(root):
    root = Path(root)
    root.mkdir(parents=True, exist_ok=True)
    samples, checkpoint = root / 'samples.json', root / 'SurgVLP.pth'
    if not samples.exists():
        download(SAMPLES_URL, samples)
    if sha256(samples) != SAMPLES_SHA256:
        raise ValueError(f'{samples}: labels differ from verified dataset; review before proceeding')
    if not checkpoint.exists():
        archive = root / 'SurgVLP.zip'
        if not archive.exists():
            download(CHECKPOINT_URL, archive)
        with zipfile.ZipFile(archive) as z, z.open('SurgVLP.pth') as src:
            partial = checkpoint.with_suffix('.pth.part')
            with partial.open('wb') as dst:
                shutil.copyfileobj(src, dst)
        if sha256(partial) != CHECKPOINT_SHA256:
            raise ValueError('downloaded checkpoint checksum mismatch')
        partial.replace(checkpoint)
    if sha256(checkpoint) != CHECKPOINT_SHA256:
        raise ValueError('cached checkpoint checksum mismatch')
    return samples, checkpoint


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    args = parser.parse_args()
    print(*prepare(args.root), sep='\n')
