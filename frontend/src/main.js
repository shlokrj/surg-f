import './style.css';
import { searchClips, getTimeline, getQuiz, getSteps, interpretQuery, getActionRows, instrumentLabels } from './api.js';
import { quizCard, wireQuiz } from './quiz.js';
import { timelinePanel, timelineTick } from './timeline.js';
import { avatar, greeting, switched, localVideoNote, errorReply, reply, STEP_NOTES } from './lildoc.js';
import { videoForCase, videoAssetForCase } from './cases.js';
import { mountOverlays } from './overlays.js';
let disposeOverlays = () => {};
let boxesEnabled = false;

const app = document.querySelector('#app');
const state = {
  page: 'home', caseId: 'VID01', title: 'VID01 · Cholecystectomy', videoUrl: videoForCase('VID01'),
  localVideo: false, localUrl: null, filterOn: true, videoError: false, pendingSeek: null, duration: 0,
  draft: '', loading: false, messages: [],
  outputs: [], results: [], queryLabel: '', steps: null, stepsError: false,
  timeline: null, quiz: null, quizAnswers: {}, quizSubmitted: false, chartRequest: null, actionRows: [],
  error: '',
};
const COMMANDS = ['/timestamp', '/quiz', '/chart', '/model'];
const formatTime = seconds => {
  const n = Math.floor(Number(seconds) || 0);
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
};
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
const logo = `<span class="wordmark" aria-label="Surg+F">Surg<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10" cy="10" r="7"/><path d="m15.3 15.3 6 6M10 6v8M6 10h8"/></svg>F</span>`;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// The whole page is redrawn from state. The <video> element is carried over to the new
// markup when the same video stays open, so playback never restarts on a redraw.
function render() {
  disposeOverlays();
  const input = document.querySelector('#query');
  if (input) state.draft = input.value;
  const hadFocus = input && document.activeElement === input;
  const oldVideo = document.querySelector('#player');
  const keepVideo = state.page === 'dash' && oldVideo?.dataset.src === state.videoUrl;
  const wasPlaying = keepVideo && !oldVideo.paused;

  app.innerHTML = `<header class="topbar"><button type="button" class="logo-link" id="home-link" aria-label="Surg+F home">${logo}</button>
    <span class="top-spacer"></span>${state.page === 'dash' ? '<button type="button" class="top-action" id="change-video">Choose another video</button>' : ''}</header>
    ${state.page === 'home' ? home() : dashboard()}`;

  if (keepVideo) {
    document.querySelector('#player').replaceWith(oldVideo);
    if (wasPlaying && oldVideo.paused) oldVideo.play().catch(() => {});
  }
  wire();
  if (hadFocus) {
    const next = document.querySelector('#query');
    next?.focus({ preventScroll: true });
    next?.setSelectionRange(next.value.length, next.value.length);
  }
  const thread = document.querySelector('#chat-thread');
  if (thread) thread.scrollTop = thread.scrollHeight;
}

function filterButton() {
  return `<button type="button" class="filter-toggle" data-filter-toggle aria-pressed="${state.filterOn}" aria-label="Content filter ${state.filterOn ? 'on' : 'off'}">Content filter: ${state.filterOn ? 'On' : 'Off'}</button>`;
}

function home() {
  return `<main class="home"><div class="hero"><div class="hero-logo">${logo}</div>
    <h1>Find the moments that <em>matter.</em></h1>
    <p>Search annotated surgical footage by instrument and jump directly to matching moments.</p>
    <div class="upload-card" id="drop-zone" tabindex="0" role="button" aria-label="Open a local MP4 or MOV for playback only">
      <div class="upload-icon" aria-hidden="true">↑</div><strong>Open your own video</strong><span>Play a local MP4 or MOV. Search works on the indexed demo cases only.</span>
    </div><input type="file" id="file-input" accept="video/mp4,video/quicktime,.mp4,.mov" hidden>
    ${state.error ? `<p class="home-error" role="alert">${escapeHtml(state.error)}</p>` : ''}
    </div><aside class="sample-preview"><div class="preview-top"><span class="preview-label">Demo case</span>${filterButton()}</div>
      <div class="preview-video surgical-media ${state.filterOn ? 'filtered' : ''}"><video src="${escapeHtml(videoForCase('VID01'))}" muted playsinline preload="auto" aria-label="Preview of VID01 surgery footage"></video></div>
      <div class="preview-details"><h2>Explore a real annotated case</h2>
        <p>VID01 is a laparoscopic gallbladder removal. Follow the steps of the operation, find when each instrument is used, and test yourself with a quiz.</p>
        <button type="button" id="sample" class="btn-primary">View demo</button>
        <button type="button" id="sample-event" class="preview-event-link">View clipper event at 11:14 <span aria-hidden="true">↗</span></button></div>
    </aside></main>`;
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
  const label = instrumentLabels.find(item => new RegExp(`\\b${item}\\b`).test(lower));
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
    if (mode === 'model') {
      return `<section class="panel" id="sec-model" aria-labelledby="model-title">
        <div class="panel-head"><h2 id="model-title">3D model</h2><p>A three-dimensional view of the anatomy in this operation.</p></div>
        <div class="panel-body"><p class="panel-note">This video has no linked 3D model yet. A model and a mapping from its parts to moments in the video are needed before this view can show anything.</p></div></section>`;
    }
    return '';
  }).join('');
}

