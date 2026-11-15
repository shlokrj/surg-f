import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image
from fetch_anatomy_data import fetch


class Archive:
    def __init__(self, image):
        self.image = image
        self.reads = []

    def read(self, name):
        self.reads.append(name)
        if name.endswith('annotation_coco.json'):
            return b'{}'
        return self.image


class FetchTests(unittest.TestCase):
    def test_resume_and_corruption_guard(self):
        buffer = io.BytesIO()
        Image.new('RGB', (8, 6)).save(buffer, format='PNG')
        archive = Archive(buffer.getvalue())
        annotations = {'images': [{'id': 1, 'video_id': 1, 'file_name': '1_1.png', 'width': 8, 'height': 6}],
                       'annotations': [], 'categories': []}
        with tempfile.TemporaryDirectory() as temporary, patch('fetch_anatomy_data.prepare', return_value=(annotations, {'images': 1})):
            root = Path(temporary)
            first = fetch(archive, root, b'{}', ('train',))
            self.assertEqual(first['partitions']['train']['downloaded_images'], 1)
            self.assertEqual(len([name for name in archive.reads if name.endswith('1_1.png')]), 1)
            fetch(archive, root, b'{}', ('train',))
            self.assertEqual(len([name for name in archive.reads if name.endswith('1_1.png')]), 1)
            with self.assertRaises(ValueError):
                fetch(archive, root, b'{"other": 1}', ('train',))
            (root / 'train' / '1_1.png').write_bytes(b'corrupt')
            with self.assertRaises(Exception):
                fetch(archive, root, b'{}', ('train',))

    def test_rejects_mismatched_decoded_dimensions(self):
        buffer = io.BytesIO()
        Image.new('RGB', (8, 6)).save(buffer, format='PNG')
        archive = Archive(buffer.getvalue())
        annotations = {'images': [{'id': 1, 'video_id': 1, 'file_name': '1_1.png', 'width': 8, 'height': 7}],
                       'annotations': [], 'categories': []}
        with tempfile.TemporaryDirectory() as temporary, patch('fetch_anatomy_data.prepare', return_value=(annotations, {})):
            with self.assertRaises(ValueError):
                fetch(archive, temporary, b'{}', ('train',))
            self.assertFalse((Path(temporary) / 'train' / '1_1.png').exists())


if __name__ == '__main__':
    unittest.main()
