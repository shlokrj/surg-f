import '@fontsource-variable/inclusive-sans';
import './style.css';
import './home.css';
import { homePage, mountHome, wordmark, paintDither, DEMO_QUESTION, DEMO_SEEK, VERSION_NAMES } from './home.js';
import './case.css';
import './architecture.css';
import './modelnotes.css';
import './databricks.css';
import './problem.css';
import './solution.css';
import './future.css';
import './sources.css';
let disposeHome = () => {};
let renderedPage = null;
// Page load-in runs only after a real page change (home <-> case), never on re-renders from case
// switches or commands. Re-renders inside the window continue the animation via a negative delay.
const ENTER_MS = 650;
let enterStart = -Infinity;
import { searchClips, getTimeline, getQuiz, getSteps, interpretQuery, chatMessage, getActionRows, instrumentLabels } from './api.js';
import { quizCard, wireQuiz } from './quiz.js';
import { timelinePanel, timelineTick } from './timeline.js';
import { avatar, greeting, switched, localVideoNote, errorReply, reply, STEP_NOTES, localDemoRecognized, localOnlyPractice, practiceBusy, practiceOffer, practiceStarted, practiceCancelled, practiceNotAuthored } from './lildoc.js';
import { videoForCase, videoAssetForCase } from './cases.js';
import { mountOverlays } from './overlays.js';
import { modelPanel, mountModel, modelTick, disposeModel } from './model/panel.js';
import { stepIndexAt } from './model/steps.js';
import { EXERCISES, STEP_LABELS, parsePracticeIntent, findExercise, exerciseById } from './practice/catalog.js';
import { fingerprintFile, checkEligibility, matchesFingerprint } from './practice/eligibility.js';
import { practiceSection, mountPractice, startPractice, disposePractice, preloadPractice, disposePreload, practiceTick } from './practice/workspace.js';
import homeSteps from '../../backend/fixtures/steps.VID01.json';
import homeTimeline from '../../backend/fixtures/timeline.VID01.json';
import homeQuiz from '../../backend/fixtures/quiz.seed-1.json';
let disposeOverlays = () => {};
let boxesEnabled = false;

const app = document.querySelector('#app');
const state = {
  minimized: new Set(), // ids of case-page panels the user collapsed; kept across redraws
  page: 'home', caseId: 'VID01', title: 'VID01 · Cholecystectomy', videoUrl: videoForCase('VID01'),
  localVideo: false, localUrl: null, filterOn: true, videoError: false, pendingSeek: null, duration: 0,
  draft: '', loading: false, messages: [],
  outputs: [], results: [], queryLabel: '', steps: null, stepsError: false,
  timeline: null, quiz: null, quizAnswers: {}, quizSubmitted: false, chartRequest: null, actionRows: [],
  error: '',
  // Practice: the open session ({ exerciseId, surface }) or null, and the uploaded file's fingerprint.
  practice: null, upload: null, // upload = { promise, fingerprint, error }
};
// A reference clip being played in Practice stops at this video time.
let practiceStopAt = null;
const COMMANDS = ['/timestamp', '/quiz', '/chart', '/model'];
const formatTime = seconds => {
  const n = Math.floor(Number(seconds) || 0);
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
};
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
const logo = wordmark('topbar-mark');
/* Homepage version from the URL: /demo, /presentation-demo, /video-demo (or ?mode=<name>, or ?demo).
   Anything else is the public product page. See VERSIONS in home.js. */
const HOME_MODE = (() => {
  const query = new URLSearchParams(window.location.search);
  const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
  const wanted = query.get('mode') ?? (VERSION_NAMES.includes(path) ? path : query.has('demo') ? 'demo' : 'public');
  return VERSION_NAMES.includes(wanted) ? wanted : 'public';
})();
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// The whole page is redrawn from state. The <video> element is carried over to the new
// markup when the same video stays open, so playback never restarts on a redraw.
function render() {
  disposeHome();
  disposeOverlays();
  // A closed or replaced study model is discarded, not kept alive off-screen.
  if (state.page !== 'dash' || state.practice || !state.outputs.includes('model')) disposeModel();
  if (state.page !== 'dash') { if (state.practice) endPractice({ quiet: true }); disposePreload(); }
  const input = document.querySelector('#query');
  if (input) state.draft = input.value;
  const hadFocus = input && document.activeElement === input;
  const oldVideo = document.querySelector('#player');
  const keepVideo = state.page === 'dash' && oldVideo?.dataset.src === state.videoUrl;
  const wasPlaying = keepVideo && !oldVideo.paused;

  app.innerHTML = `<header class="topbar"><button type="button" class="logo-link" id="home-link" aria-label="surg+f home">${logo}</button>
    <span class="top-spacer"></span>${state.page === 'dash' ? '<button type="button" class="top-action" id="open-local">Open your own video</button><input type="file" id="file-input" accept="video/mp4,video/quicktime,.mp4,.mov" hidden>' : '<nav class="home-nav" aria-label="Main"><a href="#case-preview">The demo</a><a href="#local-heading">Your video ↗</a></nav>'}</header>
    ${state.page === 'home' ? home() : dashboard()}`;

  if (keepVideo) {
    document.querySelector('#player').replaceWith(oldVideo);
    if (wasPlaying && oldVideo.paused) oldVideo.play().catch(() => {});
  }
  wire();
  disposeHome = mountHome(document.querySelector('.landing'));
  if (renderedPage !== state.page) enterStart = performance.now();
  const elapsed = performance.now() - enterStart, entering = elapsed < ENTER_MS;
  app.classList.toggle('page-enter', entering);
  app.style.setProperty('--enter-offset', entering ? `-${Math.round(elapsed)}ms` : '0ms');
  if (state.page === 'dash') markNew();
  if (renderedPage !== state.page) window.scrollTo({top:0, behavior:'instant'});
  renderedPage = state.page;
  if (hadFocus) {
    const next = document.querySelector('#query');
    next?.focus({ preventScroll: true });
    next?.setSelectionRange(next.value.length, next.value.length);
  }
  const thread = document.querySelector('#chat-thread');
  if (thread) thread.scrollTop = thread.scrollHeight;
}

