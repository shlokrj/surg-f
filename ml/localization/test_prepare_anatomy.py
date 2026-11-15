import unittest
from prepare_anatomy import prepare


def source():
    return dict(images=[dict(id=1,video_id=2,file_name='2_25.jpg',width=20,height=10,is_det_keyframe=True),dict(id=2,video_id=8,file_name='8_25.jpg',width=20,height=10,is_det_keyframe=True)],categories=[dict(id=4,name='cystic_duct'),dict(id=5,name='gallbladder'),dict(id=6,name='tool')],annotations=[dict(id=1,image_id=1,category_id=4,bbox=[0,0,5,5]),dict(id=2,image_id=2,category_id=5,bbox=[0,0,5,5]),dict(id=3,image_id=2,category_id=6,bbox=[0,0,5,5])])


class PreparationTests(unittest.TestCase):
    def test_excludes_whole_protected_surgery_and_maps_names(self):
        result, report = prepare(source(),dict(validation=[],test=['VID68']))
        self.assertEqual([i['id'] for i in result['images']],[2])
        self.assertEqual(len(result['annotations']),1)
        self.assertEqual(result['annotations'][0]['category_id'],2)
        self.assertEqual(report['excluded_endoscapes_cases'],[2])

    def test_rejects_unreviewed_and_nontraining_images(self):
        for key,value in [('is_det_keyframe',False),('video_id',121)]:
            data=source();data['images'][0][key]=value
            with self.assertRaises(ValueError):prepare(data,dict(validation=[],test=[]))
