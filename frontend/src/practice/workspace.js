// Practice workspace: the panel a resident works in while Practice has taken over the case page.
// Owns one session: the controller state, the 3D viewer in practice mode and the panel DOM.
// The panel element is built once per session and moved into each page redraw, so chat
// messages never re-create it, blank the canvas or reset the stage. Leaving (Exit, close,
// case change) disposes all of it; nothing is saved.

import './practice.css';
import { createSession, reduce, currentStage, checklist } from './controller.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
const formatTime = seconds => {
  const n = Math.floor(Number(seconds) || 0);
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
};

// --- preloading: model, tool meshes and first stage, before the resident presses Start -------

let preload = null; // { exerciseId, promise, viewer, practice, route }
export function preloadPractice(exercise) {
  if (preload?.exerciseId === exercise.exercise_id) return preload.promise;
  disposePreload();
  const entry = { exerciseId: exercise.exercise_id, viewer: null, practice: null, route: () => {}, hover: () => {} };
  entry.promise = import('../model/viewer.js')
    .then(module => module.createViewer({ onHover: label => entry.hover(label) }))
    .then(viewer => {
      if (preload !== entry) { viewer.dispose(); return null; }
      entry.viewer = viewer;
      entry.practice = viewer.enablePractice({ exercise, onEvent: event => entry.route(event) });
      entry.practice.setStage(exercise.stages[0]);
      return entry;
    });
  entry.promise.catch(() => {});
  preload = entry;
  return entry.promise;
}
export function disposePreload() {
  if (!preload) return;
  if (!session || session.preload !== preload) preload.viewer?.dispose();
  preload = null;
}

// --- one session ----------------------------------------------------------------------------

let session = null;

// hooks: { seek(seconds), playRange(start, end), onExit(), announce?(text) }
// mode: 'easy' (place and hold) or 'hard' (operating-room view, strict).
export function startPractice(exercise, hooks, { mode = 'easy' } = {}) {
  disposePractice();
  preloadPractice(exercise); // reuses what was loaded while Start / Cancel was showing
  const state = createSession(exercise, { mode });
  session = {
    exercise, hooks, preload, state, mode: state.mode, element: buildElement(exercise, state.mode),
    side: buildSide(), // checklist and video reference, shown under the video
    viewer: null, practice: null, nearLabel: '', progress: 0, failure: '', positionLabel: '',
    intro: state.mode === 'hard' ? 'room' : null, // hard mode opens in the operating room
    portIndex: -1,
  };
  const current = session;
  current.preload.route = event => { if (session === current) handle(event); };
  current.preload.hover = label => { const chip = current.element.querySelector('#pr-hover'); if (chip) chip.textContent = label; };
  current.preload.promise
    .then(loaded => {
      if (session !== current || !loaded) return;
      current.viewer = loaded.viewer;
      current.practice = loaded.practice;
      current.practice.setMode(current.mode);
      current.practice.resetTo([]).then(() => {
        current.practice.setStage(exercise.stages[0]);
        if (current.mode === 'hard') current.practice.playIntro().then(() => { if (session === current) { current.intro = null; paint(); } });
      });
      attachViewer();
      paint();
    })
    .catch(() => { if (session === current) { current.failure = 'The practice model could not be shown in this browser.'; paint(); } });
  wireElement(current);
  paint();
  hooks.seek(exercise.stages[0].reference_start_sec);
  return { exerciseId: exercise.exercise_id };
}

export function disposePractice() {
  if (!session) return;
  session.element.remove();
  session.side.remove();
  session.viewer?.dispose();
  if (preload === session.preload) preload = null;
  session = null;
}

export const practiceActive = () => Boolean(session);

// Markup slot for the page; the session's element is moved into it by mountPractice().
export function practiceSection() {
  return '<section class="panel practice-panel" id="sec-practice" aria-label="Practice"><div id="practice-root"></div></section>';
}
// Slot under the video for the stage checklist and the video reference.
export function practiceSideSlot() {
  return '<div class="practice-side" id="practice-side-root"></div>';
}
export function mountPractice() {
  const slot = document.querySelector('#practice-root');
  if (!slot || !session) return;
  if (session.element.parentElement !== slot) slot.append(session.element);
  const side = document.querySelector('#practice-side-root');
  if (side && session.side.parentElement !== side) side.append(session.side);
  attachViewer();
}
function attachViewer() {
  const stage = session?.element.querySelector('#pr-stage');
  if (!stage || !session.viewer) return;
  if (session.viewer.element.parentElement !== stage) stage.prepend(session.viewer.element);
}

