import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
from train_tools import binary_report, reference_reports, fit_baseline


class ModelReportingTests(unittest.TestCase):
    def test_hand_calculated_confusion_counts(self):
        report = binary_report([1, 1, 0, 0], [0.9, 0.2, 0.7, 0.1])
        self.assertEqual([report[k] for k in ['tp', 'fp', 'fn', 'tn']], [1, 1, 1, 1])
        self.assertEqual(report['f1'], 0.5)
        self.assertAlmostEqual(report['average_precision'], 5/6)

    def test_prevalence_uses_training_only(self):
        result = reference_reports(np.array([0, 0, 0, 1]), np.ones(5))
        self.assertEqual(result['training_prevalence'], 0.25)
        self.assertEqual(result['constant_training_prevalence']['fn'], 5)
        self.assertIsNone(result['constant_training_prevalence']['average_precision'])
        result = reference_reports(np.array([1, 1, 1, 0]), np.zeros(5))
        self.assertEqual(result['constant_training_prevalence']['fp'], 5)
        self.assertEqual(result['always_absent']['tn'], 5)

    def test_invalid_and_single_class_inputs(self):
        self.assertEqual(binary_report([0, 0], [0, 0])['f1'], 0)
        for labels, probabilities in [([], []), ([1], [float('nan')]), ([2], [0.5]), ([1], [1.1]), ([1], [0, 1])]:
            with self.subTest(labels=labels), self.assertRaises(ValueError):
                binary_report(labels, probabilities)

    def test_real_fit_keeps_surgeries_separate_and_writes_report(self):
        x = np.arange(16, dtype=float).reshape(8, 2)
        labels = np.zeros((8, 6), dtype=int)
        labels[4:, 0] = 1
        meta = {'checkpoint_sha256': 'same', 'samples_sha256': 'same', 'preprocessing': {}}
        with tempfile.TemporaryDirectory() as tmp, patch('train_tools.load_cases', side_effect=[
            (x, labels, {'VID01': dict(meta, annotated_frames=8)}),
            (x, labels, {'VID04': dict(meta, annotated_frames=4), 'VID05': dict(meta, annotated_frames=4)})]):
            output = Path(tmp) / 'model'
            report = fit_baseline('/unused', ['VID01'], ['VID04', 'VID05'], output)
            for case, positives in [('VID04', 0), ('VID05', 4)]:
                tool = report['case_metrics'][case]['bipolar']
                self.assertEqual(tool['model']['positive_frames'], positives)
                self.assertEqual(tool['model']['frames'], 4)
                self.assertIsNone(tool['model']['average_precision'])
                self.assertIsNone(report['case_metrics'][case]['scissors']['model'])
            self.assertEqual(report['baselines']['bipolar']['training_prevalence'], 0.5)
            text = (output / 'comparison.md').read_text()
            self.assertIn('VID04', text)
            self.assertIn('VID05', text)
            self.assertIn('not trained', text)


if __name__ == '__main__':
    unittest.main()