// Case page: paint the dithered band after each render. Motion is handled by #app.page-enter only.
function markNew() {
  document.querySelector('.dash')?.querySelectorAll('.sky-dither').forEach(paintDither);
}
let resizeFrame = 0;
window.addEventListener('resize', () => {
  if (resizeFrame) return;
  resizeFrame = requestAnimationFrame(() => { resizeFrame = 0; document.querySelectorAll('.dash .sky-dither').forEach(paintDither); });
});

function caseTitle() {
  const [id, name] = state.title.includes(' · ') ? state.title.split(' · ') : [null, state.title];
  return `${id ? `<span class="case-id">${escapeHtml(id)}</span> ` : ''}<span class="case-name">${escapeHtml(name)}</span>`;
}

const EYE_OPEN = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_SLASH = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.9 5.7A9.7 9.7 0 0 1 12 5.5C18 5.5 21.5 12 21.5 12a17 17 0 0 1-2.7 3.5M6.3 7.4C3.9 9.1 2.5 12 2.5 12S6 18.5 12 18.5c1.7 0 3.2-.5 4.5-1.2"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18"/></svg>';
// Content filter: an eye over the footage. Slashed while the footage is blurred.
const eyeTitle = () => state.filterOn ? 'Footage blurred. Select to show it.' : 'Footage visible. Select to blur it.';
/* Homepage: one eye in the pinned nav blurs every surgery picture on the page (same setting as the case
   page's eye, so the choice carries between pages). */
function blurButton() {
  return `<button type="button" class="nav-eye" data-filter-toggle aria-pressed="${state.filterOn}" aria-label="Blur surgical footage" title="${eyeTitle()}">${state.filterOn ? EYE_SLASH : EYE_OPEN}</button>`;
}
function filterButton() {
  return `<button type="button" class="eye-toggle" data-filter-toggle aria-pressed="${state.filterOn}" aria-label="Blur footage" title="${eyeTitle()}">${state.filterOn ? EYE_SLASH : EYE_OPEN}</button>`;
}

function home() {
  return homePage({videoUrl: escapeHtml(videoForCase('VID01')), filterOn: state.filterOn, filterButton: filterButton(), blurButton: blurButton(), error: escapeHtml(state.error), showcase: {steps: homeSteps, timeline: homeTimeline, quiz: homeQuiz}, mode: HOME_MODE});
}

function detectRequest(input) {
  const lower = input.toLowerCase();
  const explicit = [...lower.matchAll(/\/(timestamp|quiz|chart|model)\b/g)].map(match => match[1]);
  const modes = [...new Set(explicit)];
  if (!modes.length) {
    if (/quiz|test me|practice question|study question/.test(lower)) modes.push('quiz');
    if (/chart|graph|distribution|breakdown|how many|count|frequency|summary of tools|what (?:was|is|did).*(?:doing|do)|verbs?|targets?/.test(lower)) modes.push('chart');
    if (/3d|model|anatomy/.test(lower)) modes.push('model');
    if (/when|timestamp|show me|find|where|used|occurred|happen/.test(lower) || !modes.length) modes.unshift('timestamp');
  }
  // "clipped" means the clipper and "cut" the scissors (for example "When is the cystic duct cut?").
  const label = instrumentLabels.find(item => new RegExp(`\\b${item}\\b`).test(lower)) ?? (/\bclip(?:s|ped|ping)?\b/.test(lower) ? 'clipper' : /\bcut(?:s|ting)?\b/.test(lower) ? 'scissors' : undefined);
  return { modes, label };
}
function parseChartRequest(input) {
  const text = input.toLowerCase();
  const instrument = instrumentLabels.find(label => new RegExp(`\\b${label}\\b`).test(text)) ?? null;
  const explicit = text.includes('/chart');
  const categories = [];
  if (/instruments?|tools?/.test(text)) categories.push('instruments');
  if (/verbs?|actions?|doing|do(es)?|performed?/.test(text)) categories.push('verbs');
  if (/targets?|anatomy|structures?|organs?/.test(text)) categories.push('targets');
  if (!categories.length && (explicit || /chart|graph|distribution|breakdown|how many|count|frequency/.test(text))) categories.push('instruments', 'verbs', 'targets');
  return { categories: [...new Set(categories)], instrument };
}
function chartSection(category, request) {
  if (category === 'instruments') {
    const counts = (state.timeline?.summary ?? []).filter(item => instrumentLabels.includes(item.label) && (!request.instrument || item.label === request.instrument));
    const max = Math.max(1, ...counts.map(item => item.count));
    return `<div class="chart-block"><h3>Instruments</h3><p>Annotated intervals by instrument in ${escapeHtml(state.caseId)}. The current dataset exposes six instrument labels.</p><div class="chart">${counts.map(item => `<div class="chart-row"><span>${escapeHtml(item.label)}</span><div class="chart-track"><div style="width:${item.count / max * 100}%"></div></div><strong>${item.count}</strong></div>`).join('')}</div></div>`;
  }
  const rows = state.actionRows.filter(row => !request.instrument || row.instrument === request.instrument);
  const field = category === 'verbs' ? 'verb' : 'target';
  const counts = new Map();
  for (const row of rows) {
    const key = row[field].startsWith('null_') ? 'Idle / no annotated action' : row[field].replaceAll('_', ' ');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const entries = [...counts].sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, count]) => count));
  const title = category === 'verbs' ? 'Verbs' : 'Targets';
  return `<div class="chart-block"><h3>${title}${request.instrument ? ` for ${escapeHtml(request.instrument)}` : ''}</h3><p>Number of annotated action intervals in ${escapeHtml(state.caseId)}. Intervals can overlap.</p><div class="chart">${entries.map(([label, count]) => `<div class="chart-row"><span>${escapeHtml(label)}</span><div class="chart-track"><div style="width:${count / max * 100}%"></div></div><strong>${count}</strong></div>`).join('')}</div></div>`;
}

