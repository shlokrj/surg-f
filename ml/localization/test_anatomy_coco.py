import unittest
try:
    import pycocotools
except ImportError:
    pycocotools=None
from evaluate_anatomy_coco import evaluate


def source():
    return dict(images=[dict(id=1,width=100,height=100,is_det_keyframe=True,file_name='1_0.jpg')],categories=[dict(id=1,name='cystic duct'),dict(id=2,name='gallbladder')],annotations=[dict(id=1,image_id=1,category_id=1,bbox=[10,10,20,20])])


@unittest.skipUnless(pycocotools,'install localization evaluation requirements')
class CocoTests(unittest.TestCase):
    def test_perfect_and_missing(self):
        p=[dict(image_id=1,boxes=[[10,10,30,30]],labels=[1],scores=[.9])]
        result=evaluate(source(),p)
        self.assertAlmostEqual(result['ap'],1)
        self.assertIsNone(result['per_class']['gallbladder']['ap'])
        result=evaluate(source(),[])
        self.assertEqual(result['ap'],0)
        self.assertEqual(result['missing_prediction_images'],1)

    def test_scope_and_invalid_input(self):
        p=[dict(image_id=1,boxes=[[10,10,30,30]],labels=[7],scores=[.9])]
        result=evaluate(source(),p)
        self.assertEqual(result['ignored_out_of_scope_predictions'],1)
        self.assertEqual(result['ap'],0)
        with self.assertRaises(ValueError):evaluate(source(),p+p)
        p[0]['scores']=[float('nan')]
        with self.assertRaises(ValueError):evaluate(source(),p)
