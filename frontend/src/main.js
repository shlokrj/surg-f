import './style.css';
import { searchClips, getTimeline, getQuiz, interpretQuery, getActionRows, instrumentLabels } from './api.js';
import { quizCard, wireQuiz } from './quiz.js';
import { videoForCase } from './cases.js';

const app = document.querySelector('#app');
const state = {
  page: 'home', caseId: 'VID01', title: 'VID01 · Cholecystectomy', videoUrl: videoForCase('VID01'),
  localVideo: false, localUrl: null, query: '', draft: '', results: [], history: [], active: null,
  loading: false, error: '', pendingSeek: null, duration: 0, outputs: [], timeline: null, timelineError: '', quiz: null, quizAnswers: {}, quizSubmitted: false, reply: '', chartRequest: null, actionRows: [],
};
const formatTime = seconds => {
  const n = Math.floor(Number(seconds) || 0);
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
};
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
const logo = `<span class="wordmark" aria-label="Surg+F">Surg<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10" cy="10" r="7"/><path d="m15.3 15.3 6 6M10 6v8M6 10h8"/></svg>F</span>`;

function render() {
  const previousInput = document.querySelector('#query');
  if (previousInput) state.draft = previousInput.value;
  const previousVideo = document.querySelector('#player');
  if (previousVideo?.dataset.caseId === state.caseId && previousVideo.readyState >= 1 && state.pendingSeek == null) {
    state.pendingSeek = previousVideo.currentTime;
  }
  app.innerHTML = `<header class="topbar">${logo}${state.page === 'dash'
    ? `<div class="top-title">${escapeHtml(state.title)}</div><button class="top-action" id="change-video">Choose another video <span>↗</span></button>`
    : '<span class="top-spacer"></span>'}</header>${state.page === 'home' ? home() : dashboard()}`;
  wire();
}

function home() {
  return `<main class="home"><div class="hero"><div class="hero-logo">${logo}</div>
    <h1>Find the moments that<br><em>matter.</em></h1>
    <p>Search annotated surgical footage by instrument and jump directly to matching moments.</p>
    <button class="sample-btn" id="sample">Open sample surgery <span>→</span></button>
    <div class="upload-card" id="drop-zone" tabindex="0" role="button" aria-label="Open a local MP4 or MOV for playback only">
      <div class="upload-icon">↑</div><strong>Open your own video</strong><span>Play a local MP4 or MOV. Event search is available for indexed cases only.</span>
    </div><input type="file" id="file-input" accept="video/mp4,video/quicktime,.mp4,.mov" hidden>
    ${state.error ? `<p class="home-error" role="alert">${escapeHtml(state.error)}</p>` : ''}
    </div><aside class="sample-preview"><div class="preview-label">AVAILABLE DEMO CASE</div>
      <div class="preview-video"><video src="${escapeHtml(videoForCase('VID01'))}" muted playsinline preload="auto" aria-label="Preview of VID01 surgery footage"></video></div>
      <div class="preview-details"><div><span class="preview-kicker">VID01 · CHOLECYSTECTOMY</span><h2>Explore a real annotated case</h2><p>Search for clipper, hook, grasper, and other labeled instrument events. Select a result to seek to that moment.</p></div>
      <div class="preview-event"><span>EXAMPLE ANNOTATION</span><strong>Clipper</strong><b>11:14–11:30</b></div>
      <button id="sample-event" class="preview-action">View clipper event at 11:14 <span>↗</span></button></div>
    </aside></main>`;
}