// Every output section uses the same panel and header, so they read as one family.
function outputSections() {
  return state.outputs.map(mode => {
    if (mode === 'chart') {
      const request = state.chartRequest ?? { categories: ['instruments', 'verbs', 'targets'], instrument: null };
      return `<section class="panel" id="sec-chart" aria-labelledby="chart-title">
        <div class="panel-head"><h2 id="chart-title">Charts</h2><p>What shows up in ${escapeHtml(state.caseId)}, counted from its annotations.</p></div>
        <div class="panel-body">${request.categories.map(category => chartSection(category, request)).join('')}</div></section>`;
    }
    if (mode === 'quiz') return quizCard(state);
    if (mode === 'studyquiz') return studyQuizCard();
    if (mode === 'model') return modelPanel(state);
    return '';
  }).join('');
}

// Genie-written quiz on the topic the user asked for. Native <details> hides each answer.
function studyQuizCard() {
  const items = state.studyQuiz?.items ?? [];
  const link = item => item.case_id === state.caseId && item.start_sec != null
    ? `<button type="button" class="quiz-watch" data-seek="${item.start_sec}">Show in video (${formatTime(item.start_sec)})</button>` : '';
  return `<section class="panel" id="sec-studyquiz" aria-labelledby="studyquiz-title">
    <div class="panel-head"><h2 id="studyquiz-title">Quiz</h2><p>Written by Lil Doc. Answers marked "general" are not from this video and are not medically reviewed.</p></div>
    <div class="panel-body"><ol class="quiz-list">${items.map(item => `<li class="quiz-item"><p><strong>${escapeHtml(item.question)}</strong></p>
      <details><summary>Show answer</summary><p>${escapeHtml(item.answer)} <em>(${escapeHtml(item.source)})</em></p>
      ${item.explanation ? `<p>${escapeHtml(item.explanation)}</p>` : ''}${link(item)}</details></li>`).join('')}</ol></div></section>`;
}

function chatPanel() {
  // A practice offer carries Start / Cancel until one is chosen; afterwards it shows what happened.
  const offer = (message, index) => {
    const status = message.offer.status;
    const actions = status === 'open'
      ? `<div class="offer-actions" role="group" aria-label="Practice"><button type="button" class="btn-primary offer-start" data-offer-start="${index}">Start practice</button><button type="button" class="btn-secondary" data-offer-cancel="${index}">Cancel</button></div>`
      : `<p class="offer-status">${{ started: 'Started', cancelled: 'Cancelled', expired: 'No longer available' }[status] ?? ''}</p>`;
    return `<div class="msg msg-doc msg-offer">${avatar}<div class="offer"><p>${escapeHtml(message.text)}</p>${actions}</div></div>`;
  };
  const bubble = (message, index) => message.role === 'user'
    ? `<div class="msg msg-user"><button type="button" data-history="${index}" title="Ask again and show matching moments">${escapeHtml(message.text)}</button></div>`
    : message.offer ? offer(message, index) : `<div class="msg msg-doc">${avatar}<p>${escapeHtml(message.text)}</p></div>`;
  const form = placeholder => `<form id="search-form"><label class="sr-only" for="query">${placeholder}</label>
         <input id="query" name="q" value="${escapeHtml(state.draft)}" placeholder="${placeholder}" autocomplete="off" required>
         <button type="submit" aria-label="Send" ${state.loading ? 'disabled' : ''}>→</button></form>`;
  const typing = state.loading
    ? `<div class="msg msg-doc">${avatar}<p><span class="typing" aria-hidden="true"><i></i><i></i><i></i></span><span class="sr-only">Lil Doc is thinking</span></p></div>` : '';
  // An uploaded video cannot be searched, but Lil Doc can still take a practice request for it.
  const compose = state.localVideo
    ? `${form('Ask Lil Doc to practice a step')}<button type="button" class="btn-secondary compose-demo" id="open-sample">Open the indexed demo</button>`
    : `<div class="suggestions" role="group" aria-label="Commands">${COMMANDS.map(command => `<button type="button" data-prompt="${command}">${command}</button>`).join('')}</div>
       ${form('Ask Lil Doc about this video')}`;
  return `<aside class="chat" aria-label="Chat with Lil Doc">
    <div class="chat-head">${avatar}<div><strong>Lil Doc</strong><span>Your surgery study buddy</span></div></div>
    <div class="chat-thread" id="chat-thread" role="log" aria-label="Conversation" tabindex="0">${state.messages.map(bubble).join('')}${typing}</div>
    <div class="chat-compose">${compose}</div>
  </aside>`;
}

function dashboard() {
  if (state.practice) {
    // Practice takeover: compact video and the larger practice model side by side, Lil Doc
    // unchanged on the right. Timeline, charts, quiz and the study model are closed.
    const surface = state.practice.surface;
    return `<main class="dash is-practice"><div class="dash-main practice-main">
      <div class="pr-surface" role="group" aria-label="Show">
        ${['video', 'model'].map(id => `<button type="button" data-surface="${id}" aria-pressed="${surface === id}">${id === 'video' ? 'Video' : 'Practice model'}</button>`).join('')}
      </div>
      <div class="practice-grid" data-surface="${surface}">${videoSection()}${practiceSection()}</div>
    </div>${chatPanel()}</main>`;
  }
  return `<main class="dash"><div class="dash-main">
    ${videoSection()}
    ${timelinePanel(state, STEP_NOTES)}
    ${outputSections()}
  </div>${chatPanel()}</main>`;
}

