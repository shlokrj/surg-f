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
        def fake_fit(*args, **kwargs):
            Path(args[3]).mkdir(parents=True)
            return reports.pop(0)
        with tempfile.TemporaryDirectory() as tmp, patch('train_tools.fit_baseline', side_effect=fake_fit) as fit:
            result = fit_selected('/unused', split, Path(tmp) / 'model')
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

    def test_validation_only_preserves_provenance_without_loading_test(self):
        split = {'train': ['VID01'], 'validation': ['VID04'], 'test': ['VID05']}
        calls = []
        def fake_fit(root, train, evaluation, output, **kwargs):
            calls.append(evaluation)
            Path(output).mkdir()
            (Path(output) / 'tool_classifiers.joblib').write_bytes(b'selected artifact')
            return {'tools': {'bipolar': {'f1': 0.5}},
                    'feature_bundle_hashes': {'VID04': {'features.npy': 'validation-hash'}}}
        with tempfile.TemporaryDirectory() as tmp, patch('train_tools.fit_baseline', side_effect=fake_fit):
            output = Path(tmp) / 'result'
            report = fit_selected('/unused', split, output, validation_only=True)
            self.assertEqual(calls, [['VID04'], ['VID04']])
            self.assertEqual(report['selected_weighting'], 'balanced')
            self.assertFalse(report['final_test_evaluated'])
            self.assertEqual(report['evaluation_partition'], 'validation')
            self.assertEqual(report['validation_provenance']['balanced']['feature_bundle_hashes']
                             ['VID04']['features.npy'], 'validation-hash')
            self.assertEqual((output / 'tool_classifiers.joblib').read_bytes(), b'selected artifact')
            with self.assertRaises(FileExistsError):
                fit_selected('/unused', split, output)

    def test_validation_only_real_fit_and_serialization(self):
        split = {'train': ['VID01'], 'validation': ['VID04'], 'test': ['VID05']}
        x = np.arange(16, dtype=float).reshape(8, 2)
        y = np.tile(np.array([0, 0, 0, 0, 1, 1, 1, 1])[:, None], (1, 6))
        seen = []
        def load(root, cases):
            seen.extend(cases)
            self.assertNotIn('VID05', cases)
            return x, y, {cases[0]: {'checkpoint_sha256': 'a', 'samples_sha256': 'b',
                                    'preprocessing': {}, 'file_sha256': {'features.npy': 'hash'}}}
        with tempfile.TemporaryDirectory() as tmp, patch('train_tools.load_cases', side_effect=load):
            output = Path(tmp) / 'selected'
            report = fit_selected('/unused', split, output, validation_only=True)
            artifact = joblib.load(output / 'tool_classifiers.joblib')
            self.assertEqual(len(artifact['models']), 6)
            self.assertEqual(report['test_cases'], ['VID04'])
            self.assertFalse(report['final_test_evaluated'])
            self.assertEqual(len(seen), 4)

    def test_invalid_split_types_and_inspected_case_rejected(self):
        base = {'train': ['VID01'], 'validation': ['VID04'], 'test': ['VID05']}
        for split in [[], dict(base, train='VID01'), dict(base, test=[None]),
                      dict(base, test=['VID02'])]:
            with self.subTest(split=split), self.assertRaises(ValueError):
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