// Called on every video time update: the compact time display only.
export function practiceTick(time, duration) {
  const node = session?.side.querySelector('#pr-time');
  if (node) node.textContent = `${formatTime(time)} / ${duration ? formatTime(duration) : '--:--'}`;
}

// For browser tests.
if (typeof window !== 'undefined') {
  window.__surgfPractice = () => session ? {
    state: session.state, stage: currentStage(session.exercise, session.state)?.id,
    viewer: session.practice?.snapshot() ?? null, busy: session.practice?.busy ?? false,
    point: (id) => session.practice?.screenPosition('point', id) ?? null,
    tool: (id) => session.practice?.screenPosition('tool', id) ?? null,
    port: (name) => session.practice?.screenPosition('port', name) ?? null,
    path: (s) => session.practice?.screenPosition('path', s) ?? null,
    probe: (x, y) => session.practice?.probe(x, y) ?? null,
    mode: session.mode, intro: session.intro,
  } : null;
}

// --- events from the 3D interaction -------------------------------------------------------------

function dispatch(action) {
  const before = session.state;
  session.state = reduce(session.exercise, session.state, action);
  return session.state !== before;
}

function handle(event) {
  const { practice } = session;
  if (!practice) return;
  switch (event.type) {
    case 'request-pickup':
      if (dispatch({ type: 'pickup', toolId: event.toolId })) practice.hold(event.toolId);
      break;
    case 'request-place':
      if (dispatch({ type: 'place', pointId: event.pointId })) practice.settle(event.pointId);
      break;
    case 'request-cancel':
      if (dispatch({ type: 'cancel' })) practice.cancel();
      break;
    case 'contact': {
      // Released on tissue: easy returns the tool; hard fails the stage.
      if (!dispatch({ type: 'contact', organ: event.organ, label: event.label })) break;
      if (session.state.outcome?.type === 'failed') { practice.reject().then(paint); announce(session.state.feedback.message); }
      else practice.cancel();
      break;
    }
    case 'stray':
      if (dispatch({ type: 'stray' })) { session.progress = 0; practice.reject().then(paint); announce(session.state.feedback.message); }
      break;
    case 'deliver': {
      if (!dispatch({ type: 'deliver', port: event.port })) break;
      const { outcome } = session.state;
      if (outcome?.type === 'accepted') practice.accept(session.state.effects).then(() => { paint(); revealResult(); });
      else practice.reject().then(() => { practice.endCarry(); paint(); });
      announce(session.state.feedback.message);
      break;
    }
    case 'gesture': {
      if (!dispatch({ type: 'gesture', complete: event.complete, angleDeg: event.angleDeg, pathDone: event.pathDone })) break;
      const { outcome } = session.state;
      session.progress = 0;
      if (outcome?.type === 'accepted') practice.accept(session.state.effects).then(() => { paint(); revealResult(); });
      else if (outcome?.type === 'carrying') {
        practice.startCarry();
        session.portIndex = -1;
        const hint = session.element.querySelector('#pr-hover');
        if (hint) hint.textContent = ''; // "press and hold" no longer applies
      }
      else if (outcome?.kind === 'gesture') practice.reopen();
      else practice.reject().then(paint);
      announce(session.state.feedback.message);
      break;
    }
    case 'intro':
      session.intro = event.phase === 'done' ? null : event.phase;
      break;
    case 'near':
      // Hard mode names no structures or ports: only "Ready".
      if (session.mode === 'hard') session.nearLabel = event.ready ? 'Ready' : '';
      else session.nearLabel = event.pointId ? `${event.ready ? 'Ready: ' : ''}${event.label}` : '';
      break;
    case 'gesture-progress':
      session.progress = event.value;
      break;
    default:
      return;
  }
  paint();
}

// After a pass, bring the "Accepted" explanation and Continue into view.
function revealResult() {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const hint = session?.element.querySelector('#pr-hover');
  if (hint) hint.textContent = ''; // the "press and hold" hint no longer applies
  session?.element.querySelector('#pr-feedback')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
}

