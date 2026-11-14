"""Contract and failure-path checks; no weights, GPU, or network needed."""
import csv
import json
import tempfile
import unittest
from pathlib import Path

import numpy as np
from extract_features import case_rows, sha256, validate_bundle
from publish_features import publish


class BundleTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name)
        self.samples = self.path / 'samples.json'
        self.samples.write_text(json.dumps({'samples': [
            {'video_id': 'VID01', 'frame_number': 1, 'instruments': None},
            {'video_id': 'VID02', 'frame_number': 0, 'instruments': None},
            {'video_id': 'VID01', 'frame_number': 0,
             'instruments': {'classifications': [{'label': 'grasper'}]}},
        ]}))
        self.rows = case_rows(self.samples, 'VID01')
        np.save(self.path / 'features.npy', np.ones((2, 768), dtype=np.float32))
        with (self.path / 'manifest.csv').open('w', newline='') as f:
            w = csv.writer(f)
            w.writerows([['case_id', 'frame_id'], ['VID01', 0], ['VID01', 1]])
        (self.path / 'annotations.json').write_text(json.dumps(self.rows))
        self.metadata = {'case_id': 'VID01', 'total_case_frames': 2, 'complete_case': True, 'shape': [2, 768]}
        self.save_metadata()

    def save_metadata(self):
        self.metadata['file_sha256'] = {n: sha256(self.path / n) for n in ['features.npy', 'manifest.csv', 'annotations.json']}
        (self.path / 'metadata.json').write_text(json.dumps(self.metadata))

    def test_valid_join_preserves_unknown_annotation(self):
        self.assertEqual(self.rows[0]['instruments'], ['grasper'])
        self.assertIsNone(self.rows[1]['instruments'])
        validate_bundle(self.path, self.samples, require_complete=True)

    def test_duplicate_source_id_rejected(self):
        data = json.loads(self.samples.read_text())
        data['samples'].append(data['samples'][0])
        self.samples.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError, 'duplicate'):
            case_rows(self.samples, 'VID01')

    def test_unknown_case_rejected(self):
        with self.assertRaisesRegex(ValueError, 'absent'):
            case_rows(self.samples, 'VID99')

    def test_duplicate_manifest_id_rejected(self):
        (self.path / 'manifest.csv').write_text('case_id,frame_id\nVID01,0\nVID01,0\n')
        self.save_metadata()
        with self.assertRaisesRegex(ValueError, 'unique'):
            validate_bundle(self.path)

    def test_nonfinite_features_rejected(self):
        features = np.ones((2, 768), dtype=np.float32)
        features[0, 0] = np.nan
        np.save(self.path / 'features.npy', features)
        self.save_metadata()
        with self.assertRaisesRegex(ValueError, 'nonfinite'):
            validate_bundle(self.path)

    def test_wrong_case_rejected(self):
        (self.path / 'manifest.csv').write_text('case_id,frame_id\nVID02,0\nVID02,1\n')
        self.save_metadata()
        with self.assertRaisesRegex(ValueError, 'case IDs'):
            validate_bundle(self.path)

    def test_partial_case_rejected_for_publication(self):
        self.metadata.update(total_case_frames=3, complete_case=False)
        self.save_metadata()
        validate_bundle(self.path)
        with self.assertRaisesRegex(ValueError, 'partial'):
            validate_bundle(self.path, require_complete=True)

    def test_corrupt_checksum_rejected(self):
        with (self.path / 'annotations.json').open('a') as f:
            f.write(' ')
        with self.assertRaisesRegex(ValueError, 'checksum'):
            validate_bundle(self.path)

    def test_wrong_labels_rejected_against_source(self):
        self.rows[0]['instruments'] = ['hook']
        (self.path / 'annotations.json').write_text(json.dumps(self.rows))
        self.save_metadata()
        with self.assertRaisesRegex(ValueError, 'join'):
            validate_bundle(self.path, self.samples)

    def test_publish_reads_back_complete_bundle_and_refuses_overwrite(self):
        destination = self.path / 'published'
        result = publish(self.path, destination, self.samples)
        self.assertEqual(result['shape'], [2, 768])
        with self.assertRaises(FileExistsError):
            publish(self.path, destination, self.samples)

    def test_partial_publish_leaves_no_destination(self):
        self.metadata.update(total_case_frames=3, complete_case=False)
        self.save_metadata()
        destination = self.path / 'published'
        with self.assertRaisesRegex(ValueError, 'partial'):
            publish(self.path, destination, self.samples)
        self.assertFalse(destination.exists())

    def test_shape_mismatch_rejected(self):
        np.save(self.path / 'features.npy', np.ones((1, 768), dtype=np.float32))
        self.save_metadata()
        with self.assertRaisesRegex(ValueError, 'matching manifest'):
            validate_bundle(self.path)


if __name__ == '__main__':
    unittest.main()
