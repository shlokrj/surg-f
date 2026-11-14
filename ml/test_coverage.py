import json
import tempfile
import unittest
from pathlib import Path

from audit_tool_coverage import audit, split_coverage


class CoverageTests(unittest.TestCase):
    def run_audit(self, samples):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'samples.json'
            path.write_text(json.dumps({'samples': samples}))
            return audit(path)

    def test_missing_empty_and_duplicate_labels(self):
        samples = [{'video_id': 'VID01', 'frame_number': i, **extra} for i, extra in enumerate([
            {}, {'instruments': None}, {'instruments': {'classifications': []}},
            {'instruments': {'classifications': [{'label': 'clipper'}, {'label': 'clipper'}]}},
        ])]
        result = self.run_audit(samples)
        self.assertEqual(result['summary']['known_frames'], 2)
        self.assertEqual(result['summary']['unknown_frames'], 2)
        self.assertEqual(result['summary']['positive_frames']['clipper'], 1)
        self.assertEqual(result['summary']['negative_frames']['clipper'], 1)
        self.assertEqual(result['summary']['negative_frames']['scissors'], 2)

    def test_invalid_samples_rejected(self):
        base = {'video_id': 'VID01', 'frame_number': 0}
        bad = [[], [base, base], [dict(base, frame_number=-1)],
               [dict(base, frame_number=True)], [dict(base, video_id='unknown')],
               [dict(base, instruments={})],
               [dict(base, instruments={'classifications': [{'label': 'unknown'}]})]]
        for samples in bad:
            with self.subTest(samples=samples), self.assertRaises(ValueError):
                self.run_audit(samples)

    def test_split_counts_and_disjointness(self):
        cases = self.run_audit([
            {'video_id': case, 'frame_number': 0, 'instruments': {'classifications': []}}
            for case in ['VID01', 'VID02', 'VID04', 'VID05', 'VID06']])['cases']
        split = {'name': 'example', 'train': ['VID01'], 'validation': ['VID04'],
                 'test': ['VID05'], 'diagnostic': ['VID02']}
        result = split_coverage(cases, split)
        self.assertEqual(result['unassigned_cases'], ['VID06'])
        self.assertEqual(result['groups']['train']['known_frames'], 1)
        for changes in [{'test': ['VID01']}, {'train': ['VID01', 'VID01']},
                        {'validation': []}, {'test': ['VID99']}, {'test': 'VID05'},
                        {'name': ''}, {'test': ['VID02'], 'diagnostic': []}]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                split_coverage(cases, dict(split, **changes))


if __name__ == '__main__':
    unittest.main()
