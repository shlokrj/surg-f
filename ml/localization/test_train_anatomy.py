import hashlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image
from train_anatomy import CATEGORIES, ready_data


class ReadinessTests(unittest.TestCase):
    def test_verified_data_and_surgery_separation(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest = {'split_sha256': 'split', 'files': {}, 'partitions': {}}
            for partition, surgery in (('train', 1), ('val', 121)):
                directory = root / partition
                directory.mkdir()
                name = f'{surgery}_1.png'
                buffer = io.BytesIO()
                Image.new('RGB', (8, 6)).save(buffer, format='PNG')
                content = buffer.getvalue()
                (directory / name).write_bytes(content)
                manifest['files'][f'{partition}/{name}'] = hashlib.sha256(content).hexdigest()
                annotations = dict(images=[dict(id=surgery, video_id=surgery, file_name=name,
                                               width=8, height=6, is_det_keyframe=True)],
                                   annotations=[dict(id=surgery, image_id=surgery, category_id=1,
                                                     bbox=[1, 1, 2, 2])], categories=CATEGORIES)
                (directory / 'annotations.json').write_text(json.dumps(annotations))
                manifest['partitions'][partition] = dict(annotation_sha256=partition,
                    prepared_sha256=hashlib.sha256(json.dumps(annotations, sort_keys=True).encode()).hexdigest())
            (root / 'manifest.json').write_text(json.dumps(manifest))
            subsets, signature = ready_data(root)
            self.assertEqual(len(subsets['train']['images']), 1)
            self.assertEqual(len(signature), 64)
            (root / 'val' / '121_1.png').write_bytes(b'changed')
            with self.assertRaises(ValueError):
                ready_data(root)


if __name__ == '__main__':
    unittest.main()
