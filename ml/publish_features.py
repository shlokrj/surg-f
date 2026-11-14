"""Copy a complete, validated bundle to a new destination and verify readback."""
import argparse
import shutil
from pathlib import Path
from extract_features import validate_bundle


def publish(source, destination, samples):
    source, destination = Path(source), Path(destination)
    validate_bundle(source, samples, require_complete=True)
    # No overwrite: never replace the other teammate's features or a failed upload.
    destination.mkdir(parents=True, exist_ok=False)
    for name in ['features.npy', 'manifest.csv', 'annotations.json']:
        shutil.copyfile(source / name, destination / name)
    # Metadata is written last; readers must validate checksums, not directory presence.
    shutil.copyfile(source / 'metadata.json', destination / 'metadata.json')
    return validate_bundle(destination, samples, require_complete=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source')
    parser.add_argument('destination')
    parser.add_argument('--samples', required=True)
    print(publish(**vars(parser.parse_args())))
