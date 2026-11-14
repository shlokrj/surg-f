import unittest
from check_training_readiness import check_split, inspect_local


class ReadinessTests(unittest.TestCase):
    def setUp(self):
        self.split = {'train': ['VID01'], 'validation': ['VID04'], 'test': ['VID05'], 'diagnostic': ['VID02']}

    def inspect(self, case):
        return ({'case_id': case, 'checkpoint_sha256': 'a', 'samples_sha256': 'b',
                 'preprocessing': {'resize': 1}, 'shape': [2, 768], 'file_sha256': {}},
                [{'instruments': ['clipper']}, {'instruments': []}])

    def test_ready_excludes_diagnostic_and_reports_unsupported_tools(self):
        seen = []
        def inspect(case):
            seen.append(case)
            return self.inspect(case)
        result = check_split(self.split, inspect)
        self.assertTrue(result['ready'])
        self.assertEqual(seen, ['VID01', 'VID04', 'VID05'])
        self.assertNotIn('clipper', result['unsupported_training_tools'])
        self.assertIn('scissors', result['unsupported_training_tools'])

    def test_validation_only_does_not_inspect_final_test(self):
        seen = []
        def inspect(case):
            seen.append(case)
            if case == 'VID05':
                self.fail('final test must not be accessed')
            return self.inspect(case)
        result = check_split(self.split, inspect, validation_only=True)
        self.assertTrue(result['ready'])
        self.assertEqual(result['required_cases'], 2)
        self.assertEqual(seen, ['VID01', 'VID04'])

    def test_collects_missing_and_incompatible_without_stopping(self):
        def inspect(case):
            if case == 'VID04':
                raise FileNotFoundError('bundle not published')
            metadata, labels = self.inspect(case)
            if case == 'VID05':
                metadata['checkpoint_sha256'] = 'different'
            return metadata, labels
        result = check_split(self.split, inspect)
        self.assertFalse(result['ready'])
        self.assertEqual(result['ready_cases'], 1)
        self.assertEqual(len(result['cases']), 3)
        self.assertIn('checkpoint_sha256', result['cases'][2]['reason'])

    def test_wrong_case_unknown_labels_and_unknown_only_fail(self):
        for mode in ['wrong_case', 'unknown_only', 'invalid_label']:
            def inspect(case):
                metadata, labels = self.inspect(case)
                if mode == 'wrong_case': metadata['case_id'] = 'VID99'
                if mode == 'unknown_only': labels = [{'instruments': None}]
                if mode == 'invalid_label': labels = [{'instruments': ['other']}]
                return metadata, labels
            with self.subTest(mode=mode):
                self.assertEqual(check_split(self.split, inspect)['ready_cases'], 0)

    def test_real_bundle_checksum_is_checked(self):
        import json
        import tempfile
        from pathlib import Path
        import numpy as np
        from extract_features import sha256
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)
            np.save(path / 'features.npy', np.ones((1, 768), dtype=np.float32))
            (path / 'manifest.csv').write_text('case_id,frame_id\nVID01,0\n')
            (path / 'annotations.json').write_text(json.dumps([
                {'case_id': 'VID01', 'frame_id': 0, 'instruments': ['clipper']}]))
            metadata = {'case_id': 'VID01', 'shape': [1, 768], 'total_case_frames': 1,
                        'complete_case': True, 'file_sha256': {
                            name: sha256(path / name) for name in
                            ['features.npy', 'manifest.csv', 'annotations.json']}}
            (path / 'metadata.json').write_text(json.dumps(metadata))
            self.assertEqual(inspect_local(path)[0]['shape'], [1, 768])
            with (path / 'annotations.json').open('a') as stream:
                stream.write(' ')
            with self.assertRaisesRegex(ValueError, 'checksum'):
                inspect_local(path)

    def test_overlap_and_inspected_test_case_fail_before_inspection(self):
        for changes in [{'test': ['VID01']}, {'test': ['VID02'], 'diagnostic': []}, {'train': []}]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                check_split(dict(self.split, **changes), lambda _: self.fail('must not inspect'))


if __name__ == '__main__':
    unittest.main()