function announce(text) {
  const live = session?.element.querySelector('#pr-live');
  if (!live) return;
  live.textContent = '';
  requestAnimationFrame(() => { live.textContent = text; });
}

// --- controls outside the canvas ------------------------------------------------------------------

function act(name) {
  const { exercise, practice } = session;
  const stage = currentStage(exercise, session.state);
  // Leaving a removal attempt (reset, restart, Escape) also leaves the wide view of the ports.
  const leaveCarry = () => { if (practice?.snapshot().carrying) practice.endCarry(); };
  switch (name) {
    case 'exit':
      session.hooks.onExit();
      return;
    case 'skip-intro':
      practice?.skipIntro();
      return;
    case 'restart':
      leaveCarry();
      dispatch({ type: 'restart' });
      practice?.resetTo([]).then(() => { practice.setStage(exercise.stages[0]); if (session.mode === 'hard') practice.resetCamera(); });
      session.hooks.seek(exercise.stages[0].reference_start_sec);
      announce('Practice restarted at stage 1.');
      break;
    case 'reset':
      leaveCarry();
      if (dispatch({ type: 'resetStage' })) practice?.resetTo(session.state.effects).then(() => practice.setStage(stage));
      announce('Stage reset.');
      break;
    case 'deliver': {
      // Keyboard: deliver the carried gallbladder to the port chosen with the arrow keys.
      const port = practice?.portNames[session.portIndex];
      if (port) handle({ type: 'deliver', port });
      return;
    }
    case 'guidance':
      if (dispatch({ type: 'guidance' })) practice?.setGuidance({ toolId: stage.expected_tool_id, pointId: stage.action_point_ids[0] });
      announce(session.state.feedback.message);
      break;
    case 'continue': {
      if (!dispatch({ type: 'continue' })) break;
      practice?.setGuidance(null);
      if (session.state.phase === 'complete') { announce('Exercise complete.'); break; }
      const next = currentStage(exercise, session.state);
      practice?.setStage(next);
      session.hooks.seek(next.reference_start_sec);
      announce(`Stage ${session.state.stageIndex + 1}: ${next.instruction}`);
      break;
    }
    case 'cancel':
      leaveCarry();
      if (dispatch({ type: 'cancel' })) practice?.cancel();
      break;
    case 'prev-pos':
    case 'next-pos': {
      const moved = practice?.stepPosition(name === 'next-pos' ? 1 : -1);
      if (moved) { session.positionLabel = moved.label; session.nearLabel = `Ready: ${moved.label}`; announce(moved.label); }
      break;
    }
    case 'place': {
      const pointId = practice?.nearPoint;
      if (pointId && dispatch({ type: 'place', pointId })) { practice.settle(pointId); announce(session.state.feedback.message); }
      break;
    }
    case 'gesture':
      practice?.runGesture();
      break;
    case 'ref-seek':
      session.hooks.seek(stage.reference_start_sec);
      break;
    case 'ref-play':
      session.hooks.playRange(stage.reference_start_sec, stage.reference_end_sec);
      break;
    case 'camera':
      practice?.resetCamera();
      break;
    default:
      return;
  }
  paint();
}

