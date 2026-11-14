import json
import tempfile
import unittest
from pathlib import Path

from evaluate_clips import evaluate, evaluate_tool


def counts(result):
    return result['tp'], result['fp'], result['fn']


class ClipEvaluationTests(unittest.TestCase):
    def test_exact_match(self):
        r = evaluate_tool([(10, 20)], [(10, 20)])
        self.assertEqual(counts(r), (1, 0, 0))
        self.assertEqual(r['f1'], 1.0)

    def test_partial_overlap_respects_threshold(self):
        # IoU = 5 / 15 = 0.33
        self.assertEqual(counts(evaluate_tool([(15, 25)], [(10, 20)], iou=0.3)), (1, 0, 0))
        self.assertEqual(counts(evaluate_tool([(15, 25)], [(10, 20)], iou=0.5)), (0, 1, 1))

    def test_duplicates_match_once(self):
        r = evaluate_tool([(10, 20), (10, 20)], [(10, 20)])
        self.assertEqual(counts(r), (1, 1, 0))
        self.assertEqual(r['precision'], 0.5)

    def test_missing_prediction(self):
        r = evaluate_tool([], [(10, 20)])
        self.assertEqual(counts(r), (0, 0, 1))
        self.assertIsNone(r['precision'])
        self.assertEqual((r['recall'], r['f1']), (0.0, 0.0))

    def test_empty_inputs(self):
        r = evaluate_tool([], [])
        self.assertEqual(counts(r), (0, 0, 0))
        self.assertIsNone(r['f1'])
        self.assertEqual(counts(evaluate_tool([(1, 3)], [])), (0, 1, 0))

    def test_zero_length_interval_rejected(self):
        with self.assertRaises(ValueError):
            evaluate_tool([(5, 5)], [(1, 9)])

    def test_one_to_one_prefers_best_iou(self):
        # Prediction (10, 20) overlaps both truths; it must take the better one, freeing (18, 30) for nothing.
        r = evaluate_tool([(10, 20)], [(10, 19), (18, 30)])
        self.assertEqual(counts(r), (1, 0, 1))

    def test_fragmentation(self):
        r = evaluate_tool([(10, 14), (15, 18), (19, 20)], [(10, 20)], iou=0.3)
        self.assertEqual(counts(r), (1, 2, 0))
        self.assertEqual((r['fragmented_annotations'], r['extra_fragments']), (1, 2))

    def test_unknown_frames_excluded(self):
        unknown = frozenset(range(20, 30))
        # Prediction entirely in unknown span is dropped, not a false positive.
        self.assertEqual(counts(evaluate_tool([(22, 28)], [], unknown)), (0, 0, 0))
        # Spilling into the unknown span does not lower IoU.
        r = evaluate_tool([(10, 30)], [(10, 20)], unknown, iou=1.0)
        self.assertEqual(counts(r), (1, 0, 0))

    def test_end_to_end_from_bundle_and_csv(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            rows = [{'case_id': 'VID02', 'frame_id': i,
                     'instruments': None if i >= 8 else (['hook'] if 2 <= i < 6 else [])} for i in range(10)]
            (root / 'annotations.json').write_text(json.dumps(rows))
            (root / 'pred.csv').write_text('case_id,start_sec,end_sec,label,source\n'
                                           'VID02,2,6,hook,prediction\n'
                                           'VID02,0,1,grasper,prediction\n'
                                           'VID02,8,10,grasper,prediction\n'
                                           'VID01,2,6,hook,prediction\n'
                                           'VID02,0,2,hook,annotation\n')
            report = evaluate(root / 'pred.csv', root)
        self.assertEqual(report['unknown_frames'], 2)
        self.assertEqual(counts(report['tools']['hook']), (1, 0, 0))
        self.assertEqual(counts(report['tools']['grasper']), (0, 1, 0))


if __name__ == '__main__':
    unittest.main()
