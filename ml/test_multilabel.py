import unittest

import numpy as np

from train_multilabel import evaluate, pick_thresholds, with_context


class MultilabelTests(unittest.TestCase):
    def test_context_is_clipped_window_mean(self):
        x = np.arange(5, dtype=np.float32)[:, None]  # rows 0..4
        out = with_context(x, 1)
        np.testing.assert_array_equal(out[:, 0], x[:, 0])
        np.testing.assert_allclose(out[:, 1], [0.5, 1, 2, 3, 3.5])  # ends average only existing rows
        self.assertIs(with_context(x, 0), x)

    def test_threshold_picked_per_label_on_validation(self):
        y = np.array([[1, 0], [1, 0], [0, 0], [0, 0]])
        prob = np.array([[0.2, 0.9], [0.3, 0.9], [0.1, 0.9], [0.05, 0.9]])
        t = pick_thresholds(y, prob)
        self.assertGreater(t[0], 0.1)  # rare label: low threshold separates 0.2/0.3 from 0.1/0.05
        self.assertLessEqual(t[0], 0.2)
        self.assertEqual(t[1], 0.5)  # no validation positives -> default
        report = evaluate(y, prob, t, ['a', 'b'])
        self.assertEqual(report['labels']['a']['f1'], 1.0)
        self.assertEqual(report['macro_f1'], 1.0)  # labels without positives are not averaged


if __name__ == '__main__':
    unittest.main()