function wireElement(current) {
  const { element } = current;
  const onClick = event => {
    if (session !== current) return;
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.replay) {
      const stage = current.exercise.stages.find(item => item.id === button.dataset.replay);
      current.hooks.playRange(stage.reference_start_sec, stage.reference_end_sec);
      return;
    }
    if (button.dataset.zoom) { current.viewer?.zoom(Number(button.dataset.zoom)); return; }
    if (button.dataset.pr) act(button.dataset.pr);
  };
  element.addEventListener('click', onClick);
  current.side.addEventListener('click', onClick); // Go to moment / Play clip under the video
  // Keyboard play on the focused model (there are no on-screen tool buttons):
  // 1-4 pick up a tray instrument, arrows move it, Enter places, Space uses it, Escape returns it.
  element.addEventListener('keydown', event => {
    if (session !== current) return;
    const phase = current.state.phase;
    if (event.key === 'Escape' && current.intro) { event.preventDefault(); act('skip-intro'); return; }
    if (event.key === 'Escape' && ['holding', 'placed', 'carrying'].includes(phase)) { event.preventDefault(); act('cancel'); return; }
    if (event.target.closest('#pr-stage')) {
      // Hard mode: Q / E turn the placed jaws; arrows and Enter choose a port when carrying.
      if (phase === 'placed' && /^[qe]$/i.test(event.key) && current.practice?.aiming) {
        event.preventDefault();
        current.practice.rotateJaws(event.key.toLowerCase() === 'q' ? -10 : 10);
        return;
      }
      if (phase === 'carrying') {
        const names = current.practice?.portNames ?? [];
        if ((event.key === 'ArrowRight' || event.key === 'ArrowLeft') && names.length) {
          event.preventDefault();
          current.portIndex = (current.portIndex + (event.key === 'ArrowRight' ? 1 : -1) + names.length) % names.length;
          announce(names[current.portIndex]);
        } else if (event.key === 'Enter') { event.preventDefault(); act('deliver'); }
        return;
      }
      const tray = currentStage(current.exercise, current.state).tool_tray_ids;
      const slot = Number(event.key) - 1;
      if (/^[1-9]$/.test(event.key) && tray[slot] && ['ready', 'holding', 'placed'].includes(phase)) {
        event.preventDefault();
        if (dispatch({ type: 'pickup', toolId: tray[slot] })) {
          current.practice?.hold(tray[slot]);
          announce(`Holding the ${current.exercise.tools.find(tool => tool.id === tray[slot]).label.toLowerCase()}. Use the arrow keys to move it.`);
        }
        paint();
      } else if (phase === 'holding' && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) { event.preventDefault(); act(event.key === 'ArrowRight' ? 'next-pos' : 'prev-pos'); }
      else if (phase === 'holding' && event.key === 'Enter') { event.preventDefault(); act('place'); }
      else if (phase === 'placed' && (event.key === ' ' || event.key === 'Enter')) { event.preventDefault(); act('gesture'); }
    }
  });
}

// --- markup ------------------------------------------------------------------------------------------

function buildElement(exercise, mode) {
  const element = document.createElement('div');
  element.className = `pr is-${mode}`;
  const hard = mode === 'hard';
  element.innerHTML = `
    <header class="pr-head">
      <div class="pr-head-text">
        <h2 id="pr-title">${escapeHtml(exercise.title)} <span class="pr-mode${hard ? ' is-hard' : ''}" title="${hard ? 'Hard: any mistake fails the stage' : 'Easy: place and hold'}">${hard ? 'Hard' : 'Easy'}</span></h2>
        <p class="pr-objective">${escapeHtml(exercise.objective)}</p>
      </div>
      <div class="pr-head-actions">
        <button type="button" class="btn-secondary pr-small" data-pr="restart">Restart practice</button>
        <button type="button" class="pr-close" data-pr="exit" aria-label="Exit practice" title="Exit practice"><i class="ico ico-close" aria-hidden="true"></i></button>
      </div>
    </header>
    <ol class="pr-rail" id="pr-rail" aria-label="Stages"></ol>
    <div class="pr-work" id="pr-work">
      <div class="pr-stage-text" id="pr-stage-text"></div>
      <div class="pr-stage${hard ? ' is-scope' : ''}" id="pr-stage" tabindex="0" aria-describedby="pr-keys">
        <p class="anat-status" id="pr-status">Loading the practice model…</p>
        <span class="anat-hover" id="pr-hover" aria-hidden="true"></span>
        <span class="pr-near" id="pr-near" aria-hidden="true"></span>
        <span class="pr-ring" id="pr-ring" aria-hidden="true"></span>
        <span class="pr-pass" id="pr-pass" hidden><span aria-hidden="true">✓</span> Passed</span>
        ${hard ? `<div class="pr-intro" id="pr-intro" hidden><p id="pr-intro-text"></p><button type="button" class="pr-skip" data-pr="skip-intro">Skip</button></div>` : ''}
        <div class="anat-tools" role="group" aria-label="View">
          <button type="button" data-zoom="0.8" aria-label="Zoom in"><i class="ico ico-plus" aria-hidden="true"></i></button>
          <button type="button" data-zoom="1.25" aria-label="Zoom out"><i class="ico ico-minus" aria-hidden="true"></i></button>
          <button type="button" data-pr="camera">Reset camera</button>
        </div>
      </div>
      <p class="sr-only" id="pr-keys">Drag an instrument from the tray onto the model, or tap it and then tap where it goes. Press and hold a placed instrument to use it. Drag empty space to rotate the view. With the model focused: number keys 1 to 4 pick up a tray instrument, arrow keys move it between positions, Enter places it, Space performs its gesture, Escape returns it to the tray.${hard ? ' Hard mode: Q and E turn placed jaws; Space burns along the dissection line; when carrying the gallbladder, arrow keys choose a port and Enter takes it out.' : ''}</p>
      <p class="pr-feedback" id="pr-feedback"></p>
      <p class="sr-only" id="pr-live" role="status" aria-live="polite"></p>
      <div class="pr-actions" id="pr-actions"></div>
    </div>
    <section class="pr-recap" id="pr-recap" hidden aria-labelledby="pr-recap-title"></section>`;
  return element;
}

