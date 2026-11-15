"""Bounded CPU training/inference check; not a fitted or accuracy-qualified detector."""
import argparse
import hashlib
import json
from pathlib import Path
import time
import torch
import torchvision
from PIL import Image
from torchvision.transforms.functional import pil_to_tensor
from torchvision.models.detection import fasterrcnn_mobilenet_v3_large_320_fpn, FasterRCNN_MobileNet_V3_Large_320_FPN_Weights
from torchvision.models.detection.faster_rcnn import FastRCNNPredictor


def load(root, partition):
    data=json.loads((root/partition/'annotations.json').read_text())
    if data['categories'] != [{'id':1,'name':'cystic duct','supercategory':'anatomy'},{'id':2,'name':'gallbladder','supercategory':'anatomy'}]:
        raise ValueError('unexpected category mapping')
    samples=[]
    for image in data['images']:
        path=root/partition/image['file_name']
        with Image.open(path) as im:
            tensor=pil_to_tensor(im.convert('RGB')).float()/255
        rows=[a for a in data['annotations'] if a['image_id']==image['id']]
        boxes=[[x,y,x+w,y+h] for x,y,w,h in [a['bbox'] for a in rows]]
        target=dict(boxes=torch.tensor(boxes,dtype=torch.float32).reshape(-1,4),labels=torch.tensor([a['category_id'] for a in rows],dtype=torch.int64))
        samples.append((tensor,target,image))
    return samples


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-dir',required=True);parser.add_argument('--output-dir',required=True)
    args=parser.parse_args();root=Path(args.data_dir);out=Path(args.output_dir)
    if out.exists():raise FileExistsError(out)
    torch.manual_seed(17);torch.set_num_threads(4)
    train,val=load(root,'train'),load(root,'val')
    if len(train)!=2 or len(val)!=2:raise ValueError('smoke requires two images per partition')
    if {i['video_id'] for _,_,i in train}&{i['video_id'] for _,_,i in val}:raise ValueError('surgery leakage')
    manifest=json.loads((root/'manifest.json').read_text())
    for name,digest in manifest['files'].items():
        if hashlib.sha256((root/name).read_bytes()).hexdigest()!=digest:raise ValueError('image hash mismatch')
    weights=FasterRCNN_MobileNet_V3_Large_320_FPN_Weights.COCO_V1
    model=fasterrcnn_mobilenet_v3_large_320_fpn(weights=weights)
    model.roi_heads.box_predictor=FastRCNNPredictor(model.roi_heads.box_predictor.cls_score.in_features,3)
    optimizer=torch.optim.SGD([p for p in model.parameters() if p.requires_grad],lr=.001,momentum=.9)
    losses=[];started=time.perf_counter();model.train()
    for step in range(3):
        loss_dict=model([x for x,_,_ in train],[y for _,y,_ in train]);loss=sum(loss_dict.values())
        if not torch.isfinite(loss):raise ValueError('nonfinite loss')
        optimizer.zero_grad();loss.backward();optimizer.step()
        losses.append({k:float(v.detach()) for k,v in loss_dict.items()});print(step,losses[-1],flush=True)
    model.eval()
    with torch.inference_mode():predictions=model([x for x,_,_ in val])
    outputs=[]
    for pred,(_,_,image) in zip(predictions,val):
        if not all(torch.isfinite(t).all() for t in pred.values()):raise ValueError('nonfinite inference')
        outputs.append(dict(image_id=image['id'],video_id=image['video_id'],**{k:v.tolist() for k,v in pred.items()}))
    out.mkdir(parents=True)
    torch.save(model.state_dict(),out/'smoke-model.pt')
    report=dict(purpose='three optimizer steps only; no accuracy claim',architecture='fasterrcnn_mobilenet_v3_large_320_fpn',initial_weights=weights.name,seed=17,torch=torch.__version__,torchvision=torchvision.__version__,train_cases=[i['video_id'] for _,_,i in train],validation_cases=[i['video_id'] for _,_,i in val],losses=losses,elapsed_seconds=time.perf_counter()-started,validation_detection_counts=[len(p['scores']) for p in predictions],data_manifest_sha256=hashlib.sha256((root/'manifest.json').read_bytes()).hexdigest())
    (out/'report.json').write_text(json.dumps(report,indent=2));(out/'predictions.json').write_text(json.dumps(outputs))
    print(json.dumps(report,indent=2),flush=True)