function chatPanel() {
  const bubble = (message, index) => message.role === 'user'
    ? `<div class="msg msg-user"><button type="button" data-history="${index}" title="Ask again and show matching moments">${escapeHtml(message.text)}</button></div>`
    : `<div class="msg msg-doc">${avatar}<p>${escapeHtml(message.text)}</p></div>`;
  const typing = state.loading
    ? `<div class="msg msg-doc">${avatar}<p><span class="typing" aria-hidden="true"><i></i><i></i><i></i></span><span class="sr-only">Lil Doc is thinking</span></p></div>` : '';
  const compose = state.localVideo
    ? '<button type="button" class="btn-primary" id="open-sample">Open the indexed demo</button>'
    : `<div class="suggestions" role="group" aria-label="Commands">${COMMANDS.map(command => `<button type="button" data-prompt="${command}">${command}</button>`).join('')}</div>
       <form id="search-form"><label class="sr-only" for="query">Ask Lil Doc about this video</label>
         <input id="query" name="q" value="${escapeHtml(state.draft)}" placeholder="Ask Lil Doc about this video" autocomplete="off" required>
         <button type="submit" aria-label="Send" ${state.loading ? 'disabled' : ''}>→</button></form>`;
  return `<aside class="chat" aria-label="Chat with Lil Doc">
    <div class="chat-head">${avatar}<div><strong>Lil Doc</strong><span>Your surgery study buddy</span></div></div>
    <div class="chat-thread" id="chat-thread" role="log" aria-label="Conversation" tabindex="0">${state.messages.map(bubble).join('')}${typing}</div>
    <div class="chat-compose">${compose}</div>
  </aside>`;
}

function dashboard() {
  return `<main class="dash"><div class="dash-main">
    <section class="video-section" aria-labelledby="video-title">
      <div class="video-head"><h1 id="video-title">${escapeHtml(state.title)}</h1>
        <div class="video-actions">${filterButton()}<div class="case-switch" role="group" aria-label="Demo video">${['VID01', 'VID02'].map(id => `<button type="button" data-case="${id}" aria-pressed="${state.caseId === id}">${id}</button>`).join('')}</div></div></div>
      <div class="video-frame surgical-media ${state.filterOn ? 'filtered' : ''}">
        <video id="player" data-src="${escapeHtml(state.videoUrl ?? '')}" preload="metadata" playsinline ${state.videoUrl ? `src="${escapeHtml(state.videoUrl)}"` : ''}></video>
        <div class="video-fallback" id="video-fallback" ${state.videoError ? '' : 'hidden'}><strong>Video unavailable</strong><span>The video for ${escapeHtml(state.caseId)} has not been downloaded or hosted yet.</span></div>
        <div class="video-controls" role="group" aria-label="Video controls"><button type="button" id="video-play" aria-label="Play video">▶</button><span id="video-time">00:00 / --:--</span><input id="video-seek" type="range" min="0" max="100" value="0" step="0.1" aria-label="Seek video"><button type="button" id="video-mute" aria-label="Mute video">♬</button><input id="video-volume" type="range" min="0" max="1" value="1" step="0.05" aria-label="Volume"><select id="video-speed" aria-label="Playback speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select><button type="button" id="video-fullscreen" aria-label="Enter fullscreen">⛶</button></div>
      </div>
      <div class="overlay-controls" id="overlay-controls"></div>
      ${state.localVideo ? '<p class="local-note">Local video playback only. This file has no indexed annotations.</p>' : ''}
    </section>
    ${timelinePanel(state, STEP_NOTES)}
    ${outputSections()}
  </div>${chatPanel()}</main>`;
}

