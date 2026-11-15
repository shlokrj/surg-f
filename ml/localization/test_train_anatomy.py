import hashlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image
from train_anatomy import CATEGORIES, build_model, flip_horizontal, ready_data, skip_nonfinite


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


class NonfiniteLossTests(unittest.TestCase):
    def test_only_all_negative_batches_are_skipped(self):
        empty, boxed = dict(boxes=[]), dict(boxes=[[1, 1, 2, 2]])
        self.assertFalse(skip_nonfinite(True, [empty, empty]))
        self.assertTrue(skip_nonfinite(False, [empty, empty]))
        with self.assertRaises(ValueError):
            skip_nonfinite(False, [empty, boxed])


class ModelAndAugmentationTests(unittest.TestCase):
    def test_horizontal_flip_mirrors_boxes(self):
        import torch
        pixels = torch.arange(12, dtype=torch.float32).reshape(1, 2, 6)
        flipped, boxes = flip_horizontal(pixels, torch.tensor([[1., 0., 3., 2.]]), 6)
        self.assertEqual(flipped[0, 0].tolist(), [5., 4., 3., 2., 1., 0.])
        self.assertEqual(boxes.tolist(), [[3., 0., 5., 2.]])
        _, empty = flip_horizontal(pixels, torch.zeros((0, 4)), 6)
        self.assertEqual(tuple(empty.shape), (0, 4))

    def test_architectures_build_three_class_heads(self):
        for name in ('mobilenet_v3_320', 'mobilenet_v3_hires'):
            model, weights = build_model(name, pretrained=False)
            self.assertIsNone(weights)
            self.assertEqual(model.roi_heads.box_predictor.cls_score.out_features, 3)
        self.assertEqual(build_model('mobilenet_v3_hires', pretrained=False)[0].transform.min_size, (480,))
        with self.assertRaises(ValueError):
            build_model('resnet9000', pretrained=False)


if __name__ == '__main__':
    unittest.main()
