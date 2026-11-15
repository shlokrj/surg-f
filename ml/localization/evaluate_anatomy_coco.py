"""COCO box metrics scoped to annotated cystic duct and gallbladder classes."""
import argparse
import contextlib
import copy
import hashlib
import io
import json
import math
from pathlib import Path
from audit_coco import audit

SCOPE = {1: 'cystic duct', 2: 'gallbladder'}
SCOPE_WITH_TOOL = {**SCOPE, 3: 'tool'}


def evaluate(annotations, predictions):
    from pycocotools.coco import COCO
    from pycocotools.cocoeval import COCOeval
    inventory = audit(annotations)
    if inventory['excluded'] or inventory['duplicate_image_ids']:
        raise ValueError('invalid reference annotations')
    scope = {c['id']:c['name'] for c in annotations['categories']}
    if scope not in (SCOPE, SCOPE_WITH_TOOL):
        raise ValueError('reference must contain exactly the two anatomy categories (optionally plus tool)')
    images = {i['id']:i for i in annotations['images']}
    if not images or any(i.get('is_det_keyframe') is not True for i in images.values()):
        raise ValueError('nonempty reviewed detection frames required')
    rows=[]; seen=set(); ignored=0
    for prediction in predictions:
        identity=prediction['image_id']
        if identity not in images or identity in seen:raise ValueError('unknown or duplicate prediction image')
        seen.add(identity)
        boxes,labels,scores=prediction['boxes'],prediction['labels'],prediction['scores']
        if len(boxes)!=len(labels) or len(boxes)!=len(scores):raise ValueError('inconsistent prediction lengths')
        for box,label,score in zip(boxes,labels,scores):
            if type(label) is not int:raise ValueError('integer class ID required')
            if len(box)!=4 or any(type(v) not in (int,float) or not math.isfinite(v) for v in [*box,score]):raise ValueError('nonfinite detection')
            x1,y1,x2,y2=box
            if not (0<=x1<x2<=images[identity]['width']+1e-4 and 0<=y1<y2<=images[identity]['height']+1e-4 and 0<=score<=1):raise ValueError('invalid detection geometry/score')
            if label not in scope:
                ignored+=1
                continue
            rows.append(dict(image_id=identity,category_id=label,bbox=[x1,y1,x2-x1,y2-y1],score=score))
    data=copy.deepcopy(annotations)
    data.setdefault('info',{})
    for a in data['annotations']:
        a.setdefault('iscrowd',0)
        a['area']=a['bbox'][2]*a['bbox'][3]  # bbox area, not optional segmentation area
    with contextlib.redirect_stdout(io.StringIO()):
        gt=COCO();gt.dataset=data;gt.createIndex()
        if rows:dt=gt.loadRes(rows)
        else:
            dt=COCO();dt.dataset=dict(images=data['images'],categories=data['categories'],annotations=[]);dt.createIndex()
        evaluator=COCOeval(gt,dt,'bbox');evaluator.params.catIds=sorted(scope)
        evaluator.evaluate();evaluator.accumulate();evaluator.summarize()
    def mean(values):
        valid=values[values>=0]
        return float(valid.mean()) if valid.size else None
    per_class={}
    for index,(identity,name) in enumerate(sorted(scope.items())):
        p=evaluator.eval['precision'][:,:,index,0,-1]
        r=evaluator.eval['recall'][:,index,0,-1]
        per_class[name]=dict(ap=mean(p),ap50=mean(p[0]),recall100=mean(r),support=sum(a['category_id']==identity for a in data['annotations']))
    return dict(scope=list(scope.values()),images=len(images),missing_prediction_images=len(images)-len(seen),ignored_out_of_scope_predictions=ignored,
                ap=mean(evaluator.eval['precision'][:,:,:,0,-1]),ap50=mean(evaluator.eval['precision'][0,:,:,0,-1]),
                per_class=per_class,protocol='COCO bbox IoU .50:.05:.95, 101 recall points, maxDets=100, all areas; undefined metrics null')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('annotations');parser.add_argument('predictions');parser.add_argument('--output',required=True)
    args=parser.parse_args()
    raw=Path(args.annotations).read_bytes();pred=Path(args.predictions).read_bytes()
    result=evaluate(json.loads(raw),json.loads(pred))
    result.update(annotation_sha256=hashlib.sha256(raw).hexdigest(),prediction_sha256=hashlib.sha256(pred).hexdigest())
    with Path(args.output).open('x') as stream:stream.write(json.dumps(result,indent=2,allow_nan=False)+'\n')
    print(json.dumps(result,indent=2))
