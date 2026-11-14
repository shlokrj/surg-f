import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import joblib
import numpy as np

from export_predictions import predict_clips


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

    def test_training_case_rejected(self):
        with patch('export_predictions.validate_bundle', return_value={'case_id': 'VID01'}):
            with self.assertRaisesRegex(ValueError, 'training'):
                predict_clips(self.model, self.bundle)


if __name__ == '__main__':
    unittest.main()