function resetCase(caseId, title, videoUrl, localVideo) {
  Object.assign(state, {
    page: 'dash', caseId, title, videoUrl, localVideo, filterOn: true, videoError: false, pendingSeek: null, duration: 0,
    outputs: [], results: [], queryLabel: '', steps: null, stepsError: false, timeline: null, quiz: null,
    quizAnswers: {}, quizSubmitted: false, chartRequest: null, actionRows: [], error: '', loading: false,
  });
}
function openSample(seek = null) {
  resetCase('VID01', 'VID01 · Cholecystectomy', videoForCase('VID01'), false);
  state.pendingSeek = seek;
  state.messages = [{ role: 'doc', text: greeting('VID01') }];
  render();
  loadSteps();
  if (seek != null) runSearch('/timestamp clipper');
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
  render();
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
}
// Listeners on the <video> itself are attached once, because the element survives redraws.
function wireVideo(video) {
  if (!video || video.dataset.wired) return;
  video.dataset.wired = 'true';
  ['timeupdate', 'play', 'pause', 'volumechange', 'ratechange', 'seeked'].forEach(name => video.addEventListener(name, updateControls));
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
function seekTo(seconds) {
  const video = document.querySelector('#player');
  if (!video) return;
  state.pendingSeek = seconds;
  if (video.readyState >= 1) video.currentTime = seconds;
  video.play().catch(() => {});
  document.querySelector('.video-frame')?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
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

function wire() {
  const goHome = () => { state.page = 'home'; state.error = ''; render(); };
  document.querySelector('#home-link')?.addEventListener('click', goHome);
  document.querySelector('#change-video')?.addEventListener('click', goHome);
  document.querySelectorAll('[data-filter-toggle]').forEach(button => button.addEventListener('click', () => {
    state.filterOn = !state.filterOn;
    document.querySelectorAll('.surgical-media').forEach(media => media.classList.toggle('filtered', state.filterOn));
    document.querySelectorAll('[data-filter-toggle]').forEach(toggle => {
      toggle.textContent = `Content filter: ${state.filterOn ? 'On' : 'Off'}`;
      toggle.setAttribute('aria-pressed', String(state.filterOn));
      toggle.setAttribute('aria-label', `Content filter ${state.filterOn ? 'on' : 'off'}`);
    });
  }));

  // Home
  const preview = document.querySelector('.preview-video video');
  preview?.addEventListener('loadedmetadata', () => { preview.currentTime = 674; });
  document.querySelector('#sample')?.addEventListener('click', () => openSample());
  document.querySelector('#sample-event')?.addEventListener('click', () => openSample(674));
  document.querySelector('#open-sample')?.addEventListener('click', () => openSample());
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
  document.querySelectorAll('[data-history]').forEach(el => el.addEventListener('click', () => {
    const question = state.messages[Number(el.dataset.history)]?.text;
    if (question) runSearch(question);
  }));

  // Timeline, quiz and anything else that jumps the video
  document.querySelectorAll('[data-seek]').forEach(el => el.addEventListener('click', () => seekTo(Number(el.dataset.seek))));
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

// keepOutputs: add the new result to what is already on the page (used by the quiz's
// "watch" links, so the graded quiz stays where it is).
async function runSearch(raw, { keepOutputs = false } = {}) {
  const query = String(raw ?? '').trim();
  if (!query || state.localVideo || state.loading) return;
  const caseId = state.caseId;
  const local = detectRequest(query);
  state.loading = true; state.error = '';
  state.messages.push({ role: 'user', text: query });
  render();

  let answer = errorReply;
  let target = null;
  try {
    // The backend turns the typed text into actions (rules first, Databricks Genie for
    // free-form questions). If it cannot be reached, fall back to the local rules above.
    const plan = await interpretQuery(query, caseId).catch(() => null);
    if (state.caseId !== caseId) return;
    const actions = plan?.actions ?? local.modes.map(type => ({ type, label: type === 'timestamp' ? local.label : null }));
    const modes = [...new Set(actions.map(action => action.type))];
    if (local.modes.includes('chart') && !modes.includes('chart')) modes.push('chart');
    const stamps = actions.filter(action => action.type === 'timestamp');
    const labels = [...new Set(stamps.map(action => action.label).filter(Boolean))];
    const chartRequest = modes.includes('chart') ? parseChartRequest(query) : null;

    const lookups = stamps.map(async action => action.results
      ?? (action.label ? (await searchClips(action.label)).filter(hit => hit.case_id === (action.case_id ?? caseId)) : []));
    const extra = [];
    let timeline = state.timeline;
    let quiz = keepOutputs ? state.quiz : null;
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
    target = modes[0] === 'timestamp' ? '#sec-timeline' : `#sec-${modes[0]}`;
  } catch (error) {
    state.error = error.message;
  } finally {
    if (state.caseId === caseId) {
      state.loading = false;
      state.messages.push({ role: 'doc', text: answer });
      render();
      // Bring the new section into view; the chat stays docked on the right.
      if (target) scrollToSection(target);
    }
  }
}

render();
