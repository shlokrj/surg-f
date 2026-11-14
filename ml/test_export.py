import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import joblib
import numpy as np

from export_predictions import predict_clips, smooth


class Threshold:
    """Stand-in classifier: probability = first feature."""
    def predict_proba(self, x):
        return np.stack([1 - x[:, 0], x[:, 0]], axis=1)


class ExportTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.model, self.bundle = root / 'model', root / 'VID02'
        self.model.mkdir()
        self.bundle.mkdir()
        joblib.dump({'models': {'hook': Threshold()}, 'threshold': 0.5, 'tools': ['hook']},
                    self.model / 'tool_classifiers.joblib')
        (self.model / 'metrics.json').write_text(json.dumps({'train_cases': ['VID01']}))
        p = np.zeros((25, 1))
        p[[10, 11, 12, 20], 0] = 0.9  # positives at seconds 10-12 and 20
        np.save(self.bundle / 'features.npy', p)
        (self.bundle / 'manifest.csv').write_text('case_id,frame_id\n' + ''.join(f'VID02,{i}\n' for i in range(25)))

    def tearDown(self):
        self.tmp.cleanup()

    def test_consecutive_positives_become_clips(self):
        with patch('export_predictions.validate_bundle', return_value={'case_id': 'VID02'}):
            self.assertEqual(predict_clips(self.model, self.bundle),
                             [('VID02', 10, 13, 'hook', 'prediction'), ('VID02', 20, 21, 'hook', 'prediction')])

    def test_smoothing_in_export(self):
        # 10-13 and 20-21 are 7 s apart: max_gap 7 joins them; min_len 2 alone drops the 1 s blip at 20.
        with patch('export_predictions.validate_bundle', return_value={'case_id': 'VID02'}):
            self.assertEqual(predict_clips(self.model, self.bundle, max_gap=7),
                             [('VID02', 10, 21, 'hook', 'prediction')])
            self.assertEqual(predict_clips(self.model, self.bundle, min_len=2),
                             [('VID02', 10, 13, 'hook', 'prediction')])

    def test_smooth(self):
        flicker = [(0, 1), (2, 3), (4, 6), (10, 11)]
        self.assertEqual(smooth(flicker), flicker)  # defaults change nothing
        self.assertEqual(smooth(flicker, max_gap=1), [(0, 6), (10, 11)])  # 1 s gaps filled, 4 s gap kept
        self.assertEqual(smooth(flicker, max_gap=1, min_len=2), [(0, 6)])  # merge first, then drop the blip
        self.assertEqual(smooth(flicker, min_len=2), [(4, 6)])
        self.assertEqual(smooth([], 3, 3), [])
        for bad in [(-1, 1), (0, 0)]:
            with self.assertRaises(ValueError):
                smooth(flicker, *bad)

    def test_training_case_rejected(self):
        with patch('export_predictions.validate_bundle', return_value={'case_id': 'VID01'}):
            with self.assertRaisesRegex(ValueError, 'training'):
                predict_clips(self.model, self.bundle)


if __name__ == '__main__':
    unittest.main()
