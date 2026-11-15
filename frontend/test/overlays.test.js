import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateOverlay,frameAt,contentRect,jumpFrames} from '../src/overlays.js';
const data = JSON.parse(fs.readFileSync(new URL('./fixtures/VID01-grounding-dino.json',import.meta.url)));
test('real detector artifact validates and sparse boxes expire',()=>{
 validateOverlay(data,'VID01','VID01-cholec80-25fps-v1');
 assert.equal(frameAt(data,679.96).frame_id,680);
 assert.equal(frameAt(data,680.5),null);
 assert.equal(frameAt(data,0),null);
 assert.equal(frameAt(data,NaN),null);
});
test('reject wrong asset, invalid geometry, duplicates and stale intervals',()=>{
 assert.throws(()=>validateOverlay(data,'VID02',data.video_asset_id));
 assert.throws(()=>validateOverlay(data,'VID01','changed-asset'));
 for (const change of [d=>d.max_age_sec=2,d=>d.frames[0].detections[0].score=NaN,d=>d.frames[0].detections[0].bbox_xyxy=[0,0,2,1],d=>d.frames.push(d.frames[0])]) {
  const bad=structuredClone(data);change(bad);assert.throws(()=>validateOverlay(bad,'VID01',bad.video_asset_id));
 }
 for (const change of [d=>delete d.display_height,d=>d.display_width=0]) {
  const bad=structuredClone(data);change(bad);assert.throws(()=>validateOverlay(bad,'VID01',bad.video_asset_id));
 }
});
test('letterbox and portrait layouts map to the content rectangle',()=>{
 assert.deepEqual(contentRect(1000,1000,800,400),{width:1000,height:500,left:0,top:250});
 assert.deepEqual(contentRect(1000,500,500,1000),{width:250,height:500,left:375,top:0});
});
test('dense artifacts list detection frames at least ten seconds apart',()=>{
 assert.equal(jumpFrames(data.frames),data.frames);
 const frames=Array.from({length:400},(_,i)=>({frame_id:i*6,timestamp_sec:i*.24,detections:i%3?[]:[{}]}));
 const listed=jumpFrames(frames);
 assert.ok(listed.length>0&&listed.length<=Math.ceil(400*.24/10));
 assert.ok(listed.every(f=>f.detections.length));
 for (let i=1;i<listed.length;i++) assert.ok(listed[i].timestamp_sec-listed[i-1].timestamp_sec>=10);
});
