import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {mountOverlays} from '../src/overlays.js';
const artifact = JSON.parse(fs.readFileSync(new URL('./fixtures/VID01-grounding-dino.json',import.meta.url)));
const settle = () => new Promise(resolve => setImmediate(resolve));
function setup(assetId = artifact.video_asset_id) {
 const dom = new JSDOM('<div id="host"><video></video></div><div id="controls"></div>');
 globalThis.document = dom.window.document;
 globalThis.ResizeObserver = class {observe() {} disconnect() {}};
 const video = document.querySelector('video'), host = document.querySelector('#host'), controls = document.querySelector('#controls');
 for (const [k,v] of Object.entries({readyState:2,videoWidth:854,videoHeight:484,seeking:false})) Object.defineProperty(video,k,{value:v,writable:true});
 Object.defineProperty(host,'clientWidth',{value:854});Object.defineProperty(host,'clientHeight',{value:484});
 video.pause=()=>{};video.currentTime=679.96;
 const dispose=mountOverlays({video,host,controls,caseId:'VID01',assetId});
 const event=(el,name)=>el.dispatchEvent(new dom.window.Event(name));
 const toggle=controls.querySelector('[data-overlay-toggle]');
 const enable=()=>{toggle.checked=true;event(toggle,'change');};
 return {dom,video,host,controls,dispose,event,toggle,enable,boxes:()=>host.querySelectorAll('.spatial-box')};
}
test('player loads real artifact, filters scores/categories, seeks and clears stale boxes',async()=>{
 globalThis.fetch=async()=>({ok:true,text:async()=>JSON.stringify(artifact)});
 const p=setup();assert.equal(p.boxes().length,0);p.enable();await settle();
 assert.equal(p.boxes().length,3);
 const anatomy=p.controls.querySelector('[data-category="anatomy"]');anatomy.checked=false;p.event(anatomy,'change');assert.equal(p.boxes().length,2);
 const score=p.controls.querySelector('[data-score]');score.value='.95';p.event(score,'input');assert.equal(p.boxes().length,0);
 score.value='0';p.event(score,'input');
 p.video.seeking=true;p.event(p.video,'seeking');assert.equal(p.boxes().length,0);
 p.video.seeking=false;p.video.currentTime=681;p.event(p.video,'seeked');assert.equal(p.boxes().length,0);
 const select=p.controls.querySelector('select');select.value='688.96';p.event(select,'change');assert.equal(p.video.currentTime,688.96);p.event(p.video,'seeked');assert.equal(p.boxes().length,2);
 p.toggle.checked=false;p.event(p.toggle,'change');assert.equal(p.boxes().length,0);
 p.dispose();assert.equal(p.host.querySelector('.spatial-layer'),null);
});
test('categories absent from the file are disabled, not shown as empty filters',async()=>{
 const anatomyOnly=structuredClone(artifact);anatomyOnly.video_asset_id='anatomy-only-test-asset';
 for (const f of anatomyOnly.frames) f.detections=f.detections.filter(d=>d.category==='anatomy');
 globalThis.fetch=async()=>({ok:true,text:async()=>JSON.stringify(anatomyOnly)});
 const p=setup('anatomy-only-test-asset');p.enable();await settle();
 const instruments=p.controls.querySelector('[data-category="instrument"]');
 assert.equal(instruments.disabled,true);assert.equal(instruments.checked,false);
 assert.match(instruments.parentElement.textContent,/none in this file/);
 assert.equal(p.controls.querySelector('[data-category="anatomy"]').disabled,false);
 assert.equal(p.boxes().length,1);
 p.dispose();
});
test('local uploads disable boxes and mismatched dimensions clear detections',async()=>{
 const local=setup(null);assert.equal(local.toggle.disabled,true);assert.match(local.controls.textContent,/unavailable/);local.dispose();
 const p=setup();p.video.videoWidth=1280;p.enable();await settle();assert.equal(p.boxes().length,0);assert.match(p.controls.textContent,/dimensions do not match/);p.dispose();
});
test('late failed requests cannot update a disposed player',async()=>{
 let respond;globalThis.fetch=()=>new Promise(resolve=>respond=resolve);
 const p=setup('unavailable-test-asset');p.enable();p.dispose();const before=p.controls.textContent;
 respond({ok:false});await settle();assert.equal(p.controls.textContent,before);assert.equal(p.boxes().length,0);
});
test('failed overlay request offers an accessible retry',async()=>{
 let attempts=0;
 const retryArtifact={...artifact,video_asset_id:'retry-test-asset'};
 globalThis.fetch=async()=>{attempts++;return attempts===1?{ok:false}:{ok:true,text:async()=>JSON.stringify(retryArtifact)};};
 const p=setup('retry-test-asset');p.enable();await settle();
 const retry=p.controls.querySelector('[data-overlay-retry]');
 assert.equal(retry.hidden,false);assert.equal(p.boxes().length,0);
 p.event(retry,'click');await settle();
 assert.equal(attempts,2);assert.equal(retry.hidden,true);assert.equal(p.boxes().length,3);
 p.dispose();
});
