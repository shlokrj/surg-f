import unittest

from analyze_anatomy_errors import analyze, match_image


def source():
    return dict(images=[dict(id=1, width=100, height=100, video_id=121), dict(id=2, width=100, height=100, video_id=122)],
                categories=[dict(id=1, name='cystic duct'), dict(id=2, name='gallbladder')],
                annotations=[dict(id=1, image_id=1, category_id=2, bbox=[10, 10, 50, 50]),
                             dict(id=2, image_id=1, category_id=1, bbox=[70, 70, 5, 5])])


class ErrorAnalysisTests(unittest.TestCase):
    def test_error_types(self):
        refs = [(2, [10, 10, 60, 60])]
        kinds, matched = match_image(refs, [(2, [10, 10, 60, 60], .9), (2, [11, 11, 60, 60], .8),
                                            (2, [10, 10, 40, 40], .7), (1, [10, 10, 60, 60], .6),
                                            (2, [80, 80, 90, 90], .5)], .5)
        self.assertEqual(kinds, ['tp', 'duplicate', 'localization', 'class_confusion', 'background'])
        self.assertEqual(matched, {0})

    def test_selection_sizes_and_negatives(self):
        predictions = [dict(image_id=1, boxes=[[10, 10, 60, 60], [0, 0, 5, 5]], labels=[2, 1], scores=[.9, .2]),
                       dict(image_id=2, boxes=[[0, 0, 50, 50]], labels=[2], scores=[.1])]
        result = analyze(source(), predictions)
        gallbladder = result['selected_by_validation_f1']['gallbladder']
        self.assertEqual((gallbladder['tp'], gallbladder['fp'], gallbladder['fn']), (1, 0, 0))
        self.assertGreater(gallbladder['score_threshold'], .1)
        duct = result['selected_by_validation_f1']['cystic duct']
        self.assertEqual(duct['missed_by_size']['small'], dict(missed=1, support=1, miss_rate=1.0))
        self.assertEqual(duct['f1'], 0.0)
        self.assertEqual(result['anatomy_negative_images'], 1)
        self.assertEqual(result['negative_images_with_detection_at_selected_threshold']['gallbladder'], 0)

    def test_rejects_unknown_image(self):
        with self.assertRaises(ValueError):
            analyze(source(), [dict(image_id=9, boxes=[], labels=[], scores=[])])


if __name__ == '__main__':
    unittest.main()
