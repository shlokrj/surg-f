"""Automate everything around the human review of a VID01 pack with a local Label Studio.

  python ml/localization/review_session.py start  PACK_DIR            # server + project + frames; prints URL/login
  python ml/localization/review_session.py status PACK_DIR            # submitted frames so far
  python ml/localization/review_session.py finish PACK_DIR --reviewer "Name" \
      --predictions v2=PACK_DIR/predictions.json --predictions v3=OTHER/predictions.json
  python ml/localization/review_session.py stop   PACK_DIR

Only drawing boxes and pressing Submit is left to the reviewer. Everything stays on this
machine: the server listens on 127.0.0.1, its data lives in PACK_DIR/label-studio/, and the
generated login and API token are written to PACK_DIR/label-studio/session.json (mode 600).
`finish` exports COCO through the API, converts it with import_review_labels.py, scores each
predictions file with evaluate_anatomy_coco.py on identical frames, and writes
PACK_DIR/review-results.json. Requires a separate environment with label-studio installed
(--label-studio points at its executable).
"""
import argparse
import io
import json
import os
from pathlib import Path
import secrets
import signal
import subprocess
import time
import urllib.error
import urllib.request
import uuid
import zipfile

from import_review_labels import frame_key

LABEL_CONFIG = """<View>
  <Image name="image" value="$image" zoom="true"/>
  <RectangleLabels name="label" toName="image">
    <Label value="Cystic duct" background="#22d3ee"/>
    <Label value="Gallbladder" background="#facc15"/>
  </RectangleLabels>
</View>"""
INSTRUCTIONS = ('Box every visible cystic duct and gallbladder, tightly around the visible part. If neither is '
                'visible, draw nothing. Always press Submit, including on empty frames.')
ENABLE_TOKENS = ['from jwt_auth.models import JWTSettings', 'from organizations.models import Organization',
                 'o = Organization.objects.first()', 's, _ = JWTSettings.objects.get_or_create(organization=o)',
                 's.legacy_api_tokens_enabled = True', 's.save()']


class Api:
    def __init__(self, session):
        self.base, self.token = f"http://127.0.0.1:{session['port']}", session['token']

    def call(self, method, path, body=None, raw=False, content_type='application/json'):
        data = json.dumps(body).encode() if body is not None and content_type == 'application/json' else body
        request = urllib.request.Request(self.base + path, data=data, method=method,
                                         headers={'Authorization': f'Token {self.token}', 'Content-Type': content_type})
        with urllib.request.urlopen(request, timeout=120) as response:
            payload = response.read()
        return payload if raw else (json.loads(payload) if payload else None)

    def tasks(self, project):
        rows, page = [], 1
        while True:
            try:
                batch = self.call('GET', f'/api/tasks?project={project}&page={page}&page_size=100&fields=all')
            except urllib.error.HTTPError as error:
                if error.code == 404:  # past the last page
                    return rows
                raise
            batch = batch.get('tasks', batch) if isinstance(batch, dict) else batch
            rows += batch
            if len(batch) < 100:
                return rows
            page += 1

    def upload(self, project, paths):
        boundary = uuid.uuid4().hex
        body = io.BytesIO()
        for index, path in enumerate(paths):  # one form field per file; repeated names keep only one file
            body.write(f'--{boundary}\r\nContent-Disposition: form-data; name="file{index}"; filename="{path.name}"\r\n'
                       f'Content-Type: image/png\r\n\r\n'.encode())
            body.write(path.read_bytes()); body.write(b'\r\n')
        body.write(f'--{boundary}--\r\n'.encode())
        return self.call('POST', f'/api/projects/{project}/import', body.getvalue(),
                         content_type=f'multipart/form-data; boundary={boundary}')


def session_path(pack):
    return Path(pack) / 'label-studio' / 'session.json'


def load_session(pack):
    path = session_path(pack)
    if not path.exists():
        raise SystemExit(f'no review session in {pack}; run start first')
    return json.loads(path.read_text())


def healthy(port):
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=3) as response:
            return response.status == 200
    except (urllib.error.URLError, OSError):
        return False


