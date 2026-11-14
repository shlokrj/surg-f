"""Read-only full-bundle preflight for the fixed training split; never starts jobs."""
import argparse
from collections import Counter
from datetime import datetime, timezone
import json
from pathlib import Path
import shutil
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'ml'))
from extract_features import validate_bundle
from train_tools import TOOLS

FILES = ('metadata.json', 'features.npy', 'manifest.csv', 'annotations.json')
PROVENANCE = ('checkpoint_sha256', 'preprocessing', 'samples_sha256')


def check_split(split, inspect):
    """Inspect every required case, collecting errors instead of failing at the first."""
    import re
    seen = set()
    for group in ('train', 'validation', 'test', 'diagnostic'):
        cases = split.get(group, [])
        if not isinstance(cases, list) or (group != 'diagnostic' and not cases):
            raise ValueError(f'{group} must be a list and required groups must be nonempty')
        if any(not isinstance(c, str) or not re.fullmatch(r'VID\d+', c) for c in cases):
            raise ValueError('invalid surgery ID')
        if len(set(cases)) != len(cases) or seen.intersection(cases):
            raise ValueError('split cases must be unique and disjoint')
        seen.update(cases)
    if 'VID02' in seen and 'VID02' not in split.get('diagnostic', []):
        raise ValueError('VID02 must remain diagnostic')
    records, reference = [], None
    for group in ('train', 'validation', 'test'):
        for case in split[group]:
            row = {'case_id': case, 'group': group}
            try:
                metadata, annotations = inspect(case)
                if metadata['case_id'] != case:
                    raise ValueError('bundle case ID differs from requested case')
                provenance = {key: metadata[key] for key in PROVENANCE}
                if any(value is None or value == '' for value in provenance.values()):
                    raise ValueError('missing provenance')
                known = [a['instruments'] for a in annotations if a['instruments'] is not None]
                if not known:
                    raise ValueError('no known annotations')
                if any(not isinstance(labels, list) or any(tool not in TOOLS for tool in labels) for labels in known):
                    raise ValueError('invalid instrument annotations')
                if reference is None:
                    reference = provenance
                differing = [key for key in PROVENANCE if provenance[key] != reference[key]]
                if differing:
                    raise ValueError('incompatible provenance: ' + ', '.join(differing))
                counts = Counter(tool for labels in known for tool in set(labels))
                row.update(status='ready', shape=metadata['shape'], known_frames=len(known),
                           unknown_frames=len(annotations)-len(known),
                           positive_frames={tool: counts[tool] for tool in TOOLS},
                           file_sha256=metadata['file_sha256'])
            except Exception as error:
                # Authentication, transport and integrity errors are never labeled ready.
                row.update(status='blocked', error_type=type(error).__name__, reason=str(error))
            records.append(row)
    ready = all(row['status'] == 'ready' for row in records)
    unsupported = []
    train = [row for row in records if row['group'] == 'train' and row['status'] == 'ready']
    if len(train) == len(split['train']):
        n = sum(row['known_frames'] for row in train)
        unsupported = [tool for tool in TOOLS if sum(row['positive_frames'][tool] for row in train) in (0, n)]
    return {'checked_at_utc': datetime.now(timezone.utc).isoformat(), 'ready': ready,
            'split': split, 'cases': records, 'required_cases': len(records),
            'ready_cases': sum(row['status'] == 'ready' for row in records),
            'unsupported_training_tools': unsupported,
            'reference_provenance': reference,
            'scope': 'Full bundle integrity and cross-case provenance; diagnostic cases excluded. '
                     'Readiness is a point-in-time check, not model quality or a training run.'}


def inspect_local(path, samples=None):
    metadata = validate_bundle(path, samples, require_complete=True)
    return metadata, json.loads((path / 'annotations.json').read_text())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--split', default=str(ROOT / 'ml/case_split.json'))
    parser.add_argument('--features-root', default='/Volumes/workspace/default/surgf/features')
    parser.add_argument('--databricks', action='store_true', help='Download temporary verification copies through the Files API')
    parser.add_argument('--samples', help='Optional source labels for independent annotation joins')
    parser.add_argument('--output', required=True, help='Report path outside Git, e.g. /tmp/surgf-readiness.json')
    args = parser.parse_args()
    split = json.loads(Path(args.split).read_text())
    if args.databricks:
        from run_databricks_features import client
        workspace = client()

        def inspect(case):
            with tempfile.TemporaryDirectory(prefix='surgf-readiness-') as tmp:
                path = Path(tmp)
                for name in FILES:
                    response = workspace.files.download(f'{args.features_root.rstrip("/")}/{case}/{name}')
                    with response.contents as source, (path / name).open('wb') as destination:
                        shutil.copyfileobj(source, destination)
                return inspect_local(path, args.samples)
    else:
        def inspect(case):
            return inspect_local(Path(args.features_root) / case, args.samples)
    report = check_split(split, inspect)
    report['source_annotation_check'] = args.samples is not None
    Path(args.output).write_text(json.dumps(report, indent=2) + '\n')
    print(f"{report['ready_cases']}/{report['required_cases']} required cases ready; report: {args.output}")
    for row in report['cases']:
        if row['status'] == 'blocked':
            print(f"{row['case_id']} ({row['group']}): {row['reason']}")
    return 0 if report['ready'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