function resultCard(result, index) {
  return `<button class="result ${state.active === index ? 'active' : ''}" data-result="${index}">
    <span class="result-num">${String(index + 1).padStart(2, '0')}</span>
    <span class="result-main"><strong>${escapeHtml(result.label)}</strong><small>${result.source === 'prediction' ? 'Model prediction' : result.source === 'annotation' ? 'Dataset annotation' : 'Fixture'} · ${escapeHtml(result.case_id)}</small></span>
    <span class="result-time">${formatTime(result.start_sec)}–${formatTime(result.end_sec)}</span><span class="result-arrow">↗</span></button>`;
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
    const counts = (state.timeline?.summary ?? []).filter(item => !request.instrument || item.label === request.instrument);
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
function outputSections() {
  if (state.loading) return '<div class="empty">Loading annotations for this video…</div>';
  if (state.error) return `<div class="empty error" role="alert">${escapeHtml(state.error)}</div>`;
  if (!state.outputs.length) return '<div class="empty">Choose a feature or ask about an instrument in this video.</div>';
  return state.outputs.map(mode => {
    if (mode === 'model') return '<section class="feature-card"><span class="kicker">/model</span><h2>3D model unavailable</h2><p>This video has no linked 3D anatomy model. A model and a part-to-video mapping are needed before this feature can show results.</p></section>';
    if (mode === 'timestamp') return `<section class="feature-card"><span class="kicker">/timestamp</span><h2>Matching moments</h2><p>${state.results.length} matching ${state.results.length === 1 ? 'interval' : 'intervals'} in ${escapeHtml(state.caseId)}${state.queryLabel ? ` for ${escapeHtml(state.queryLabel)}` : ''}.</p>${state.results.length ? `<div class="results">${state.results.slice(0, 80).map(resultCard).join('')}</div>${state.results.length > 80 ? '<p>Showing the first 80 moments.</p>' : ''}` : '<p>No matching annotations in this video.</p>'}</section>`;
    if (mode === 'chart') {
      const request = state.chartRequest ?? { categories: ['instruments', 'verbs', 'targets'], instrument: null };
      return `<section class="feature-card"><span class="kicker">/chart</span><h2>Event charts for ${escapeHtml(state.caseId)}</h2>${request.categories.map(category => chartSection(category, request)).join('')}</section>`;
    }
    return quizCard(state);
  }).join('');
}
function dashboard() {
  const currentResults = (state.timeline?.segments ?? []).map((result, index) => ({ result, index }));
  const duration = state.duration || 1800;
  return `<main class="dashboard dashboard-features"><section class="workbench"><div class="section-heading"><div><span class="kicker">VIDEO</span><h1>${escapeHtml(state.title)}</h1></div><div class="case-switch" role="group" aria-label="Demo video"><button data-case="VID01" ${state.caseId === 'VID01' ? 'aria-pressed="true"' : ''}>VID01</button><button data-case="VID02" ${state.caseId === 'VID02' ? 'aria-pressed="true"' : ''}>VID02</button></div></div>
    <div class="video-frame"><video id="player" data-case-id="${escapeHtml(state.caseId)}" controls preload="metadata" ${state.videoUrl ? `src="${escapeHtml(state.videoUrl)}"` : ''}></video><div class="video-fallback" id="video-fallback" hidden><strong>Video unavailable</strong><span>The video for ${escapeHtml(state.caseId)} has not been downloaded or hosted yet.</span></div></div>
    ${state.localVideo ? '<p class="local-note">Local video playback only. This file has no indexed annotations.</p>' : ''}
    <div class="timeline-panel"><div class="timeline-header"><div><span class="kicker">CURRENT VIDEO</span><h2>Event timeline</h2></div></div>
      ${state.localVideo ? '' : '<div class="feature-options"><button data-prompt="/timestamp">/timestamp</button><button data-prompt="/quiz">/quiz</button><button data-prompt="/chart">/chart</button><button data-prompt="/model">/model</button></div>'}
      ${state.timelineError ? `<p class="timeline-error" role="status">Timeline unavailable: ${escapeHtml(state.timelineError)}</p>` : ''}<div id="timeline" aria-label="Annotated event timeline">${instrumentLabels.map(label => {
        const segments = currentResults.filter(item => item.result.label === label);
        return `<div class="timeline-row"><span class="timeline-row-label">${escapeHtml(label)}</span><div class="timeline-track"><div class="timeline-line"></div>${segments.map(({ result }) => { const left = Math.min(99, Math.max(0, Number(result.start_sec) / duration * 100)); const width = Math.max(.65, Math.min(100 - left, (Number(result.end_sec) - Number(result.start_sec)) / duration * 100)); return `<button class="timeline-event" data-seek="${result.start_sec}" data-label="${escapeHtml(label)}" style="left:${left}%;width:${width}%" title="${escapeHtml(label)} · ${formatTime(result.start_sec)}–${formatTime(result.end_sec)}" aria-label="${escapeHtml(label)} at ${formatTime(result.start_sec)}"></button>`; }).join('')}</div></div>`;
      }).join('')}</div><div class="legend"><span>Dataset annotations in ${escapeHtml(state.caseId)}</span><span>${currentResults.length} intervals · ${state.duration ? formatTime(duration) : '—'} video</span></div></div>
    </section><aside class="chat"><div class="chat-header"><span class="kicker">SURG+F ASSISTANT</span><h2>Ask the footage<span class="chat-spark">✳</span></h2><p>Choose an output or ask about this video.</p></div>
      <div class="history"><div class="aside-label">RECENT QUESTIONS</div>${state.history.length ? state.history.map((query, index) => `<button class="history-item" data-history="${index}"><span>⌕</span>${escapeHtml(query)}<b>↗</b></button>`).join('') : '<p class="history-empty">Your questions will appear here.</p>'}</div>
      <div class="chat-body">${state.query ? `<div class="chat-message user">${escapeHtml(state.query)}</div><div class="chat-message assistant"><span class="mini-logo">✳</span><div>${state.loading ? 'Finding annotations…' : state.error ? escapeHtml(state.error) : escapeHtml(state.reply || (state.outputs.length ? `Showing ${state.outputs.map(mode => `/${mode}`).join(', ')} below the video.` : 'Try an instrument name, /chart or /quiz.'))}</div></div>` : '<div class="chat-intro"><strong>What would you like to explore?</strong><p>Try “when was the clipper used?” or choose a feature below.</p></div>'}</div>
      <div class="chat-compose">${state.localVideo ? '<p>Event features require an indexed video.</p><button class="sample-btn" id="open-sample">Open indexed sample →</button>' : `<div class="suggestions"><button data-prompt="/timestamp">/timestamp</button><button data-prompt="/quiz">/quiz</button><button data-prompt="/chart">/chart</button><button data-prompt="/model">/model</button></div><form id="search-form"><label class="sr-only" for="query">Ask about this video</label><input id="query" name="q" value="${escapeHtml(state.draft)}" placeholder="Ask about this video…" required><button type="submit" aria-label="Search">→</button></form><small>Timeline and chart use this video; quiz covers the operation generally.</small>`}</div></aside>
      <div class="feature-results" aria-live="polite">${outputSections()}</div></main>`;
}

function openSample(seek = null) {
  state.page = 'dash'; state.caseId = 'VID01'; state.title = 'VID01 · Cholecystectomy';
  state.videoUrl = videoForCase('VID01'); state.localVideo = false; state.error = '';
  state.results = []; state.timeline = null; state.timelineError = ''; state.quiz = null; state.outputs = []; state.chartRequest = null; state.actionRows = []; state.query = ''; state.active = null; state.duration = 0; state.pendingSeek = seek;
  render();
  loadCurrentTimeline();
  if (seek != null) runSearch('/timestamp clipper');
}
function wire() {
  document.querySelector('#change-video')?.addEventListener('click', () => { state.page = 'home'; state.error = ''; render(); });
  const preview = document.querySelector('.preview-video video');
  preview?.addEventListener('loadedmetadata', () => { preview.currentTime = 674; });
  document.querySelector('#sample')?.addEventListener('click', () => openSample());
  document.querySelector('#sample-event')?.addEventListener('click', () => openSample(674));
  document.querySelector('#open-sample')?.addEventListener('click', () => openSample());
  document.querySelectorAll('[data-case]').forEach(el => el.addEventListener('click', () => {
    const next = el.dataset.case;
    if (next === state.caseId) return;
    const query = state.query;
    state.caseId = next; state.title = `${next} · Cholecystectomy`; state.videoUrl = videoForCase(next);
    state.duration = 0; state.pendingSeek = null; state.results = []; state.timeline = null; state.timelineError = ''; state.quiz = null; state.outputs = []; state.chartRequest = null; state.actionRows = []; state.query = ''; state.error = '';
    render();
    loadCurrentTimeline();
    if (query) runSearch(query);
  }));
  const zone = document.querySelector('#drop-zone');
  const input = document.querySelector('#file-input');
  zone?.addEventListener('click', () => input.click());
  zone?.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); input.click(); } });
  zone?.addEventListener('dragover', event => { event.preventDefault(); zone.classList.add('drag'); });
  zone?.addEventListener('dragleave', () => zone.classList.remove('drag'));
  zone?.addEventListener('drop', event => { event.preventDefault(); zone.classList.remove('drag'); openFile(event.dataTransfer.files[0]); });
  input?.addEventListener('change', () => openFile(input.files[0]));
  const queryInput = document.querySelector('#query');
  const syncCommands = () => {
    const selected = new Set(queryInput?.value.match(/\/(?:timestamp|quiz|chart|model)\b/g) ?? []);
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
    queryInput.value = ''; state.draft = ''; syncCommands();
    runSearch(query);
  });
  document.querySelectorAll('[data-prompt]').forEach(el => el.addEventListener('click', () => {
    const input = document.querySelector('#query');
    if (!input) return;
    const command = el.dataset.prompt;
    const selected = new Set(input.value.match(/\/(?:timestamp|quiz|chart|model)\b/g) ?? []);
    if (selected.has(command)) { input.focus(); return; }
    const current = input.value.trim();
    input.value = current ? `${current} ${command}` : command;
    state.draft = input.value;
    syncCommands();
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }));
  document.querySelectorAll('[data-history]').forEach(el => el.addEventListener('click', () => runSearch(state.history[Number(el.dataset.history)])));
  document.querySelectorAll('[data-result]').forEach(el => el.addEventListener('click', () => selectResult(Number(el.dataset.result))));
  wireQuiz(state, { render, newQuiz: () => runSearch('/quiz') });
  document.querySelectorAll('[data-watch]').forEach(el => el.addEventListener('click', () => runSearch(`/timestamp ${el.dataset.watch}`)));
  document.querySelectorAll('[data-seek]').forEach(el => el.addEventListener('click', () => { const video = document.querySelector('#player'); if (video) video.currentTime = Number(el.dataset.seek); }));
  const video = document.querySelector('#player');
  video?.addEventListener('error', () => { document.querySelector('#video-fallback').hidden = false; });
  video?.addEventListener('loadedmetadata', () => {
    state.duration = video.duration;
    if (state.pendingSeek != null) { video.currentTime = state.pendingSeek; state.pendingSeek = null; }
    updateTimeline();
  });
}
function openFile(file) {
  if (!file) return;
  if (!['video/mp4', 'video/quicktime'].includes(file.type) && !/\.(mp4|mov)$/i.test(file.name)) {
    state.error = 'Unsupported file. Choose an MP4 or MOV video.'; render(); return;
  }
  if (state.localUrl) URL.revokeObjectURL(state.localUrl);
  state.localUrl = URL.createObjectURL(file);
  state.page = 'dash'; state.caseId = 'Local video'; state.title = file.name;
  state.videoUrl = state.localUrl; state.localVideo = true; state.query = '';
  state.results = []; state.timeline = null; state.timelineError = ''; state.quiz = null; state.active = null; state.error = ''; state.duration = 0; state.pendingSeek = null;
  render();
}
async function loadCurrentTimeline() {
  const caseId = state.caseId;
  try {
    const timeline = await getTimeline(caseId);
    if (state.caseId === caseId) { state.timeline = timeline; render(); }
  } catch (error) { if (state.caseId === caseId) { state.timelineError = error.message; render(); } }
}
async function runSearch(raw) {
  const query = String(raw ?? '').trim();
  if (!query || state.localVideo) return;
  const caseId = state.caseId;
  const local = detectRequest(query);
  state.query = query; state.queryLabel = local.label; state.outputs = local.modes; state.chartRequest = local.modes.includes('chart') ? parseChartRequest(query) : null; state.loading = true; state.reply = '';
  state.history = [query, ...state.history.filter(item => item !== query)].slice(0, 6);
  state.error = ''; state.results = []; state.active = null; state.quizAnswers = {}; state.quizSubmitted = false;
  render();
  try {
    // The backend turns the typed text into actions (rules first, Databricks Genie for
    // free-form questions). If it cannot be reached, fall back to the local rules above.
    const plan = await interpretQuery(query, caseId).catch(() => null);
    if (state.caseId !== caseId) return;
    const actions = plan?.actions ?? local.modes.map(type => ({ type, label: type === 'timestamp' ? local.label : null }));
    const modes = [...new Set(actions.map(action => action.type))];
    if (local.modes.includes('chart') && !modes.includes('chart')) modes.push('chart');
    const stamps = actions.filter(action => action.type === 'timestamp');
    state.outputs = modes;
    state.chartRequest = modes.includes('chart') ? parseChartRequest(query) : null;
    state.actionRows = modes.includes('chart') ? getActionRows(caseId) : [];
    state.queryLabel = stamps.map(action => action.label).filter(Boolean).join(', ');
    state.reply = (plan?.message ?? '').replaceAll('**', '');
    const tasks = stamps.map(async action => action.results
      ?? (action.label ? (await searchClips(action.label)).filter(hit => hit.case_id === (action.case_id ?? caseId)) : []));
    const extra = [];
    if (modes.includes('chart') && state.chartRequest?.categories.includes('instruments') && !state.timeline) extra.push((async () => { state.timeline = await getTimeline(caseId); })());
    if (modes.includes('quiz')) extra.push((async () => { state.quiz = await getQuiz(); })());
    const [found] = await Promise.all([Promise.all(tasks), ...extra]);
    if (state.caseId !== caseId) return;
    state.results = found.flat().sort((a, b) => a.case_id.localeCompare(b.case_id) || a.start_sec - b.start_sec);
  } catch (error) { if (state.caseId === caseId) state.error = `${error.message}. Check the backend connection.`; }
  finally { if (state.caseId === caseId) { state.loading = false; render(); } }
}