// The stage checklist and video reference, which sit under the video in the left column.
function buildSide() {
  const side = document.createElement('div');
  side.className = 'pr-side';
  side.innerHTML = `
    <div class="pr-check-card"><p class="pr-side-label">This stage checks</p><ul class="pr-check" id="pr-check" aria-label="What this stage checks"></ul></div>
    <div class="pr-ref" id="pr-ref"></div>`;
  return side;
}

function paint() {
  if (!session) return;
  const { exercise, state, element, side } = session;
  const stage = currentStage(exercise, state);
  const total = exercise.stages.length;
  const complete = state.phase === 'complete';
  const $ = selector => element.querySelector(selector) ?? side.querySelector(selector);
  side.hidden = complete; // the recap replaces the per-stage checklist

  // Stage rail: completed stages can replay; future stages reveal nothing.
  const done = new Map(state.records.map(record => [record.stageId, record]));
  $('#pr-rail').innerHTML = exercise.stages.map((item, index) => {
    const record = done.get(item.id);
    const current = !complete && index === state.stageIndex;
    if (record) {
      return `<li class="is-done"><span class="pr-dot" aria-hidden="true">✓</span><span><strong>${escapeHtml(item.title)}</strong><span class="sr-only">, completed${record.guided ? ' with guidance' : ''}</span></span>
        <button type="button" class="pr-replay" data-replay="${item.id}" aria-label="Replay ${escapeHtml(item.title)} in the video, ${formatTime(item.reference_start_sec)}">▶ ${formatTime(item.reference_start_sec)}</button></li>`;
    }
    // Upcoming stages show only their number.
    if (!current) return `<li class="is-future"><span class="pr-dot" aria-hidden="true">${index + 1}</span><span class="sr-only">Stage ${index + 1}</span></li>`;
    return `<li class="is-current" aria-current="step"><span class="pr-dot" aria-hidden="true">${index + 1}</span><span><strong>${escapeHtml(item.title)}</strong></span></li>`;
  }).join('');

  $('#pr-work').hidden = complete;
  $('#pr-recap').hidden = !complete;
  if (complete) { paintRecap(); return; }

  $('#pr-stage-text').innerHTML = `<p class="pr-instruction">${escapeHtml(stage.instruction)}</p>`;

  const status = $('#pr-status');
  status.hidden = Boolean(session.viewer) && !session.failure;
  if (session.failure) status.textContent = session.failure;
  $('#pr-near').textContent = ['holding', 'carrying'].includes(state.phase) ? session.nearLabel : '';
  $('#pr-ring').style.setProperty('--p', String(state.phase === 'placed' ? session.progress : 0));
  $('#pr-ring').hidden = state.phase !== 'placed';
  const accepted = state.phase === 'accepted';
  // The corner marker: "Passed", or in hard mode "Stage failed" until the next attempt starts.
  const failedNow = state.outcome?.type === 'failed';
  const marker = $('#pr-pass');
  marker.hidden = !accepted && !failedNow;
  marker.classList.toggle('is-fail', failedNow);
  marker.innerHTML = failedNow ? '<span aria-hidden="true">✕</span> Stage failed' : '<span aria-hidden="true">✓</span> Passed';
  // Hard mode opening shot: a caption and Skip over the operating room.
  const intro = $('#pr-intro');
  if (intro) {
    intro.hidden = !session.intro || !session.viewer;
    $('#pr-intro-text').textContent = session.intro === 'inside' ? 'Inserting the camera through the navel port…' : 'Operating room: the patient is ready, ports in place.';
    $('#pr-stage').classList.toggle('is-room', session.intro === 'room');
  }

  const feedback = $('#pr-feedback');
  feedback.className = `pr-feedback is-${state.feedback.tone}`;
  // The instruction is already shown above the model, so a message that only repeats it
  // (stage start, reset, tool returned) is not shown again here.
  feedback.hidden = state.feedback.kind === 'intro';
  const label = { tool: 'Instrument', target: 'Structure', placement: 'Placement', gesture: 'Gesture', success: 'Accepted', guidance: 'Guidance', contact: 'Wrong tissue', angle: 'Jaw angle', path: 'Dissection', port: 'Port' }[state.feedback.kind];
  feedback.innerHTML = `${label ? `<strong>${label}:</strong> ` : ''}${escapeHtml(state.feedback.message.replace(/^Guidance: /, ''))}${accepted ? ` <span class="pr-why">${escapeHtml(stage.rationale)}</span>` : ''}`;

  $('#pr-check').innerHTML = checklist(state, stage).map(item => `<li class="${item.done ? 'is-done' : ''}"><span aria-hidden="true">${item.done ? '✓' : '○'}</span>${escapeHtml(item.label)}<span class="sr-only">${item.done ? ', done' : ''}</span></li>`).join('')
    + `<li class="pr-attempts">Attempts this stage: ${state.attempts}${state.mode === 'hard' ? ` · Failed: ${state.failures}` : ''}</li>`;

  $('#pr-ref').innerHTML = `<span class="pr-ref-label">Video reference</span>
    <span class="pr-ref-time">${formatTime(stage.reference_start_sec)}–${formatTime(stage.reference_end_sec)} · <span id="pr-time">--:--</span></span>
    <span class="pr-ref-note">${escapeHtml(stage.reference_note)}</span>
    <span class="pr-ref-buttons"><button type="button" class="btn-quiet" data-pr="ref-seek">Go to moment</button><button type="button" class="btn-quiet" data-pr="ref-play">Play clip</button></span>`;

  const last = state.stageIndex === total - 1;
  $('#pr-actions').innerHTML = `
    <button type="button" class="btn-quiet" data-pr="guidance" ${accepted || state.guided ? 'disabled' : ''}>${state.guided ? 'Guidance shown' : 'Show guidance'}</button>
    <button type="button" class="btn-secondary pr-small" data-pr="reset">Reset stage</button>
    <button type="button" class="btn-primary" data-pr="continue" ${accepted ? '' : 'disabled'}>${last ? 'Finish' : 'Continue'}</button>`;
  practiceTick(document.querySelector('#player')?.currentTime ?? 0, document.querySelector('#player')?.duration);
}

