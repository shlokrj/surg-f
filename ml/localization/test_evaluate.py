import copy
import unittest
from evaluate import evaluate, iou


def artifact(source, detections):
    return dict(schema_version=1, case_id='VID01', video_asset_id='test-v1', source=source,
                image_width=854, image_height=480, max_age_sec=.12,
                provenance=dict(reviewed_complete_frames=True),
                frames=[dict(frame_id=1, timestamp_sec=1, detections=detections)])


def box(identity='a', label='clipper'):
    return dict(instance_id=identity, category='instrument', label=label, score=.9, bbox_xyxy=[0, 0, .5, .5])


class EvaluationTests(unittest.TestCase):
    def test_exact_and_duplicate(self):
        result = evaluate(artifact('prediction', [box(), box('b')]), artifact('annotation', [box()]))
        self.assertEqual(result['micro'], dict(tp=1, fp=1, fn=0, precision=.5, recall=1))

    def test_wrong_label_and_missing_prediction(self):
        result = evaluate(artifact('prediction', [box(label='hook')]), artifact('annotation', [box()]))
        self.assertEqual((result['micro']['fp'], result['micro']['fn']), (1, 1))
        pred = artifact('prediction', [])
        pred['frames'] = []
        self.assertEqual(evaluate(pred, artifact('annotation', [box()]))['micro']['fn'], 1)

    def test_unreviewed_frames_ignored_and_empty_reviewed_is_negative(self):
        pred = artifact('prediction', [box()])
        extra = copy.deepcopy(pred['frames'][0]); extra.update(frame_id=2, timestamp_sec=2)
        pred['frames'].append(extra)
        result = evaluate(pred, artifact('annotation', []))
        self.assertEqual(result['ignored_prediction_frames'], 1)
        self.assertEqual(result['micro']['fp'], 1)
        self.assertIsNone(result['micro']['recall'])

    def test_guards_and_threshold(self):
        pred, truth = artifact('prediction', [box()]), artifact('annotation', [box()])
        self.assertEqual(evaluate(pred, truth, score_threshold=.95)['micro']['fn'], 1)
        for key, value in [('source', 'fixture'), ('video_asset_id', 'other'), ('provenance', {})]:
            bad = copy.deepcopy(truth); bad[key] = value
            with self.assertRaises(ValueError): evaluate(pred, bad)
        truth['frames'][0]['timestamp_sec'] = 1.1
        with self.assertRaises(ValueError): evaluate(pred, truth)
        self.assertAlmostEqual(iou([0,0,1,1], [0,0,.5,.5]), .25)
        self.assertEqual(iou([0,0,.2,.2], [.5,.5,1,1]), 0)
