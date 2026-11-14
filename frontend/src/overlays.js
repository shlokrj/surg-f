const labels = { instrument: new Set(['grasper','bipolar','hook','scissors','clipper','irrigator']), anatomy: new Set(['gallbladder','liver','cystic duct']) };
const number = v => typeof v === 'number' && Number.isFinite(v);
export function validateOverlay(data, caseId, assetId) {
  if (data?.schema_version !== 1 || data.case_id !== caseId || data.video_asset_id !== assetId) throw Error('Overlay belongs to a different video or schema.');
  if (!['prediction','annotation','fixture'].includes(data.source)) throw Error('Unknown overlay source.');
  if (![data.image_width,data.image_height].every(v => Number.isInteger(v) && v > 0)) throw Error('Missing source dimensions.');
  if (!number(data.max_age_sec) || data.max_age_sec <= 0 || data.max_age_sec > .25) throw Error('Unsafe overlay expiry.');
  if (!data.provenance || typeof data.provenance !== 'object' || !Object.keys(data.provenance).length) throw Error('Missing provenance.');
  if (!Array.isArray(data.frames) || data.frames.length > 10000) throw Error('Invalid frame list.');
  let previous = -1; const ids = new Set();
  for (const f of data.frames) {
    if (!number(f.timestamp_sec) || f.timestamp_sec < 0 || f.timestamp_sec <= previous || !Number.isInteger(f.frame_id) || f.frame_id < 0 || ids.has(f.frame_id)) throw Error('Invalid frame order or identity.');
    previous = f.timestamp_sec; ids.add(f.frame_id);
    if (!Array.isArray(f.detections) || f.detections.length > 100) throw Error('Invalid detections.');
    const instances = new Set();
    for (const d of f.detections) {
      if (typeof d.instance_id !== 'string' || !d.instance_id || instances.has(d.instance_id)) throw Error('Invalid instance identity.');
      instances.add(d.instance_id);
      if (!labels[d.category]?.has(d.label)) throw Error('Unsupported label.');
      const b = d.bbox_xyxy;
      if (!number(d.score) || d.score < 0 || d.score > 1 || !Array.isArray(b) || b.length !== 4 || !b.every(v => number(v) && v >= 0 && v <= 1) || b[0] >= b[2] || b[1] >= b[3]) throw Error('Invalid box or score.');
    }
  }
  return data;
}
export function frameAt(data, time) {
  if (!number(time)) return null;
  let lo = 0, hi = data.frames.length - 1, index = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (data.frames[mid].timestamp_sec <= time + .0001) { index = mid; lo = mid + 1; } else hi = mid - 1; }
  const f = data.frames[index]; return f && time - f.timestamp_sec <= data.max_age_sec ? f : null;
}
export function contentRect(w,h,sw,sh) {
  const scale = Math.min(w/sw,h/sh);
  return { width: sw*scale, height: sh*scale, left: (w-sw*scale)/2, top: (h-sh*scale)/2 };
}
const cache = new Map();
async function load(caseId, assetId) {
  const key = `${caseId}:${assetId}`;
  if (!cache.has(key)) cache.set(key, (async () => {
    const response = await fetch(`/overlays/${encodeURIComponent(caseId)}.json`);
    if (!response.ok) throw Error('No bounding-box data for this video yet.');
    const text = await response.text(); if (text.length > 2000000) throw Error('Overlay file is too large.');
    let parsed;
    try { parsed = JSON.parse(text); } catch { throw Error('No valid bounding-box data for this video yet.'); }
    return validateOverlay(parsed, caseId, assetId);
  })().catch(error => { cache.delete(key); throw error; }));
  return cache.get(key);
}
export function mountOverlays({ video, host, controls, caseId, assetId, enabled = false, onToggle = () => {} }) {
  let disposed = false, data = null, pending = false, callback = null, key = '', error = '';
  const categories = new Set(['instrument','anatomy']);
  const layer = document.createElement('div'); layer.className = 'spatial-layer'; layer.setAttribute('aria-hidden','true'); host.append(layer);
  controls.innerHTML = `<div class="overlay-toolbar"><label class="overlay-toggle"><input type="checkbox" data-overlay-toggle> Bounding boxes <span>Experimental</span></label><button type="button" data-overlay-fullscreen>Fullscreen with overlays</button></div><div class="overlay-options" hidden><label><input type="checkbox" data-category="instrument" checked> Instruments</label><label><input type="checkbox" data-category="anatomy" checked> Anatomy</label><label>Sampled frame <select aria-label="Jump to sampled detection frame"><option value="">Choose a frame</option></select></label></div><p class="overlay-status" role="status"></p>`;
  const toggle = controls.querySelector('[data-overlay-toggle]'), options = controls.querySelector('.overlay-options'), status = controls.querySelector('.overlay-status'), select = controls.querySelector('select');
  toggle.checked = enabled;
  const say = text => { if (status.textContent !== text) status.textContent = text; };
  function draw() {
    if (disposed) return;
    const visible = toggle.checked && data && !error && !video.seeking && !video.error && video.readyState >= 2;
    if (!toggle.checked) say('Boxes off. Sparse detections appear only near sampled frames.');
    else if (error) say(error);
    else if (!data) say('Loading bounding-box data…');
    let frame = visible ? frameAt(data,video.currentTime) : null;
    if (visible && (video.videoWidth !== data.image_width || video.videoHeight !== data.image_height)) { error = 'Overlay dimensions do not match this video.'; frame = null; say(error); }
    const r = contentRect(host.clientWidth,host.clientHeight,video.videoWidth || 1,video.videoHeight || 1);
    Object.assign(layer.style,{left:`${r.left}px`,top:`${r.top}px`,width:`${r.width}px`,height:`${r.height}px`});
    const next = `${frame?.frame_id ?? ''}:${[...categories]}:${!!visible}`;
    if (key !== next) {
      key = next; layer.replaceChildren();
      for (const d of frame?.detections ?? []) {
        if (!categories.has(d.category)) continue;
        const [x1,y1,x2,y2] = d.bbox_xyxy, box = document.createElement('div'), label = document.createElement('span');
        box.className = `spatial-box ${d.category}`;
        Object.assign(box.style,{left:`${x1*100}%`,top:`${y1*100}%`,width:`${(x2-x1)*100}%`,height:`${(y2-y1)*100}%`});
        label.textContent = `${d.category === 'instrument' ? 'Instrument' : 'Anatomy'} · ${d.label} · score ${d.score.toFixed(2)}`;
        box.append(label); layer.append(box);
      }
    }
    if (data && toggle.checked && !error) {
      const source = data.source === 'fixture' ? 'Synthetic fixture' : data.source === 'annotation' ? 'Dataset boxes' : 'Experimental model predictions';
      const count = frame?.detections.filter(d => categories.has(d.category)).length ?? 0;
      say(`${source} · ${frame ? `${count} boxes at sampled frame ${frame.frame_id}` : 'No current detection frame; choose a sampled frame'} · no tracking or action recognition.`);
    }
    if (!assetId) say(error);
  }
  async function ensureData() {
    if (data || pending || !assetId || disposed) return; pending = true; error = '';
    try {
      const loaded = await load(caseId,assetId); if (disposed) return; data = loaded;
      for (const f of data.frames) { const o = document.createElement('option'); o.value = String(f.timestamp_sec); o.textContent = `${Math.floor(f.timestamp_sec/60)}:${String(Math.floor(f.timestamp_sec%60)).padStart(2,'0')} · frame ${f.frame_id}`; select.append(o); }
    } catch (reason) { if (!disposed) error = reason.message; }
    finally { pending = false; }
    draw();
  }
  toggle.addEventListener('change',() => { options.hidden = !toggle.checked; onToggle(toggle.checked); ensureData(); draw(); });
  controls.querySelectorAll('[data-category]').forEach(input => input.addEventListener('change',() => { input.checked ? categories.add(input.dataset.category) : categories.delete(input.dataset.category); draw(); }));
  select.addEventListener('change',() => { if (select.value !== '') { video.pause(); video.currentTime = Number(select.value); } });
  controls.querySelector('[data-overlay-fullscreen]').addEventListener('click',async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await host.requestFullscreen(); } catch { say('Fullscreen is unavailable in this browser.'); } });
  const events = ['loadedmetadata','loadeddata','timeupdate','seeking','seeked','play','pause','error','emptied'];
  events.forEach(name => video.addEventListener(name,draw));
  const tick = () => { draw(); if (!disposed) callback = video.requestVideoFrameCallback(tick); };
  if (video.requestVideoFrameCallback) callback = video.requestVideoFrameCallback(tick);
  const observer = new ResizeObserver(draw); observer.observe(host);
  if (!assetId) { error = 'Bounding boxes are unavailable for local or unindexed videos.'; toggle.disabled = true; toggle.checked = false; }
  options.hidden = !toggle.checked; if (toggle.checked) ensureData(); draw();
  return () => { disposed = true; observer.disconnect(); events.forEach(name => video.removeEventListener(name,draw)); if (callback !== null) video.cancelVideoFrameCallback(callback); layer.remove(); };
}
