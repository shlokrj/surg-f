import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from select_smoothing import select, parse_settings


class SmoothingSelectionTests(unittest.TestCase):
    def setUp(self):
        self.split = {'train': ['VID01'], 'validation': ['VID15', 'VID25'], 'test': ['VID27'], 'diagnostic': ['VID02']}
        self.settings = [(0, 1), (2, 2)]
        self.reports = []
        for case in self.split['validation']:
            for gap, length in self.settings:
                self.reports.append({'case_id': case, 'max_gap_sec': gap, 'min_clip_sec': length,
                    'model_split': self.split, 'model_run_id': 'model', 'source_revision': 'source',
                    'frame_threshold': 0.5, 'iou_threshold': 0.5, 'matching': 'greedy',
                    'feature_bundle_hashes': {'features.npy': case+'f', 'manifest.csv': case+'m', 'annotations.json': case+'a'},
                    'tools': {'clipper': {'tp': 1, 'fp': 0 if gap else 2, 'fn': 1}}})

    def test_hand_calculated_ranking_and_tie_break(self):
        result = select(self.reports, self.split, self.settings)
        self.assertEqual(result['selected']['max_gap_sec'], 2)
        self.assertAlmostEqual(result['selected']['score'], (2/3)/6)
        for row in self.reports:
            row['tools']['clipper']['fp'] = 0
        result = select(list(reversed(self.reports)), self.split, list(reversed(self.settings)))
        self.assertEqual(result['selected']['max_gap_sec'], 0)
        self.assertFalse(result['final_test_used'])

    def test_incomplete_duplicate_and_wrong_partition(self):
        for reports in [self.reports[:-1], self.reports+[self.reports[0]],
                        [dict(r, case_id='VID02') if i == 0 else r for i,r in enumerate(self.reports)],
                        [dict(r, case_id='VID27') if i == 0 else r for i,r in enumerate(self.reports)]]:
            with self.assertRaises(ValueError):
                select(reports, self.split, self.settings)

    def test_incompatible_provenance_and_invalid_counts(self):
        for field, value in [('model_run_id','other'), ('source_revision','other'),
                             ('frame_threshold',0.8), ('iou_threshold',float('nan')),
                             ('feature_bundle_hashes',{}), ('model_split',{}),
                             ('tools',{'clipper': {'tp': -1, 'fp': 0, 'fn': 1}})]:
            reports = copy.deepcopy(self.reports)
            reports[1][field] = value
            with self.subTest(field=field), self.assertRaises((ValueError, KeyError)):
                select(reports, self.split, self.settings)
        reports = copy.deepcopy(self.reports)
        reports[1]['tools']['clipper']['fn'] = 10
        with self.assertRaisesRegex(ValueError, 'support'):
            select(reports, self.split, self.settings)

    def test_cli_outputs_and_overwrite_protection(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root/'split.json').write_text(json.dumps(self.split))
            (root/'reports.json').write_text(json.dumps({str(i): r for i,r in enumerate(self.reports)}))
            cmd = [sys.executable, str(Path(__file__).with_name('select_smoothing.py')),
                   str(root/'reports.json'), '--split', str(root/'split.json'),
                   '--settings','0:1,2:2','--output',str(root/'selection.json')]
            subprocess.run(cmd, check=True, capture_output=True)
            self.assertTrue((root/'selection.md').exists())
            result = json.loads((root/'selection.json').read_text())
            self.assertEqual(len(result['input_sha256']), 1)
            self.assertNotEqual(subprocess.run(cmd, capture_output=True).returncode, 0)

    def test_invalid_settings(self):
        for text in ['0:1,0:1', '-1:1', '1:0', '1', '']:
            with self.assertRaises(ValueError):
                parse_settings(text)


if __name__ == '__main__':
    unittest.main()
