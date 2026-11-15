import unittest

from smooth_overlays import smooth


def det(label, box, score=.9, i=0):
    return dict(instance_id=f'{i}-{label}', category='anatomy', label=label, score=score, bbox_xyxy=box)


def artifact(per_frame):
    return dict(schema_version=1, case_id='VID01', video_asset_id='a', source='prediction', image_width=10, image_height=10,
                max_age_sec=.25, provenance=dict(x=1),
                frames=[dict(frame_id=i * 6, timestamp_sec=i * .24, detections=d) for i, d in enumerate(per_frame)])


B1, B2 = [.1, .1, .3, .3], [.12, .1, .32, .3]


class SmoothTests(unittest.TestCase):
    def test_fills_short_gaps_between_overlapping_boxes(self):
        result = smooth(artifact([[det('cystic duct', B1, .8)], [], [], [det('cystic duct', B2, .6, 3)]]))
        filled = [f['detections'] for f in result['frames'][1:3]]
        self.assertTrue(all(len(d) == 1 and d[0]['score'] == .6 and d[0]['instance_id'].endswith('-scysticduct') for d in filled))
        self.assertAlmostEqual(filled[0][0]['bbox_xyxy'][0], .1067, places=3)
        self.assertEqual(result['provenance']['temporal_smoothing']['stats']['filled']['cystic duct'], 2)

    def test_leaves_long_gaps_and_far_boxes(self):
        long_gap = smooth(artifact([[det('gallbladder', B1)]] + [[]] * 5 + [[det('gallbladder', B1, i=6)]]))
        self.assertEqual(sum(len(f['detections']) for f in long_gap['frames']), 2)
        far = smooth(artifact([[det('gallbladder', B1)], [], [det('gallbladder', [.6, .6, .9, .9], i=2)]]))
        self.assertEqual(sum(len(f['detections']) for f in far['frames']), 2)

    def test_drops_isolated_detections_only_for_chosen_labels(self):
        frames = [[det('cystic duct', B1), det('gallbladder', B1, i=0)]] + [[]] * 5 + [[det('cystic duct', B1, i=6)], [det('cystic duct', B2, i=7)]]
        result = smooth(artifact(frames), drop_isolated=['cystic duct'])
        labels = [[d['label'] for d in f['detections']] for f in result['frames']]
        self.assertEqual(labels[0], ['gallbladder'], 'lone duct at frame 0 dropped, gallbladder kept')
        self.assertEqual(labels[6:], [['cystic duct'], ['cystic duct']])
        self.assertEqual(result['provenance']['temporal_smoothing']['stats']['dropped_isolated']['cystic duct'], 1)

    def test_instruments_untouched(self):
        tool = dict(instance_id='0-t0', category='instrument', label='hook', score=.9, bbox_xyxy=B1)
        result = smooth(artifact([[tool], [], [dict(tool, instance_id='2-t0')]]))
        self.assertEqual(sum(len(f['detections']) for f in result['frames']), 2)


if __name__ == '__main__':
    unittest.main()