function videoSection() {
  return `
    <section class="video-section" aria-labelledby="video-title">
      <div class="video-head case-head"><canvas class="sky-dither" data-horizon=".5" data-ceiling="3.2" data-ramp=".45" aria-hidden="true"></canvas><h1 id="video-title">${caseTitle()}</h1>
        <div class="video-actions"><div class="case-switch" role="group" aria-label="Demo video">${['VID01', 'VID02'].map(id => `<button type="button" data-case="${id}" aria-pressed="${state.caseId === id}">${id}</button>`).join('')}</div></div></div>
      <div class="video-frame surgical-media ${state.filterOn ? 'filtered' : ''}">
        ${filterButton()}<video id="player" data-src="${escapeHtml(state.videoUrl ?? '')}" preload="metadata" playsinline ${state.videoUrl ? `src="${escapeHtml(state.videoUrl)}"` : ''}></video>
        <div class="video-fallback" id="video-fallback" ${state.videoError ? '' : 'hidden'}><strong>Video unavailable</strong><span>The video for ${escapeHtml(state.caseId)} has not been downloaded or hosted yet.</span></div>
        <div class="video-controls" role="group" aria-label="Video controls"><button type="button" id="video-play" aria-label="Play video">▶</button><span id="video-time">00:00 / --:--</span><input id="video-seek" type="range" min="0" max="100" value="0" step="0.1" aria-label="Seek video"><button type="button" id="video-mute" aria-label="Mute video">♬</button><input id="video-volume" type="range" min="0" max="1" value="1" step="0.05" aria-label="Volume"><select id="video-speed" aria-label="Playback speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select><button type="button" id="video-fullscreen" aria-label="Enter fullscreen">⛶</button></div>
      </div>
      <div class="overlay-controls" id="overlay-controls"></div>
      ${state.localVideo && !state.practice ? '<p class="local-note">Local video playback only. This file has no indexed annotations.</p>' : ''}
    </section>`;
}

function resetCase(caseId, title, videoUrl, localVideo) {
  // A different video ends any practice session and voids offers made for the old one.
  if (state.practice) endPractice({ quiet: true });
  disposePreload();
  for (const message of state.messages) if (message.offer?.status === 'open') message.offer.status = 'expired';
  state.upload = null;
  Object.assign(state, {
    page: 'dash', caseId, title, videoUrl, localVideo, filterOn: true, videoError: false, pendingSeek: null, duration: 0,
    outputs: [], results: [], queryLabel: '', steps: null, stepsError: false, timeline: null, quiz: null,
    quizAnswers: {}, quizSubmitted: false, chartRequest: null, actionRows: [], error: '', loading: false,
  });
}
function openSample(seek = null, query = '/timestamp clipper') {
  resetCase('VID01', 'VID01 · Cholecystectomy', videoForCase('VID01'), false);
  state.pendingSeek = seek;
  state.messages = [{ role: 'doc', text: greeting('VID01') }];
  render();
  loadSteps();
  if (seek != null) runSearch(query);
}
function openFile(file) {
  if (!file) return;
  if (!['video/mp4', 'video/quicktime'].includes(file.type) && !/\.(mp4|mov)$/i.test(file.name)) {
    state.error = 'Unsupported file. Choose an MP4 or MOV video.'; render(); return;
  }
  if (state.localUrl) URL.revokeObjectURL(state.localUrl);
  state.localUrl = URL.createObjectURL(file);
  resetCase('Local video', file.name, state.localUrl, true);
  state.messages = [{ role: 'doc', text: localVideoNote }];
  // Fingerprint the upload off the main thread, to see whether it is the demonstration asset
  // an exercise is bound to. Nothing changes on the page except one note when it matches.
  const upload = { promise: null, fingerprint: null, error: false };
  upload.promise = fingerprintFile(file)
    .then(fingerprint => {
      upload.fingerprint = fingerprint;
      const exercise = EXERCISES.find(item => matchesFingerprint(item, fingerprint));
      if (exercise && state.upload === upload) { state.messages.push({ role: 'doc', text: localDemoRecognized(exercise.eligible_video.case_id) }); render(); }
    })
    .catch(() => { upload.error = true; });
  state.upload = upload;
  render();
}

// --- practice ------------------------------------------------------------------

function videoFacts() {
  const video = document.querySelector('#player');
  return {
    localVideo: state.localVideo, caseId: state.caseId, videoError: state.videoError,
    fingerprint: state.upload?.fingerprint ?? null, fingerprintError: Boolean(state.upload?.error),
    duration: Number.isFinite(video?.duration) ? video.duration : state.duration,
  };
}

// Lil Doc's answer to a practice request: an offer with Start / Cancel, or why it cannot start.
// Nothing on the page changes until Start.
async function answerPractice(intent) {
  const exercise = findExercise(intent.step_key);
  const available = EXERCISES.map(item => STEP_LABELS[item.step_key]).join(' and ');
  if (!exercise) return { role: 'doc', text: practiceNotAuthored(STEP_LABELS[intent.step_key] ?? 'that step', available) };
  if (state.localVideo && state.upload && !state.upload.fingerprint && !state.upload.error) await state.upload.promise.catch(() => {});
  const verdict = checkEligibility(exercise, videoFacts());
  if (!verdict.ok) return { role: 'doc', text: verdict.message };
  preloadPractice(exercise); // load the model and tools while the resident decides
  return { role: 'doc', text: practiceOffer(exercise), offer: { exerciseId: exercise.exercise_id, status: 'open' } };
}

