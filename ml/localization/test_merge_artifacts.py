import copy
import unittest

from merge_artifacts import merge


def chunk(frame_ids, digest):
    return dict(schema_version=1, case_id='VID01', video_asset_id='asset', source='prediction', image_width=10,
                image_height=10, max_age_sec=.25,
                frames=[dict(frame_id=i, timestamp_sec=i / 25, detections=[dict(instance_id=f'{i}-0', category='anatomy',
                        label='gallbladder', score=.9, bbox_xyxy=[.1, .1, .5, .5])]) for i in frame_ids],
                provenance=dict(checkpoint_sha256='c', video_sha256='v', fps=25, score_thresholds={'gallbladder': .65},
                                sampling=dict(every_sec=.24, start=frame_ids[0] / 25, end=None),
                                source_frames=dict(count=len(frame_ids), digest=digest, digest_input='lines')))


class MergeTests(unittest.TestCase):
    def test_merges_in_order_and_keeps_chunk_digests(self):
        merged = merge([chunk([12, 18], 'b'), chunk([0, 6], 'a')])
        self.assertEqual([f['frame_id'] for f in merged['frames']], [0, 6, 12, 18])
        self.assertEqual(merged['provenance']['source_frames']['chunk_digests'], ['a', 'b'])
        self.assertEqual(merged['provenance']['source_frames']['count'], 4)

    def test_rejects_mismatch_and_overlap(self):
        other = chunk([12], 'b'); other['provenance']['checkpoint_sha256'] = 'different'
        with self.assertRaises(ValueError):
            merge([chunk([0], 'a'), other])
        with self.assertRaises(ValueError):
            merge([chunk([0, 6], 'a'), chunk([6, 12], 'b')])
        with self.assertRaises(ValueError):
            merge([chunk([0], 'a')])


if __name__ == '__main__':
    unittest.main()