function paintRecap() {
  const { exercise, state, element } = session;
  const records = new Map(state.records.map(record => [record.stageId, record]));
  element.querySelector('#pr-recap').innerHTML = `
    <h3 id="pr-recap-title">Exercise complete${state.mode === 'hard' ? ' · Hard' : ''}</h3>
    <p class="pr-recap-note">A stage-by-stage recap of this session. It is a checklist for your own review, not a clinical proficiency score, and it is not saved.</p>
    <ol class="pr-recap-list">${exercise.stages.map(stage => {
      const record = records.get(stage.id);
      const failed = state.mode === 'hard' ? ` · ${record.failures} failed` : '';
      return `<li><div><strong>${escapeHtml(stage.title)}</strong><span>${record.attempts} attempt${record.attempts === 1 ? '' : 's'}${failed}${record.guided ? ' · guided' : ''}</span></div>
        <p>${escapeHtml(record.explanation)}</p>
        <button type="button" class="btn-quiet" data-replay="${stage.id}">Replay ${formatTime(stage.reference_start_sec)}–${formatTime(stage.reference_end_sec)}</button></li>`;
    }).join('')}</ol>
    <div class="pr-actions"><button type="button" class="btn-secondary" data-pr="restart">Restart practice</button><button type="button" class="btn-primary" data-pr="exit">Exit practice</button></div>`;
}