def start(pack, executable, port):
    pack = Path(pack).expanduser()
    if not (pack / 'frames').is_dir() or not (pack / 'reference.json').exists():
        raise SystemExit(f'{pack} is not a review pack (run prepare_video_review.py)')
    root = pack / 'label-studio'
    root.mkdir(exist_ok=True)
    path = session_path(pack)
    if path.exists():
        session = json.loads(path.read_text())
    else:
        session = dict(port=port, username='reviewer@localhost', password=secrets.token_urlsafe(12),
                       token=secrets.token_hex(20), project=None)
    common = ['--data-dir', str(root / 'data'), '--username', session['username'], '--password', session['password'],
              '--user-token', session['token']]
    if not healthy(session['port']):
        log = (root / 'server.log').open('a')
        process = subprocess.Popen([executable, 'start', '--no-browser', '--port', str(session['port']),
                                    '--internal-host', '127.0.0.1', *common],
                                   stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        session['pid'] = process.pid
        for _ in range(90):
            if healthy(session['port']):
                break
            if process.poll() is not None:
                raise SystemExit(f'Label Studio exited; see {root / "server.log"}')
            time.sleep(2)
        else:
            raise SystemExit('Label Studio did not become healthy in time')
    path.write_text(json.dumps(session, indent=1)); os.chmod(path, 0o600)
    subprocess.run([executable, 'shell', *common], input='\n'.join(ENABLE_TOKENS) + '\n', text=True,
                   capture_output=True, check=True)  # local org only: allow the generated API token
    api = Api(session)
    frames = sorted((pack / 'frames').glob('*.png'))
    if session.get('project') is None:
        project = api.call('POST', '/api/projects', dict(title=f'{pack.name} review', label_config=LABEL_CONFIG,
                                                         expert_instruction=INSTRUCTIONS, show_instruction=True))
        session['project'] = project['id']
        path.write_text(json.dumps(session, indent=1))
    present = {frame_key(task['data']['image']) for task in api.tasks(session['project'])}
    missing = [frame for frame in frames if frame.name not in present]
    for index in range(0, len(missing), 20):
        api.upload(session['project'], missing[index:index + 20])
    tasks = api.call('GET', f"/api/projects/{session['project']}")['task_number']
    if tasks != len(frames):
        raise SystemExit(f'project has {tasks} tasks but the pack has {len(frames)} frames')
    print(json.dumps(dict(url=f"http://127.0.0.1:{session['port']}/projects/{session['project']}/data",
                          login=session['username'], password=session['password'], frames=tasks,
                          session_file=str(path)), indent=1))


def status(pack):
    session = load_session(pack)
    project = Api(session).call('GET', f"/api/projects/{session['project']}")
    print(json.dumps(dict(submitted=project['num_tasks_with_annotations'], total=project['task_number'],
                          boxes=project['total_annotations_number']), indent=1))
    return project


def export_coco(session):
    payload = Api(session).call('GET', f"/api/projects/{session['project']}/export?exportType=COCO&download_resources=false",
                                raw=True)
    if payload[:2] == b'PK':
        with zipfile.ZipFile(io.BytesIO(payload)) as archive:
            name = next(n for n in archive.namelist() if n.endswith('.json'))
            payload = archive.read(name)
    return json.loads(payload)


def finish(pack, reviewer, predictions, allow_partial):
    from import_review_labels import convert
    from evaluate_anatomy_coco import evaluate
    pack = Path(pack).expanduser()
    session = load_session(pack)
    export = export_coco(session)
    (pack / 'label-studio' / 'export-coco.json').write_text(json.dumps(export))
    reference = convert(json.loads((pack / 'reference.json').read_text()), export, reviewer, allow_partial)
    (pack / 'reference.reviewed.json').write_text(json.dumps(reference, indent=1) + '\n')
    reviewed = {i['id'] for i in reference['images'] if i['is_det_keyframe']}
    scored = dict(reference)
    scored['images'] = [i for i in reference['images'] if i['id'] in reviewed]
    scored['annotations'] = [a for a in reference['annotations'] if a['image_id'] in reviewed]
    results = {}
    for name, path in predictions.items():
        rows = [p for p in json.loads(Path(path).expanduser().read_text()) if p['image_id'] in reviewed]
        results[name] = evaluate(scored, rows)
    summary = dict(reviewer=reference['info']['reviewer'], status=reference['info']['status'],
                   reviewed_frames=len(reviewed), boxes=len(scored['annotations']),
                   boxes_by_class={n: sum(a['category_id'] == c for a in scored['annotations'])
                                   for c, n in ((1, 'cystic duct'), (2, 'gallbladder'))},
                   prefilled=json.loads((pack / 'manifest.json').read_text()).get('prefill_score') is not None,
                   models={name: dict(ap=m['ap'], ap50=m['ap50'],
                                      per_class={k: dict(ap50=v['ap50'], recall100=v['recall100'], support=v['support'])
                                                 for k, v in m['per_class'].items()})
                           for name, m in results.items()})
    (pack / 'review-results.json').write_text(json.dumps(summary, indent=1) + '\n')
    print(json.dumps(summary, indent=1))


def stop(pack):
    session = load_session(pack)
    if session.get('pid'):
        try:
            os.killpg(session['pid'], signal.SIGTERM)
        except ProcessLookupError:
            pass
    print('stopped' if not healthy(session['port']) or time.sleep(3) or not healthy(session['port']) else 'still running')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='action', required=True)
    begin = sub.add_parser('start'); begin.add_argument('pack'); begin.add_argument('--port', type=int, default=8080)
    begin.add_argument('--label-studio', default=str(Path('~/madhacks2026/label-studio-env/bin/label-studio').expanduser()))
    sub.add_parser('status').add_argument('pack')
    end = sub.add_parser('finish'); end.add_argument('pack'); end.add_argument('--reviewer', required=True)
    end.add_argument('--predictions', action='append', default=[], help='NAME=PATH, repeatable')
    end.add_argument('--allow-partial', action='store_true')
    sub.add_parser('stop').add_argument('pack')
    a = parser.parse_args()
    if a.action == 'start':
        start(a.pack, a.label_studio, a.port)
    elif a.action == 'status':
        status(a.pack)
    elif a.action == 'finish':
        predictions = dict(item.split('=', 1) for item in a.predictions) or {'model': str(Path(a.pack) / 'predictions.json')}
        finish(a.pack, a.reviewer, predictions, a.allow_partial)
    else:
        stop(a.pack)


if __name__ == '__main__':
    main()