function selectResult(index) {
  const result = state.results[index];
  if (!result) return;
  state.active = index;
  state.pendingSeek = Number(result.start_sec);
  if (state.caseId !== result.case_id) {
    state.caseId = result.case_id; state.title = `${result.case_id} · Cholecystectomy`;
    state.videoUrl = videoForCase(result.case_id); state.duration = 0;
    render();
  } else {
    const video = document.querySelector('#player');
    if (video?.readyState >= 1) { video.currentTime = state.pendingSeek; state.pendingSeek = null; }
    document.querySelectorAll('[data-result]').forEach(el => {
      const chosen = Number(el.dataset.result) === index;
      el.classList.toggle('active', chosen); el.classList.toggle('selected', chosen && el.classList.contains('timeline-event'));
    });
  }
}
function updateTimeline() {
  const track = document.querySelector('#timeline');
  if (!track || !Number.isFinite(state.duration) || state.duration <= 0) return;
  track.querySelectorAll('.timeline-event').forEach(el => {
    const result = state.timeline?.segments.find(item => Number(item.start_sec) === Number(el.dataset.seek) && item.label === el.dataset.label);
    if (!result) return;
    const left = Math.min(99, Math.max(0, Number(result.start_sec) / state.duration * 100));
    el.style.left = `${left}%`;
    el.style.width = `${Math.max(.65, Math.min(100 - left, (Number(result.end_sec) - Number(result.start_sec)) / state.duration * 100))}%`;
  });

}
render();
