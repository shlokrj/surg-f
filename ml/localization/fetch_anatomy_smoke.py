"""Fetch two labeled images per official partition for a bounded pipeline smoke test."""
import hashlib
import io
import json
from pathlib import Path
import argparse
from remotezip import RemoteZip
from PIL import Image
from prepare_anatomy import prepare

URL = 'https://s3.unistra.fr/camma_public/datasets/endoscapes/endoscapes.zip'
if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir',required=True)
    parser.add_argument('--split',default='ml/case_split.json')
    args=parser.parse_args()
    root=Path(args.output_dir);root.mkdir(parents=True,exist_ok=False)
    split=json.loads(Path(args.split).read_text())
    manifest={'source':URL,'purpose':'four-image smoke only; not an accuracy benchmark','files':{}}
    with RemoteZip(URL,timeout=60) as archive:
        for partition in ('train','val'):
            raw=archive.read(f'endoscapes/{partition}/annotation_coco.json')
            data, report=prepare(json.loads(raw),split,partition)
            positives={a['image_id'] for a in data['annotations']}
            selected=[]; cases=set()
            for image in sorted(data['images'],key=lambda i:(i['video_id'],i['id'])):
                if image['id'] in positives and image['video_id'] not in cases:
                    selected.append(image);cases.add(image['video_id'])
                if len(selected)==2:break
            ids={i['id'] for i in selected}
            data['images']=selected;data['annotations']=[a for a in data['annotations'] if a['image_id'] in ids]
            directory=root/partition;directory.mkdir()
            for image in selected:
                name=image['file_name']
                if Path(name).name != name:raise ValueError('unsafe image filename')
                content=archive.read(f'endoscapes/{partition}/{name}')
                with Image.open(io.BytesIO(content)) as decoded:
                    if decoded.size != (image['width'],image['height']):raise ValueError('dimension mismatch')
                    decoded.verify()
                (directory/name).write_bytes(content)
                manifest['files'][f'{partition}/{name}']=hashlib.sha256(content).hexdigest()
            (directory/'annotations.json').write_text(json.dumps(data))
            report.update(source_sha256=hashlib.sha256(raw).hexdigest(),smoke_cases=sorted(cases))
            manifest[partition]=report
    (root/'manifest.json').write_text(json.dumps(manifest,indent=2))
    print(root,flush=True)