function beginPractice(index) {
  const message = state.messages[index];
  const exercise = message?.offer && exerciseById(message.offer.exerciseId);
  if (!exercise || message.offer.status !== 'open') return;
  const verdict = checkEligibility(exercise, videoFacts());
  if (!verdict.ok) { message.offer.status = 'expired'; state.messages.push({ role: 'doc', text: verdict.message }); render(); return; }
  message.offer.status = 'started';
  // Take over the workspace: close every assistant-opened panel and discard its state.
  Object.assign(state, { outputs: [], results: [], queryLabel: '', quiz: null, quizAnswers: {}, quizSubmitted: false, chartRequest: null, studyQuiz: null, actionRows: [] });
  state.practice = { exerciseId: exercise.exercise_id, surface: 'model' };
  startPractice(exercise, { seek: practiceSeek, playRange: practicePlayRange, onExit: () => endPractice() });
  state.messages.push({ role: 'doc', text: practiceStarted });
  render();
  document.querySelector('#pr-stage')?.focus({ preventScroll: true });
}

function cancelPractice(index) {
  const message = state.messages[index];
  if (message?.offer?.status !== 'open') return;
  message.offer.status = 'cancelled';
  disposePreload();
  state.messages.push({ role: 'doc', text: practiceCancelled });
  render();
}

// Exit or close: discard the session and restore the ordinary page with the video still loaded.
function endPractice({ quiet = false } = {}) {
  disposePractice();
  state.practice = null;
  practiceStopAt = null;
  if (!quiet) render();
}

// Practice seeks pause at the reference moment, so normal playback never moves the exercise on.
function practiceSeek(seconds) {
  practiceStopAt = null;
  const video = document.querySelector('#player');
  if (!video) return;
  state.pendingSeek = seconds;
  if (video.readyState >= 1) video.currentTime = seconds;
  video.pause();
  updateControls();
}
function practicePlayRange(start, end) {
  practiceSeek(start);
  practiceStopAt = end;
  document.querySelector('#player')?.play().catch(() => {});
}
async function loadSteps() {
  const caseId = state.caseId;
  try {
    const steps = await getSteps(caseId);
    if (state.caseId === caseId) { state.steps = steps; state.stepsError = !steps; render(); }
  } catch { if (state.caseId === caseId) { state.stepsError = true; render(); } }
}

// --- video -------------------------------------------------------------------

function updateControls() {
  const video = document.querySelector('#player');
  if (!video) return;
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const time = document.querySelector('#video-time');
  const seek = document.querySelector('#video-seek');
  const play = document.querySelector('#video-play');
  const mute = document.querySelector('#video-mute');
  const volume = document.querySelector('#video-volume');
  const speed = document.querySelector('#video-speed');
  if (time) time.textContent = `${formatTime(video.currentTime)} / ${duration ? formatTime(duration) : '--:--'}`;
  if (seek) { seek.max = String(duration || 100); seek.value = String(video.currentTime || 0); }
  if (play) { play.textContent = video.paused ? '▶' : '❚❚'; play.setAttribute('aria-label', video.paused ? 'Play video' : 'Pause video'); }
  if (volume) volume.value = String(video.volume);
  if (mute) { mute.textContent = video.muted ? '♪̸' : '♬'; mute.setAttribute('aria-label', video.muted ? 'Unmute video' : 'Mute video'); }
  if (speed) speed.value = String(video.playbackRate);
  timelineTick(video.currentTime, duration);
  if (state.practice) practiceTick(video.currentTime, duration);
  else modelTick(state.steps?.steps, playTime());
}
// The time the page should treat as "now": a seek that has not landed yet wins, so the steps
// and the 3D model still move when the video file is missing or still loading.
function playTime() {
  return state.pendingSeek ?? document.querySelector('#player')?.currentTime ?? 0;
}
// Listeners on the <video> itself are attached once, because the element survives redraws.
function wireVideo(video) {
  if (!video || video.dataset.wired) return;
  video.dataset.wired = 'true';
  ['timeupdate', 'play', 'pause', 'volumechange', 'ratechange', 'seeked'].forEach(name => video.addEventListener(name, updateControls));
  // A Practice reference clip stops at its end.
  video.addEventListener('timeupdate', () => {
    if (practiceStopAt != null && video.currentTime >= practiceStopAt) { practiceStopAt = null; video.pause(); }
  });
  video.addEventListener('seeking', () => { if (practiceStopAt != null && state.pendingSeek == null) practiceStopAt = null; });
  video.addEventListener('seeked', () => {
    if (state.pendingSeek != null && Math.abs(video.currentTime - state.pendingSeek) < 1) state.pendingSeek = null;
  });
  video.addEventListener('error', () => { state.videoError = true; const fallback = document.querySelector('#video-fallback'); if (fallback) fallback.hidden = false; });
  video.addEventListener('loadedmetadata', () => {
    state.duration = video.duration;
    if (state.pendingSeek != null) video.currentTime = state.pendingSeek;
    updateControls();
  });
}
// reveal: scroll the video into view. keepPaused: do not start a paused video (step arrows).
function seekTo(seconds, { reveal = true, keepPaused = false } = {}) {
  const video = document.querySelector('#player');
  if (!video) return;
  state.pendingSeek = seconds;
  if (video.readyState >= 1) video.currentTime = seconds;
  if (!keepPaused || !video.paused) video.play().catch(() => {});
  if (reveal) document.querySelector('.video-frame')?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
  updateControls();
}
// Move one step back (-1) or forward (+1) from the step being played.
function stepBy(direction) {
  const steps = state.steps?.steps ?? [];
  const next = steps[stepIndexAt(steps, playTime()) + direction];
  if (next) seekTo(next.start_sec, { reveal: false, keepPaused: true });
}
function syncFullscreenButton() {
  const button = document.querySelector('#video-fullscreen');
  if (!button) return;
  const expanded = Boolean(document.fullscreenElement);
  button.textContent = expanded ? '⊟' : '⛶';
  button.setAttribute('aria-label', expanded ? 'Exit fullscreen' : 'Enter fullscreen');
  button.title = expanded ? 'Exit fullscreen' : 'Enter fullscreen';
}
document.addEventListener('fullscreenchange', syncFullscreenButton);

