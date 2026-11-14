import copy
import unittest
from artifact import validate


def example():
    return {'schema_version': 1, 'case_id': 'VID01', 'video_asset_id': 'asset', 'source': 'prediction',
            'image_width': 854, 'image_height': 480, 'max_age_sec': 0.12, 'provenance': {'model': 'test'},
            'frames': [{'frame_id': 680, 'timestamp_sec': 679.96, 'detections': [
                {'instance_id': 'a', 'category': 'instrument', 'label': 'clipper',
                 'score': 0.4, 'bbox_xyxy': [0.1, 0.2, 0.4, 0.8]}]}]}


class ArtifactTests(unittest.TestCase):
    def test_valid_and_empty_detections(self):
        data = example(); self.assertIs(validate(data), data)
        data['frames'][0]['detections'] = []; validate(data)

    def test_invalid_geometry_and_scores(self):
        for change in [{'bbox_xyxy': [-0.1,0,1,1]}, {'bbox_xyxy': [0.5,0,0.2,1]},
                       {'score': float('nan')}, {'label': 'made up'}, {'category': 'verb'}]:
            data = example(); data['frames'][0]['detections'][0].update(change)
            with self.subTest(change=change), self.assertRaises(ValueError): validate(data)

    def test_identity_order_expiry(self):
        for change in [{'max_age_sec': 1}, {'image_width': 0}, {'source': 'unknown'}, {'schema_version': 2}]:
            data = example(); data.update(change)
            with self.assertRaises(ValueError): validate(data)
        data=example(); data['frames'].append(copy.deepcopy(data['frames'][0]))
        with self.assertRaises(ValueError): validate(data)
        data=example(); data['frames'][0]['detections'] *= 2
        with self.assertRaises(ValueError): validate(data)

if __name__ == '__main__': unittest.main()
