import unittest

from import_review_labels import convert

try:
    import pycocotools
except ImportError:
    pycocotools = None


def pack():
    return dict(images=[dict(id=750, file_name='000750.png', width=854, height=480, is_det_keyframe=False),
                        dict(id=900, file_name='000900.png', width=854, height=480, is_det_keyframe=False)],
                annotations=[], categories=[], info=dict(status='unreviewed'))


def export(include_second=True):
    images = [dict(id=0, file_name='images/1/abcd1234-000750.png', width=854, height=480)]
    if include_second:
        images.append(dict(id=1, file_name='images/1/ffff0000-000900.png', width=854, height=480))
    return dict(images=images, categories=[dict(id=0, name='Gallbladder'), dict(id=1, name='Cystic duct')],
                annotations=[dict(id=0, image_id=0, category_id=0, bbox=[10, 20, 100, 50]),
                             dict(id=1, image_id=0, category_id=1, bbox=[-0.5, 400, 30, 80.5])])


class ImportTests(unittest.TestCase):
    def test_maps_names_ids_and_marks_submitted_frames(self):
        result = convert(pack(), export(), 'Tester')
        self.assertTrue(all(i['is_det_keyframe'] for i in result['images']))
        self.assertEqual([(a['image_id'], a['category_id']) for a in result['annotations']], [(750, 2), (750, 1)])
        self.assertEqual(result['annotations'][1]['bbox'], [0.0, 400, 29.5, 80])  # clipped to the frame
        self.assertEqual(result['info']['reviewer'], 'Tester')

    def test_requires_all_frames_unless_partial(self):
        with self.assertRaises(ValueError):
            convert(pack(), export(include_second=False), 'Tester')
        result = convert(pack(), export(include_second=False), 'Tester', allow_partial=True)
        self.assertEqual([i['is_det_keyframe'] for i in result['images']], [True, False])
        self.assertEqual(result['info']['status'], 'partially reviewed')

    def test_rejects_unknown_labels_and_foreign_frames(self):
        bad = export(); bad['categories'][0]['name'] = 'liver'
        with self.assertRaises(ValueError):
            convert(pack(), bad, 'Tester')
        bad = export(); bad['images'][1]['file_name'] = 'x-001234.png'
        with self.assertRaises(ValueError):
            convert(pack(), bad, 'Tester')

    @unittest.skipUnless(pycocotools, 'install localization evaluation requirements')
    def test_output_is_accepted_by_the_evaluator(self):
        from evaluate_anatomy_coco import evaluate
        reference = convert(pack(), export(), 'Tester')
        metrics = evaluate(reference, [dict(image_id=750, boxes=[[10, 20, 110, 70]], labels=[2], scores=[.9]),
                                       dict(image_id=900, boxes=[], labels=[], scores=[])])
        self.assertAlmostEqual(metrics['per_class']['gallbladder']['ap'], 1.0)


if __name__ == '__main__':
    unittest.main()
