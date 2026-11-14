import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import joblib
import numpy as np
from train_tools import fit_baseline, fit_selected, validate_split


class TrainingTests(unittest.TestCase):
    def test_overlapping_surgeries_rejected_before_loading(self):
        with self.assertRaisesRegex(ValueError, 'disjoint'):
            fit_baseline('/unused', ['VID01'], ['VID01'], '/unused-output')

    def test_train_only_scaling_and_unsupported_tools(self):
        train = np.array([[0., 1.], [1., 2.], [2., 3.], [3., 4.]])
        test = train + 1000
        labels = np.zeros((4, 6), dtype=np.int32)
        labels[:, 0] = [0, 0, 1, 1]
        meta = {'checkpoint_sha256': 'same', 'samples_sha256': 'same', 'preprocessing': {'same': True}}
        with tempfile.TemporaryDirectory() as tmp, patch('train_tools.load_cases', side_effect=[
                (train, labels, {'VID01': meta}), (test, labels, {'VID02': meta})]):
            output = Path(tmp) / 'model'
            result = fit_baseline('/unused', ['VID01'], ['VID02'], output)
            self.assertEqual(result['tools']['clipper']['status'], 'not_trained')
            model = joblib.load(output / 'tool_classifiers.joblib')['models']['bipolar']
            np.testing.assert_array_equal(model[0].mean_, train.mean(axis=0))
            self.assertEqual(result['threshold'], 0.5)
            self.assertEqual(result['train_cases'], ['VID01'])
            self.assertEqual(result['test_cases'], ['VID02'])

    def test_selection_never_uses_test_to_choose_weight(self):
        split = {'train': ['VID01'], 'validation': ['VID04'], 'test': ['VID05'],
                 'diagnostic': ['VID02']}
        reports = [{'tools': {'bipolar': {'f1': 0.2}}},
                   {'tools': {'bipolar': {'f1': 0.8}}}, {'tools': {}}]
        with tempfile.TemporaryDirectory() as tmp, patch('train_tools.fit_baseline', side_effect=reports) as fit:
            result = fit_selected('/unused', split, tmp)
            self.assertEqual(result['selected_weighting'], 'unweighted')
            self.assertEqual([c.args[2] for c in fit.call_args_list],
                             [['VID04'], ['VID04'], ['VID05']])
            self.assertIsNone(fit.call_args_list[-1].kwargs['class_weight'])

    def test_split_rejects_empty_duplicate_and_diagnostic_overlap(self):
        for split in [dict(train=[], validation=['VID04'], test=['VID05']),
                      dict(train=['VID01', 'VID01'], validation=['VID04'], test=['VID05']),
                      dict(train=['VID01'], validation=['VID04'], test=['VID05'], diagnostic=['VID05'])]:
            with self.assertRaises(ValueError):
                validate_split(split)

    def test_cross_split_provenance_rejected(self):
        meta = {'checkpoint_sha256': 'one', 'samples_sha256': 'same', 'preprocessing': {}}
        other = dict(meta, checkpoint_sha256='two')
        with tempfile.TemporaryDirectory() as tmp, patch('train_tools.load_cases', side_effect=[
                (np.ones((4, 2)), np.zeros((4, 6)), {'VID01': meta}),
                (np.ones((4, 2)), np.zeros((4, 6)), {'VID02': other})]):
            with self.assertRaisesRegex(ValueError, 'provenance'):
                fit_baseline('/unused', ['VID01'], ['VID02'], Path(tmp)/'model')


if __name__ == '__main__':
    unittest.main()