// --- events ------------------------------------------------------------------

// Minimize buttons on the case-page panels (timeline, 3D model, quiz, charts). Toggling
// only flips a class, so the video and the 3D viewer keep running underneath.
function wirePanels() {
  document.querySelectorAll('.dash .panel[id]').forEach(panel => {
    const head = panel.querySelector('.panel-head');
    if (!head) return;
    const title = panel.querySelector('h2')?.textContent ?? 'section';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'panel-min';
    const sync = () => {
      const min = state.minimized.has(panel.id);
      panel.classList.toggle('is-min', min);
      button.textContent = min ? '+' : '−';
      button.setAttribute('aria-expanded', String(!min));
      button.setAttribute('aria-label', `${min ? 'Expand' : 'Minimize'} ${title}`);
      button.title = min ? 'Expand' : 'Minimize';
    };
    button.addEventListener('click', () => {
      if (!state.minimized.delete(panel.id)) state.minimized.add(panel.id);
      sync();
    });
    head.append(button);
    sync();
    // Panels Lil Doc opened can also be closed; only Lil Doc brings them back.
    const mode = CLOSABLE[panel.id];
    if (!mode) return;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'panel-close';
    close.textContent = '×';
    close.title = 'Close';
    close.setAttribute('aria-label', `Close ${title}`);
    close.addEventListener('click', () => closePanel(mode));
    head.append(close);
  });
}
const CLOSABLE = { 'sec-chart': 'chart', 'sec-quiz': 'quiz', 'sec-studyquiz': 'studyquiz', 'sec-model': 'model' };
// Closing discards the panel's temporary state and restores the ordinary layout.
function closePanel(mode) {
  state.outputs = state.outputs.filter(item => item !== mode);
  state.minimized.delete(`sec-${mode}`);
  if (mode === 'quiz') Object.assign(state, { quiz: null, quizAnswers: {}, quizSubmitted: false });
  if (mode === 'studyquiz') state.studyQuiz = null;
  if (mode === 'chart') Object.assign(state, { chartRequest: null, actionRows: [] });
  render(); // render() disposes the study model once it is no longer listed
}

