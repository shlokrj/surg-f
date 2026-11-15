import copy
import unittest

from combine_overlays import combine


def artifact(detections):
    return dict(schema_version=1, case_id='VID01', video_asset_id='asset', source='prediction', image_width=10,
                image_height=10, max_age_sec=.25, provenance=dict(video_sha256='v', checkpoint_sha256='c'),
                frames=[dict(frame_id=i, timestamp_sec=i * .24, detections=copy.deepcopy(detections)) for i in (0, 6)])


ANATOMY = dict(instance_id='000000-0', category='anatomy', label='gallbladder', score=.9, bbox_xyxy=[.1, .1, .5, .5])
TOOL = dict(instance_id='000000-t0', category='instrument', label='hook', score=.8, bbox_xyxy=[.5, .5, .9, .9])


class CombineTests(unittest.TestCase):
    def test_keeps_base_anatomy_and_adds_instruments(self):
        other_anatomy = dict(ANATOMY, instance_id='000000-1', label='cystic duct')
        result = combine(artifact([ANATOMY]), artifact([other_anatomy, TOOL]))
        self.assertEqual([d['label'] for d in result['frames'][0]['detections']], ['gallbladder', 'hook'])
        self.assertEqual(result['provenance']['instrument_source']['checkpoint_sha256'], 'c')

    def test_rejects_mismatched_artifacts(self):
        other = artifact([TOOL]); other['frames'][1]['timestamp_sec'] = .25
        with self.assertRaises(ValueError):
            combine(artifact([ANATOMY]), other)
        other = artifact([TOOL]); other['provenance']['video_sha256'] = 'different'
        with self.assertRaises(ValueError):
            combine(artifact([ANATOMY]), other)
        other = artifact([TOOL]); other['display_width'] = 854; other['display_height'] = 484
        with self.assertRaises(ValueError):
            combine(artifact([ANATOMY]), other)
        clash = artifact([dict(TOOL, instance_id='000000-0')])
        with self.assertRaises(ValueError):
            combine(artifact([ANATOMY]), clash)


if __name__ == '__main__':
    unittest.main()
