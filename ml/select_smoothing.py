"""Select clip smoothing using a complete, comparable validation sweep only."""
import argparse
import hashlib
import json
import math
from pathlib import Path

TOOLS = ('bipolar', 'clipper', 'grasper', 'hook', 'irrigator', 'scissors')
DEFAULT_SETTINGS = '0:1,1:1,2:2,3:3,5:3,10:5'


def parse_settings(text):
    result = []
    for token in text.split(','):
        values = token.split(':')
        if len(values) != 2:
            raise ValueError('settings must be gap:min-length pairs')
        gap, length = map(int, values)
        if gap < 0 or length < 1 or (gap, length) in result:
            raise ValueError('invalid or duplicate smoothing setting')
        result.append((gap, length))
    return result


def select(reports, split, settings):
    from train_tools import validate_split
    validate_split(split)
    if not settings or len(set(settings)) != len(settings):
        raise ValueError('explicit unique candidate settings required')
    for gap, length in settings:
        if type(gap) is not int or type(length) is not int or gap < 0 or length < 1:
            raise ValueError('invalid smoothing setting')
    validation = set(split['validation'])
    expected = {(case, gap, length) for case in validation for gap, length in settings}
    observed, shared, case_provenance = {}, None, {}
    for report in reports:
        case = report['case_id']
        if type(report['max_gap_sec']) is not int or type(report['min_clip_sec']) is not int:
            raise ValueError('report smoothing settings must be integers')
        key = (case, report['max_gap_sec'], report['min_clip_sec'])
        if key not in expected or key in observed:
            raise ValueError('unexpected case/setting or duplicate report; validation cases only')
        if report.get('model_split') != split:
            raise ValueError('model split does not match the fixed split')
        common = {k: report[k] for k in ['model_run_id', 'source_revision', 'frame_threshold', 'iou_threshold', 'matching']}
        if not common['model_run_id'] or not common['source_revision'] or not common['matching']:
            raise ValueError('missing run/source/matching provenance')
        for name in ['frame_threshold', 'iou_threshold']:
            value = common[name]
            if name == 'frame_threshold' and value == 'per_label':  # MLP: thresholds live in the model artifact
                continue
            if not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 < value <= 1:
                raise ValueError('invalid evaluation threshold')
        if shared is None:
            shared = common
        elif shared != common:
            raise ValueError('reports mix models, code revisions, thresholds or matching rules')
        hashes = report['feature_bundle_hashes']
        if set(hashes) != {'features.npy', 'manifest.csv', 'annotations.json'} or not all(hashes.values()):
            raise ValueError('complete bundle hashes required')
        if case in case_provenance and case_provenance[case] != hashes:
            raise ValueError('case bundle changed between settings')
        case_provenance[case] = hashes
        if set(report['tools']) - set(TOOLS):
            raise ValueError('unknown tool in report')
        tool_scores = {}
        for tool in TOOLS:
            counts = report['tools'].get(tool, {'tp': 0, 'fp': 0, 'fn': 0})
            values = [counts[k] for k in ['tp', 'fp', 'fn']]
            if any(type(value) is not int or value < 0 for value in values):
                raise ValueError('event counts must be nonnegative integers')
            tp, fp, fn = values
            tool_scores[tool] = 2*tp/(2*tp+fp+fn) if 2*tp+fp+fn else 0.0
        observed[key] = {'tool_f1': tool_scores, 'macro_f1': sum(tool_scores.values())/len(TOOLS)}
    if set(observed) != expected:
        raise ValueError('incomplete sweep: ' + ', '.join(f'{c}/{g}:{m}' for c,g,m in sorted(expected-set(observed))))
    # Ground-truth support must not depend on smoothing settings.
    supports = {}
    for report in reports:
        support = {tool: report['tools'].get(tool, {}).get('tp', 0) + report['tools'].get(tool, {}).get('fn', 0) for tool in TOOLS}
        case = report['case_id']
        if case in supports and support != supports[case]:
            raise ValueError('ground-truth event support changed between settings')
        supports[case] = support
    ranking = []
    for gap, length in settings:
        cases = {case: observed[(case, gap, length)] for case in sorted(validation)}
        ranking.append({'max_gap_sec': gap, 'min_clip_sec': length, 'cases': cases,
                        'score': sum(row['macro_f1'] for row in cases.values())/len(cases)})
    ranking.sort(key=lambda r: (-r['score'], r['max_gap_sec'], r['min_clip_sec']))
    return {'selected': {k: ranking[0][k] for k in ['max_gap_sec', 'min_clip_sec', 'score']},
            'criterion': 'mean across validation surgeries of six-tool event macro F1; absent tools score zero',
            'tie_break': 'smaller gap, then smaller minimum clip length',
            'provenance': shared, 'feature_bundle_hashes': case_provenance,
            'split': split, 'ranking': ranking, 'final_test_used': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('reports', nargs='+', help='evaluation.json files or notebook sweep-result JSON files')
    parser.add_argument('--split', default=str(Path(__file__).with_name('case_split.json')))
    parser.add_argument('--settings', default=DEFAULT_SETTINGS)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    output = Path(args.output)
    markdown = output.with_suffix('.md')
    if output == markdown or output.exists() or markdown.exists():
        raise FileExistsError('choose a new JSON output and Markdown sidecar path')
    reports, hashes = [], {}
    for name in args.reports:
        raw = Path(name).read_bytes()
        data = json.loads(raw)
        reports.extend([data] if 'case_id' in data else data.values())
        hashes[name] = hashlib.sha256(raw).hexdigest()
    result = select(reports, json.loads(Path(args.split).read_text()), parse_settings(args.settings))
    result['input_sha256'] = hashes
    with output.open('x') as stream:
        stream.write(json.dumps(result, indent=2) + '\n')
    lines = ['# Validation smoothing selection', '', result['criterion'], '',
             '| Gap (s) | Minimum length (s) | Score |', '|---:|---:|---:|']
    lines += [f"| {r['max_gap_sec']} | {r['min_clip_sec']} | {r['score']:.6f} |" for r in result['ranking']]
    lines += ['', 'Selected: ' + str(result['selected']), '', 'Tie break: ' + result['tie_break'], '', 'No final-test cases used.']
    with markdown.open('x') as stream:
        stream.write('\n'.join(lines) + '\n')
    print(json.dumps(result['selected']))


if __name__ == '__main__':
    main()
