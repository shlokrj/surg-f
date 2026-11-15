import unittest

from prepare_video_review import sample_seconds
from train_anatomy import CATEGORIES

try:
    import pycocotools
except ImportError:
    pycocotools = None


class ReviewSamplingTests(unittest.TestCase):
    def test_half_targeted_half_spread_and_deterministic(self):
        intervals = [(100, 110), (500, 520)]
        picks = sample_seconds(intervals, 1000, 20, seed=3)
        self.assertEqual(picks, sample_seconds(intervals, 1000, 20, seed=3))
        self.assertEqual(picks, sorted(set(picks)))
        inside = [t for t in picks if any(a <= t < b for a, b in intervals)]
        self.assertGreaterEqual(len(inside), 10)
        self.assertTrue(all(0 <= t < 1000 for t in picks))
        spread = [t for t in picks if t not in inside]
        self.assertGreater(max(spread) - min(spread), 500)

    def test_no_intervals_samples_whole_video(self):
        picks = sample_seconds([], 100, 6, seed=1)
        self.assertEqual(len(picks), 3)
        self.assertTrue(all(0 <= t < 100 for t in picks))

    @unittest.skipUnless(pycocotools, 'install localization evaluation requirements')
    def test_unreviewed_reference_is_refused(self):
        from evaluate_anatomy_coco import evaluate
        reference = dict(images=[dict(id=1, file_name='000001.png', width=10, height=10, is_det_keyframe=False)],
                         annotations=[], categories=CATEGORIES)
        with self.assertRaises(ValueError):
            evaluate(reference, [dict(image_id=1, boxes=[], labels=[], scores=[])])


if __name__ == '__main__':
    unittest.main()
