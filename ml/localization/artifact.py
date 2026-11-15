"""Version-one sparse frame detections; coordinates refer to the uncropped source image."""
import math
import re

INSTRUMENTS = {'grasper', 'bipolar', 'hook', 'scissors', 'clipper', 'irrigator'}
ANATOMY = {'gallbladder', 'liver', 'cystic duct'}


def finite(value):
    return type(value) in (int, float) and math.isfinite(value)


def validate(data):
    if data.get('schema_version') != 1 or not re.fullmatch(r'VID\d+', data.get('case_id', '')):
        raise ValueError('unsupported schema or case ID')
    if not isinstance(data.get('video_asset_id'), str) or not data['video_asset_id']:
        raise ValueError('video asset ID required')
    if data.get('source') not in ('prediction', 'fixture', 'annotation'):
        raise ValueError('explicit source required')
    for key in ('image_width', 'image_height'):
        if type(data.get(key)) is not int or data[key] < 1:
            raise ValueError('positive source dimensions required')
    if 'display_width' in data or 'display_height' in data:
        for key in ('display_width', 'display_height'):
            if type(data.get(key)) is not int or data[key] < 1:
                raise ValueError('paired positive video display dimensions required')
    age = data.get('max_age_sec')
    if not finite(age) or not 0 < age <= 0.25:
        raise ValueError('sparse detections expire within 250 ms')
    if not isinstance(data.get('provenance'), dict) or not data['provenance']:
        raise ValueError('provenance required')
    previous, frame_ids = -1, set()
    if not isinstance(data.get('frames'), list) or len(data['frames']) > 20000:
        raise ValueError('bounded frame list required')
    for frame in data['frames']:
        stamp, index = frame.get('timestamp_sec'), frame.get('frame_id')
        if not finite(stamp) or stamp < 0 or stamp <= previous or type(index) is not int or index < 0 or index in frame_ids:
            raise ValueError('frames must have unique increasing timestamps and IDs')
        previous = stamp
        frame_ids.add(index)
        instances = set()
        if not isinstance(frame.get('detections'), list) or len(frame['detections']) > 100:
            raise ValueError('bounded detections required')
        for detection in frame['detections']:
            instance = detection.get('instance_id')
            if not isinstance(instance, str) or not instance or instance in instances:
                raise ValueError('unique frame instance IDs required')
            instances.add(instance)
            category, label = detection.get('category'), detection.get('label')
            if label not in {'instrument': INSTRUMENTS, 'anatomy': ANATOMY}.get(category, set()):
                raise ValueError('unsupported category/label')
            box, score = detection.get('bbox_xyxy'), detection.get('score')
            if not isinstance(box, list) or len(box) != 4 or any(not finite(v) or not 0 <= v <= 1 for v in box):
                raise ValueError('normalized box required')
            if box[0] >= box[2] or box[1] >= box[3] or not finite(score) or not 0 <= score <= 1:
                raise ValueError('positive-area box and finite score required')
    return data
