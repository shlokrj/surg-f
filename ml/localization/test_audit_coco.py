import unittest
from audit_coco import audit


class AuditTests(unittest.TestCase):
    def test_empty_is_not_ground_truth(self):
        data=dict(images=[dict(id=1,file_name='1_25.jpg',width=20,height=10)],categories=[dict(id=1,name='tool')],annotations=[])
        result=audit(data)
        self.assertEqual(result['valid_boxes'],0)
        self.assertEqual(result['explicit_detection_keyframes'],0)
        data['annotations']=[dict(image_id=1,category_id=1,bbox=[0,0,10,5]),dict(image_id=1,category_id=1,bbox=[0,0,21,5]),dict(image_id=3,category_id=1,bbox=[0,0,10,5])]
        result=audit(data)
        self.assertEqual(result['valid_boxes'],1)
        self.assertEqual(sum(result['excluded'].values()),2)
        self.assertEqual(result['boxes_per_source_case'],{'1':1})