function wire() {
  wirePanels();
  const goHome = () => { state.page = 'home'; state.error = ''; render(); };
  document.querySelector('#home-link')?.addEventListener('click', goHome);
  document.querySelector('#open-local')?.addEventListener('click', () => document.querySelector('#file-input')?.click());
  document.querySelectorAll('[data-filter-toggle]').forEach(button => button.addEventListener('click', () => {
    state.filterOn = !state.filterOn;
    document.querySelectorAll('.surgical-media').forEach(media => media.classList.toggle('filtered', state.filterOn));
    document.querySelector('.landing')?.classList.toggle('is-blurred', state.filterOn);
    document.querySelectorAll('[data-filter-toggle]').forEach(toggle => {
      toggle.innerHTML = state.filterOn ? EYE_SLASH : EYE_OPEN;
      toggle.setAttribute('aria-pressed', String(state.filterOn));
      toggle.setAttribute('title', eyeTitle());
    });
  }));

  // Home
  const preview = document.querySelector('.preview-video video');
  preview?.addEventListener('loadedmetadata', () => { preview.currentTime = DEMO_SEEK; });
  document.querySelector('#sample')?.addEventListener('click', () => openSample());
  document.querySelector('#sample-event')?.addEventListener('click', () => openSample(DEMO_SEEK, DEMO_QUESTION));
  // Hero search: typing opens VID01 and asks Lil Doc. The prefilled question also seeks to its moment.
  document.querySelector('#hero-search')?.addEventListener('submit', event => {
    event.preventDefault();
    const query = event.target.elements.q.value.trim();
    if (!query) return;
    if (query.toLowerCase() === DEMO_QUESTION.toLowerCase()) { openSample(DEMO_SEEK, DEMO_QUESTION); return; }
    openSample();
    runSearch(query);
  });
  document.querySelector('#open-sample')?.addEventListener('click', () => openSample());
  document.querySelectorAll('[data-open-sample]').forEach(button => button.addEventListener('click', () => {
    openSample();
    if (button.dataset.command) runSearch(button.dataset.command);
  }));
  const zone = document.querySelector('#drop-zone');
  const fileInput = document.querySelector('#file-input');
  zone?.addEventListener('click', () => fileInput.click());
  zone?.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInput.click(); } });
  zone?.addEventListener('dragover', event => { event.preventDefault(); zone.classList.add('drag'); });
  zone?.addEventListener('dragleave', () => zone.classList.remove('drag'));
  zone?.addEventListener('drop', event => { event.preventDefault(); zone.classList.remove('drag'); openFile(event.dataTransfer.files[0]); });
  fileInput?.addEventListener('change', () => openFile(fileInput.files[0]));

  // Video switcher
  document.querySelectorAll('[data-case]').forEach(el => el.addEventListener('click', () => {
    const next = el.dataset.case;
    if (next === state.caseId) return;
    resetCase(next, `${next} · Cholecystectomy`, videoForCase(next), false);
    state.messages.push({ role: 'doc', text: switched(next) });
    render();
    loadSteps();
  }));

  // Chat composer: command chips toggle a slash command in the input.
  const queryInput = document.querySelector('#query');
  const typed = () => new Set(queryInput?.value.match(/\/(?:timestamp|quiz|chart|model)\b/g) ?? []);
  const syncCommands = () => {
    const selected = typed();
    document.querySelectorAll('[data-prompt]').forEach(button => {
      const active = selected.has(button.dataset.prompt);
      button.classList.toggle('selected', active);
      button.setAttribute('aria-pressed', String(active));
    });
  };
  queryInput?.addEventListener('input', () => { state.draft = queryInput.value; syncCommands(); });
  syncCommands();
  document.querySelector('#search-form')?.addEventListener('submit', event => {
    event.preventDefault();
    const query = queryInput.value;
    queryInput.value = ''; state.draft = '';
    runSearch(query);
  });
  document.querySelectorAll('[data-prompt]').forEach(el => el.addEventListener('click', () => {
    if (!queryInput) return;
    const command = el.dataset.prompt;
    if (!typed().has(command)) {
      const current = queryInput.value.trim();
      queryInput.value = current ? `${current} ${command}` : command;
      state.draft = queryInput.value;
      syncCommands();
    }
    queryInput.focus();
    queryInput.setSelectionRange(queryInput.value.length, queryInput.value.length);
  }));
  document.querySelectorAll('[data-offer-start]').forEach(el => el.addEventListener('click', () => beginPractice(Number(el.dataset.offerStart))));
  document.querySelectorAll('[data-offer-cancel]').forEach(el => el.addEventListener('click', () => cancelPractice(Number(el.dataset.offerCancel))));
  // Narrow screens show the video or the practice model; both stay mounted.
  document.querySelectorAll('[data-surface]').forEach(el => el.addEventListener('click', () => {
    if (!state.practice) return;
    state.practice.surface = el.dataset.surface;
    document.querySelector('.practice-grid')?.setAttribute('data-surface', state.practice.surface);
    document.querySelectorAll('[data-surface]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.surface === state.practice.surface)));
  }));
  document.querySelectorAll('[data-history]').forEach(el => el.addEventListener('click', () => {
    const question = state.messages[Number(el.dataset.history)]?.text;
    if (question) runSearch(question);
  }));

  // Timeline, quiz and anything else that jumps the video
  document.querySelectorAll('[data-seek]').forEach(el => el.addEventListener('click', () => seekTo(Number(el.dataset.seek))));
  document.querySelectorAll('[data-step-nav]').forEach(el => el.addEventListener('click', () => stepBy(Number(el.dataset.stepNav))));
  document.querySelector('#clear-search')?.addEventListener('click', () => {
    state.results = []; state.queryLabel = ''; state.outputs = state.outputs.filter(mode => mode !== 'timestamp');
    render();
  });
  wireQuiz(state, { render, newQuiz: () => runSearch('/quiz') });
  document.querySelectorAll('[data-watch]').forEach(el => el.addEventListener('click', () => runSearch(`/timestamp ${el.dataset.watch}`, { keepOutputs: true })));

  // Video controls are redrawn each time; they act on whichever <video> is in the page.
  const video = document.querySelector('#player');
  wireVideo(video);
  if (video) disposeOverlays = mountOverlays({ video, host: video.parentElement, controls: document.querySelector('#overlay-controls'), caseId: state.caseId, assetId: state.localVideo ? null : videoAssetForCase(state.caseId), enabled: boxesEnabled, onToggle: value => { boxesEnabled = value; } });
  document.querySelector('#video-play')?.addEventListener('click', () => { if (video.paused) video.play().catch(() => {}); else video.pause(); });
  document.querySelector('#video-seek')?.addEventListener('input', event => { if (video?.readyState >= 1) video.currentTime = Number(event.target.value); });
  document.querySelector('#video-mute')?.addEventListener('click', () => { video.muted = !video.muted; });
  document.querySelector('#video-volume')?.addEventListener('input', event => { video.volume = Number(event.target.value); video.muted = false; });
  document.querySelector('#video-speed')?.addEventListener('change', event => { video.playbackRate = Number(event.target.value); });
  document.querySelector('#video-fullscreen')?.addEventListener('click', async () => {
    const frame = document.querySelector('.video-frame');
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (frame?.requestFullscreen) await frame.requestFullscreen();
    syncFullscreenButton();
  });
  syncFullscreenButton();
  if (video && state.pendingSeek != null && video.readyState >= 1 && !video.seeking) video.currentTime = state.pendingSeek;
  if (state.practice) mountPractice();
  else mountModel({ steps: state.steps?.steps, time: playTime() });
  updateControls();
}

// Bring a section to the top of the view. The smooth scroll can be cut short when the page
// is still settling after a redraw, so check shortly after and jump there if it did not
// arrive. The jump is skipped if the user has scrolled in the meantime.
function scrollToSection(selector) {
  const go = behavior => document.querySelector(selector)?.scrollIntoView({ behavior, block: 'start' });
  let userScrolled = false;
  const mark = () => { userScrolled = true; };
  ['wheel', 'touchmove', 'keydown'].forEach(name => window.addEventListener(name, mark, { once: true, passive: true }));
  requestAnimationFrame(() => requestAnimationFrame(() => {
    go(reducedMotion() ? 'auto' : 'smooth');
    setTimeout(() => {
      ['wheel', 'touchmove', 'keydown'].forEach(name => window.removeEventListener(name, mark));
      const section = document.querySelector(selector);
      if (!section || userScrolled) return;
      const offset = section.getBoundingClientRect().top - parseFloat(getComputedStyle(section).scrollMarginTop || '0');
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      if (Math.abs(offset) > 24 && !atBottom) go('auto');
    }, 900);
  }));
}

// --- asking Lil Doc ----------------------------------------------------------

const SLASH_COMMAND = /(^|\s)\/(timestamp|quiz|chart|model)\b/i;

// Turn a POST /chat response into the same plan shape /interpret returns, with the data
// attached, so the rest of runSearch draws both the same way.
function planFromChat(chat, caseId) {
  const plan = { interpreter: chat.router === 'genie' ? 'genie' : 'rules', message: chat.reply };
  if (chat.action === 'search') {
    const labels = [...new Set(chat.data.results.map(hit => hit.label))];
    plan.actions = labels.map((label, index) => ({ type: 'timestamp', label, case_id: caseId, results: index === 0 ? chat.data.results : [] }));
  } else if (chat.action === 'model') {
    plan.actions = [{ type: 'model', step_key: chat.data?.step_key ?? null }];
  } else {
    plan.actions = [{ type: chat.action === 'timeline' ? 'chart' : 'quiz' }];
  }
  return plan;
}

