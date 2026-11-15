// The "3D model" panel on the case page: its markup, and the glue between the page, the
// video time and the viewer. The viewer (and three.js) is loaded only when the panel opens.

import './model.css';
import manifest from './manifest.json';
import { REVIEWED, STEP_SCENES, FREE_SCENE, stepIndexAt } from './steps.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
const ORGANS = manifest.parts.filter(part => part.group !== 'outline');

// The viewer outlives page redraws: its element is moved into each new copy of the panel.
let viewer = null;
let loading = null;
let failure = '';

export function modelPanel(state) {
  const hasSteps = Boolean(state.steps?.steps?.length);
  const organButton = part => `<button type="button" data-organ="${part.name}" aria-pressed="false"><i style="background:${part.color}" aria-hidden="true"></i>${escapeHtml(part.label)}</button>`;
  return `<section class="panel anat-panel" id="sec-model" aria-labelledby="model-title">
    <div class="panel-head"><h2 id="model-title">3D model</h2><p>The gallbladder and the organs around it${hasSteps ? ', following the video step by step' : ''}.</p></div>
    <div class="panel-body">
      ${hasSteps ? `<div class="anat-step">
        <button type="button" class="step-nav" data-step-nav="-1" aria-label="Previous step"><i class="ico ico-left" aria-hidden="true"></i></button>
        <div class="anat-step-text" aria-live="polite"><strong id="model-step-title"></strong><span id="model-step-note"></span></div>
        <button type="button" class="step-nav" data-step-nav="1" aria-label="Next step"><i class="ico ico-right" aria-hidden="true"></i></button>
      </div>` : ''}
      <div class="anat-stage" id="model-stage">
        <p class="anat-status" id="model-status">Loading the 3D model…</p>
        <span class="anat-hover" id="model-hover" aria-hidden="true"></span>
        <div class="anat-tools" role="group" aria-label="View">
          <button type="button" id="model-zoom-in" aria-label="Zoom in"><i class="ico ico-plus" aria-hidden="true"></i></button>
          <button type="button" id="model-zoom-out" aria-label="Zoom out"><i class="ico ico-minus" aria-hidden="true"></i></button>
          <button type="button" id="model-reset">Reset view</button>
        </div>
      </div>
      <div class="anat-organs" role="group" aria-label="See through an organ">
        <span>See through:</span>${ORGANS.map(organButton).join('')}
        <button type="button" class="btn-quiet" id="model-show-all">Show all</button>
      </div>
      <p class="anat-notes">Drag to rotate, scroll to zoom, and click an organ to fade it; click it again to bring it back. Reset view restores everything. This is an illustration on a generic body, not this patient's anatomy${REVIEWED ? '' : ', and it has not yet been medically reviewed'}.</p>
      <p class="anat-credit">Anatomy: BodyParts3D, © The Database Center for Life Science, licensed under CC Attribution 4.0 International. The cystic artery, ports, clips and other step markers are drawn by Surg+F.</p>
    </div>
  </section>`;
}

function syncOrgans() {
  const ghosted = new Set(viewer?.ghosted() ?? []);
  document.querySelectorAll('[data-organ]').forEach(button => button.setAttribute('aria-pressed', String(ghosted.has(button.dataset.organ))));
}

function attach() {
  const stage = document.querySelector('#model-stage');
  const status = document.querySelector('#model-status');
  if (!stage) return;
  if (viewer) { stage.prepend(viewer.element); if (status) status.hidden = true; syncOrgans(); return; }
  if (status && failure) status.textContent = failure;
}

// Called after every page redraw. `steps` is the list from the backend (or undefined) and
// `time` the video time in seconds.
export function mountModel({ steps, time }) {
  if (!document.querySelector('#model-stage')) return;
  document.querySelectorAll('[data-organ]').forEach(button => button.addEventListener('click', () => viewer?.toggleGhost(button.dataset.organ)));
  document.querySelector('#model-show-all')?.addEventListener('click', () => viewer?.showAll());
  document.querySelector('#model-reset')?.addEventListener('click', () => viewer?.resetView());
  document.querySelector('#model-zoom-in')?.addEventListener('click', () => viewer?.zoom(0.8));
  document.querySelector('#model-zoom-out')?.addEventListener('click', () => viewer?.zoom(1.25));
  attach();
  if (!viewer && !loading && !failure) {
    loading = import('./viewer.js')
      .then(module => module.createViewer({
        onChange: syncOrgans,
        onHover: label => { const hover = document.querySelector('#model-hover'); if (hover) hover.textContent = label; },
      }))
      .then(created => { viewer = created; attach(); modelTick(pending.steps, pending.time, { animate: false }); })
      .catch(() => { failure = 'The 3D model could not be shown in this browser.'; attach(); })
      .finally(() => { loading = null; });
  }
  modelTick(steps, time, { animate: false });
}

// Keep the model, the step label and the arrows in line with the video time. Called on
// every video timeupdate, so it only touches the page when the step changes.
const pending = { steps: undefined, time: 0 };
let shown = '';
export function modelTick(steps, time, { animate = true } = {}) {
  pending.steps = steps; pending.time = time;
  const index = stepIndexAt(steps, time);
  const step = index < 0 ? null : steps[index];
  // The arrows (here and in the Timeline panel) are redrawn with the page, so set them every time.
  document.querySelectorAll('[data-step-nav]').forEach(button => {
    const next = index + Number(button.dataset.stepNav);
    button.disabled = index < 0 || next < 0 || next >= steps.length;
  });
  const signature = `${step?.key ?? ''}:${index}:${steps?.length ?? 0}`;
  const title = document.querySelector('#model-step-title');
  if (signature !== shown || (title && !title.textContent)) {
    shown = signature;
    const scene = STEP_SCENES[step?.key] ?? FREE_SCENE;
    if (title && step) title.textContent = `Step ${index + 1} of ${steps.length}: ${step.label}`;
    const note = document.querySelector('#model-step-note');
    if (note) note.textContent = scene.shows;
  }
  viewer?.setStep(step && STEP_SCENES[step.key] ? step.key : null, { animate });
}

export function disposeModel() {
  viewer?.dispose();
  viewer = null;
  shown = '';
}

// For browser tests: what the viewer is showing right now (null until it has loaded).
if (typeof window !== 'undefined') window.__surgfModel = () => viewer?.snapshot() ?? null;
