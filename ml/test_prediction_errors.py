import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import numpy as np
from review_prediction_errors import error_rows, review


class PredictionReviewTests(unittest.TestCase):
    def test_threshold_unknown_and_timestamps(self):
        rows, totals = error_rows('VID15', [10, 11, 12, 13], [[], ['clipper'], None, ['clipper']],
                                 {'clipper': [0.5, 0.49, 1., 0.5]}, 0.5, 'run', 'validation')
        self.assertEqual({r['error_type']: r['second'] for r in rows}, {'false_positive': 10, 'false_negative': 11})
        self.assertEqual(totals['clipper'], {'false_positive': 1, 'false_negative': 1})
        self.assertTrue(all(row['second'] == row['frame_id'] for row in rows))

    def test_bounded_repeatable_and_no_duplicates(self):
        args = ('VID15', list(range(100)), [[]]*100, {'clipper': np.ones(100)}, 0.5, 'run', 'validation')
        first = error_rows(*args, limit=3)
        self.assertEqual(first, error_rows(*args, limit=3))
        self.assertEqual([r['frame_id'] for r in first[0]], [0, 49, 99])
        self.assertEqual(first[1]['clipper']['false_positive'], 100)

    def test_invalid_and_empty(self):
        self.assertEqual(error_rows('VID15', [], [], {}, 0.5, 'run', 'validation'), ([], {}))
        for values in [[float('nan')], [1.1], [0.2, 0.3]]:
            with self.assertRaises(ValueError):
                error_rows('VID15', [0], [[]], {'clipper': values}, 0.5, 'run', 'validation')
        with self.assertRaises(ValueError):
            error_rows('VID15', [0, 0], [[], []], {}, 0.5, 'run', 'validation')

    def test_review_writes_csv_sidecar_and_refuses_overwrite(self):
        from unittest.mock import Mock
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)
            metadata = {'case_id': 'VID15', 'checkpoint_sha256': 'a', 'samples_sha256': 'b',
                        'preprocessing': {}, 'file_sha256': {'features.npy': 'hash'}}
            report = dict(metadata, train_cases=['VID01'], threshold=0.5, mlflow_run_id='run')
            (path/'metrics.json').write_text(json.dumps(report))
            (path/'annotations.json').write_text(json.dumps([
                {'frame_id': 0, 'instruments': []}, {'frame_id': 1, 'instruments': None}]))
            np.save(path/'features.npy', np.ones((2, 768)))
            model = Mock(classes_=[0, 1])
            model.predict_proba.return_value = np.array([[0.1, 0.9], [0.1, 0.9]])
            with patch('review_prediction_errors.validate_bundle', return_value=metadata), patch(
                'review_prediction_errors.joblib.load', return_value={'threshold': 0.5, 'models': {'clipper': model}}):
                result = review(path, path, {'validation': ['VID15']}, path/'review.csv')
                self.assertEqual(result['rows'], 1)
                self.assertEqual(result['unknown_frames'], 1)
                self.assertFalse(result['visually_reviewed'])
                self.assertTrue((path/'review.json').exists())
                self.assertIn('false_positive', (path/'review.csv').read_text())
                with self.assertRaises(FileExistsError):
                    review(path, path, {'validation': ['VID15']}, path/'review.csv')
                report['checkpoint_sha256'] = 'wrong'
                (path/'metrics.json').write_text(json.dumps(report))
                with self.assertRaisesRegex(ValueError, 'provenance'):
                    review(path, path, {'validation': ['VID15']}, path/'other.csv')

    def test_protected_partitions_rejected_before_model_loading(self):
        split = {'train': ['VID01'], 'validation': ['VID15'], 'test': ['VID27'], 'diagnostic': ['VID02']}
        for case in ['VID01', 'VID27', 'VID02']:
            with tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp)
                (path/'metrics.json').write_text(json.dumps({'train_cases': ['VID01']}))
                with patch('review_prediction_errors.validate_bundle', return_value={'case_id': case}), patch('review_prediction_errors.joblib.load') as load:
                    with self.assertRaises(ValueError):
                        review(path, path, split, path/'review.csv')
                    load.assert_not_called()


if __name__ == '__main__':
    unittest.main()