// keepOutputs: add the new result to what is already on the page (used by the quiz's
// "watch" links, so the graded quiz stays where it is).
async function runSearch(raw, { keepOutputs = false } = {}) {
  const query = String(raw ?? '').trim();
  if (!query || state.loading) return;
  // Practice requests are answered locally (no backend), on hosted and uploaded videos alike.
  const practiceIntent = parsePracticeIntent(query);
  if (practiceIntent || state.localVideo || state.practice) {
    const caseId = state.caseId, upload = state.upload;
    state.messages.push({ role: 'user', text: query });
    state.loading = Boolean(practiceIntent);
    render();
    const answer = practiceIntent ? await answerPractice(practiceIntent).catch(() => ({ role: 'doc', text: errorReply }))
      : { role: 'doc', text: state.practice ? practiceBusy : localOnlyPractice };
    if (state.caseId !== caseId || state.upload !== upload) return;
    state.loading = false;
    state.messages.push(answer);
    render();
    return;
  }
  const caseId = state.caseId;
  const local = detectRequest(query);
  state.loading = true; state.error = '';
  state.messages.push({ role: 'user', text: query });
  render();

  let answer = errorReply;
  let target = null;
  try {
    // Free-typed messages go to POST /chat: the backend picks the feature and returns its
    // data in one call. Slash commands, and anything /chat cannot take (older backend,
    // network error, fixture mode), use /interpret, which falls back to the local rules.
    const chat = SLASH_COMMAND.test(query) ? null : await chatMessage(query, caseId, state.duration).catch(() => null);
    if (state.caseId !== caseId) return;
    if (chat?.action === 'study_quiz') {
      Object.assign(state, { studyQuiz: chat.data, outputs: ['studyquiz'], results: [], queryLabel: '' });
      answer = chat.reply;
      target = '#sec-studyquiz';
      return;
    }
    if (chat && (chat.action === 'none' || chat.action === 'answer' || (chat.action === 'search' && !chat.data.results.length))) {
      // Nothing to draw: a declined question, a Genie answer in words, or no matches.
      answer = chat.router === 'genie' ? `Here’s what I dug up: ${chat.reply}` : chat.reply;
      return;
    }
    const plan = chat ? planFromChat(chat, caseId) : await interpretQuery(query, caseId).catch(() => null);
    if (state.caseId !== caseId) return;
    const actions = plan?.actions ?? local.modes.map(type => ({ type, label: type === 'timestamp' ? local.label : null }));
    const modes = [...new Set(actions.map(action => action.type))];
    if (local.modes.includes('chart') && !modes.includes('chart')) modes.push('chart');
    const stamps = actions.filter(action => action.type === 'timestamp');
    const labels = [...new Set(stamps.map(action => action.label).filter(Boolean))];
    const chartRequest = modes.includes('chart') ? parseChartRequest(query) : null;
    if (chartRequest && !chartRequest.categories.length) chartRequest.categories.push('instruments', 'verbs', 'targets');

    const lookups = stamps.map(async action => action.results
      ?? (action.label ? (await searchClips(action.label)).filter(hit => hit.case_id === (action.case_id ?? caseId)) : []));
    const extra = [];
    let timeline = chat?.action === 'timeline' && chat.data.case_id === caseId ? chat.data : state.timeline;
    let quiz = chat?.action === 'quiz' ? chat.data : keepOutputs ? state.quiz : null;
    if (chartRequest?.categories.includes('instruments') && !timeline) extra.push((async () => { timeline = await getTimeline(caseId); })());
    if (modes.includes('quiz') && !quiz) extra.push((async () => { quiz = await getQuiz(); })());
    const [found] = await Promise.all([Promise.all(lookups), ...extra]);
    if (state.caseId !== caseId) return;

    const hits = found.flat().filter(hit => hit.case_id === caseId).sort((a, b) => a.start_sec - b.start_sec);
    const kept = keepOutputs ? state.outputs.filter(mode => !modes.includes(mode)) : [];
    if (modes.includes('quiz') && quiz !== state.quiz) { state.quizAnswers = {}; state.quizSubmitted = false; }
    Object.assign(state, {
      outputs: [...modes, ...kept], timeline, quiz,
      chartRequest: chartRequest ?? (kept.includes('chart') ? state.chartRequest : null),
      actionRows: modes.includes('chart') || kept.includes('chart') ? getActionRows(caseId) : [],
    });
    if (modes.includes('timestamp')) { state.results = hits; state.queryLabel = labels.join(' and '); }
    else if (!keepOutputs) { state.results = []; state.queryLabel = ''; }
    const genieText = plan?.interpreter === 'genie' ? (plan.message ?? '').replaceAll('**', '') : '';
    answer = reply({ modes, labels, hits, caseId, genieText });
    // "Show the clipping step in 3D": move the video, and so the model, to that step.
    const stepKey = actions.find(action => action.type === 'model')?.step_key;
    const named = stepKey && state.steps?.steps?.find(step => step.key === stepKey);
    if (named) { seekTo(named.start_sec, { reveal: false, keepPaused: true }); answer = answer.replace('Here’s the 3D model.', `Here’s step ${named.order}, ${named.label.toLowerCase()}, in 3D.`); }
    target = modes[0] === 'timestamp' ? '#sec-timeline' : `#sec-${modes[0]}`;
  } catch (error) {
    state.error = error.message;
  } finally {
    if (state.caseId === caseId) {
      state.loading = false;
      state.messages.push({ role: 'doc', text: answer });
      if (target) state.minimized.delete(target.slice(1)); // a new result opens its panel
      render();
      // Bring the new section into view; the chat stays docked on the right.
      if (target) scrollToSection(target);
    }
  }
}

render();
