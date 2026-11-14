"""Process assigned cases serially with a pinned revision and resumable evidence.

Each case gets a smoke run, full CPU extraction, and independent Volume validation.
The state file belongs outside Git. Failed jobs stop the batch for review.
"""
import argparse
import json
from pathlib import Path
import time

import gpu_run
from run_databricks_features import client, snapshot
from verify_databricks_features import verify


def refresh_pending(state, revision, remote):
    """Preserve snapshots for started cases; upgrade only unstarted cases."""
    for result in state['results'].values():
        if result.get('smoke') or result.get('full'):
            result.setdefault('revision', state['revision'])
            result.setdefault('remote', state['remote'])
    state['revision'], state['remote'] = revision, remote


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--cases', nargs='+', required=True)
    p.add_argument('--samples', required=True)
    p.add_argument('--state', type=Path, required=True)
    p.add_argument('--refresh-pending', action='store_true',
                   help='Use current committed code for unstarted cases; preserve active runs')
    a = p.parse_args()
    w = client()
    if a.state.exists():
        state = json.loads(a.state.read_text())
        if state['cases'] != a.cases:
            raise ValueError('Resume with the original case list')
    else:
        revision, remote = snapshot(w)
        state = {'revision': revision, 'remote': remote, 'cases': a.cases, 'results': {}}
    if a.refresh_pending:
        refresh_pending(state, *snapshot(w))

    def save():
        a.state.parent.mkdir(parents=True, exist_ok=True)
        tmp = a.state.with_suffix('.tmp')
        tmp.write_text(json.dumps(state, indent=2) + '\n')
        tmp.replace(a.state)

    def wait(run_id):
        while True:
            r = w.jobs.get_run(run_id)
            if r.state.result_state:
                if r.state.result_state.value != 'SUCCESS':
                    raise RuntimeError(f'Run {run_id}: {r.state.as_dict()}')
                return
            print(f'waiting {run_id}: {r.state.life_cycle_state.value}', flush=True)
            time.sleep(30)

    save()
    for case in a.cases:
        result = state['results'].setdefault(case, {})
        if result.get('verified'):
            continue
        result.setdefault('revision', state['revision'])
        result.setdefault('remote', state['remote'])
        # Both phases use this case's snapshot, even if another chat moves HEAD.
        gpu_run.snapshot = lambda _: (result['revision'], result['remote'])
        if not result.get('smoke') and not result.get('full'):
            existing = {x.path.rstrip('/').split('/')[-1] for x in
                        w.files.list_directory_contents('/Volumes/workspace/default/surgf/features')}
            if case in existing:
                result['verified'] = verify(case, a.samples)
                save()
                continue
            for run in w.jobs.list_runs(active_only=True):
                if f'-{case}-' in (run.run_name or ''):
                    raise RuntimeError(f'{case} already has active run {run.run_id}; review before submitting')
        save()
        for phase in ['smoke', 'full']:
            if phase not in result:
                result[phase] = gpu_run.start(case, phase == 'full', 30, True, result.get('smoke'))
                save()
            wait(result[phase])
        result['verified'] = verify(case, a.samples)
        save()
        print(f'{case} verified: {result["verified"]["shape"]}', flush=True)
    print('All assigned cases verified', flush=True)


if __name__ == '__main__':
    main()
