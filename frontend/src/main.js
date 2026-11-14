import './style.css';
import { searchClips, loadCaseClips, instrumentLabels } from './api.js';
import { videoForCase } from './cases.js';

const app = document.querySelector('#app');
const state = {
  page: 'home', caseId: 'VID01', title: 'VID01 · Cholecystectomy', videoUrl: videoForCase('VID01'),
  localVideo: false, localUrl: null, query: '', results: [], history: [], active: null,
  loading: false, error: '', pendingSeek: null, duration: 0, outputs: [], caseClips: [], quizRevealed: false,
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
    <span class="result-main"><strong>${escapeHtml(result.label)}</strong><small>${escapeHtml(result.case_id)} · ${escapeHtml(result.source)}</small></span>
    <span class="result-time">${formatTime(result.start_sec)}–${formatTime(result.end_sec)}</span><span class="result-arrow">↗</span></button>`;
}

function detectRequest(input) {
  const lower = input.toLowerCase();
  const explicit = [...lower.matchAll(/\/(timestamp|quiz|chart|model)\b/g)].map(match => match[1]);
  const modes = [...new Set(explicit)];
  if (!modes.length) {
    if (/quiz|test me|practice question|study question/.test(lower)) modes.push('quiz');
    if (/chart|graph|distribution|how many|count|frequency|summary of tools/.test(lower)) modes.push('chart');
    if (/3d|model|anatomy/.test(lower)) modes.push('model');
    if (/when|timestamp|show me|find|where|used|occurred|happen/.test(lower) || !modes.length) modes.unshift('timestamp');
  }
  const label = instrumentLabels.find(item => new RegExp(`\\b${item}\\b`).test(lower));
  return { modes, label };
}
function outputSections() {
  if (state.loading) return '<div class="empty">Loading annotations for this video…</div>';
  if (state.error) return `<div class="empty error" role="alert">${escapeHtml(state.error)}</div>`;
  if (!state.outputs.length) return '<div class="empty">Choose a feature or ask about an instrument in this video.</div>';
  return state.outputs.map(mode => {
    if (mode === 'model') return '<section class="feature-card"><span class="kicker">/model</span><h2>3D model unavailable</h2><p>This video has no linked 3D anatomy model. A model and a part-to-video mapping are needed before this feature can show results.</p></section>';
    if (mode === 'timestamp') return `<section class="feature-card"><span class="kicker">/timestamp</span><h2>Matching moments</h2><p>${state.results.length} annotated ${state.results.length === 1 ? 'interval' : 'intervals'} in ${escapeHtml(state.caseId)}${state.queryLabel ? ` for ${escapeHtml(state.queryLabel)}` : ''}.</p>${state.results.length ? `<div class="results">${state.results.slice(0, 80).map(resultCard).join('')}</div>${state.results.length > 80 ? '<p>Showing the first 80 moments.</p>' : ''}` : '<p>No matching annotations in this video.</p>'}</section>`;
    if (mode === 'chart') {
      const counts = instrumentLabels.map(label => ({ label, count: state.caseClips.filter(hit => hit.label === label).length }));
      const max = Math.max(1, ...counts.map(item => item.count));
      return `<section class="feature-card"><span class="kicker">/chart</span><h2>Instrument events in ${escapeHtml(state.caseId)}</h2><p>Counts of annotated intervals in this video. Multiple instruments can appear at the same time.</p><div class="chart">${counts.map(item => `<div class="chart-row"><span>${item.label}</span><div class="chart-track"><div style="width:${item.count / max * 100}%"></div></div><strong>${item.count}</strong></div>`).join('')}</div></section>`;
    }
    const clips = state.caseClips;
    const sample = clips.find(hit => hit.label === 'clipper') ?? clips[0];
    const choices = instrumentLabels.filter(label => clips.some(hit => hit.label === label)).slice(0, 4);
    if (sample && !choices.includes(sample.label)) choices[0] = sample.label;
    return `<section class="feature-card"><span class="kicker">/quiz</span><h2>Study question</h2>${sample ? `<p>Which instrument is annotated at ${formatTime(sample.start_sec)} in this video?</p><div class="quiz-choices">${choices.map(label => `<button class="quiz-choice" data-answer="${escapeHtml(label)}">${escapeHtml(label)}</button>`).join('')}</div><p id="quiz-feedback">${state.quizRevealed ? `Answer: ${escapeHtml(sample.label)}. The annotation spans ${formatTime(sample.start_sec)}–${formatTime(sample.end_sec)}.` : 'Choose an answer to reveal the annotation.'}</p><button class="quiz-jump" data-quiz-time="${sample.start_sec}">Watch this moment →</button>` : '<p>No annotations are available to create a quiz for this video.</p>'}<small>Questions are generated from tool annotations, not clinical guidance.</small></section>`;
  }).join('');
}
function dashboard() {
  const currentResults = state.results.map((result, index) => ({ result, index }));
  const duration = state.duration || 1800;
  return `<main class="dashboard dashboard-features"><section class="workbench"><div class="section-heading"><div><span class="kicker">VIDEO</span><h1>${escapeHtml(state.title)}</h1></div><span class="case-pill">${escapeHtml(state.caseId)}</span></div>
    <div class="video-frame"><video id="player" data-case-id="${escapeHtml(state.caseId)}" controls preload="metadata" ${state.videoUrl ? `src="${escapeHtml(state.videoUrl)}"` : ''}></video><div class="video-fallback" id="video-fallback" hidden><strong>Video unavailable</strong><span>The video for ${escapeHtml(state.caseId)} has not been downloaded or hosted yet.</span></div></div>
    ${state.localVideo ? '<p class="local-note">Local video playback only. This file has no indexed annotations.</p>' : ''}
    <div class="timeline-panel"><div class="timeline-header"><div><span class="kicker">CURRENT VIDEO</span><h2>Event timeline</h2></div></div>
      ${state.localVideo ? '' : '<div class="feature-options"><button data-prompt="/timestamp clipper">/timestamp</button><button data-prompt="/quiz">/quiz</button><button data-prompt="/chart">/chart</button><button data-prompt="/model">/model</button></div>'}
      <div class="timeline-track" id="timeline" aria-label="Matches in current video"><div class="timeline-line"></div>${currentResults.map(({ result, index }) => { const left = Math.min(99, Math.max(0, Number(result.start_sec) / duration * 100)); const width = Math.max(.65, Math.min(100 - left, (Number(result.end_sec) - Number(result.start_sec)) / duration * 100)); return `<button class="timeline-event ${state.active === index ? 'selected' : ''}" data-result="${index}" style="left:${left}%;width:${width}%" title="${escapeHtml(result.label)} · ${formatTime(result.start_sec)}–${formatTime(result.end_sec)}" aria-label="${escapeHtml(result.label)} at ${formatTime(result.start_sec)}"></button>`; }).join('')}<span class="timeline-end">${state.duration ? formatTime(duration) : '—'}</span></div><div class="legend"><span><i></i> Matches in ${escapeHtml(state.caseId)}</span><span>${currentResults.length} shown</span></div></div>
    </section><aside class="chat"><div class="chat-header"><span class="kicker">SURG+F ASSISTANT</span><h2>Ask the footage<span class="chat-spark">✳</span></h2><p>Choose an output or ask about this video.</p></div>
      <div class="history"><div class="aside-label">RECENT QUESTIONS</div>${state.history.length ? state.history.map((query, index) => `<button class="history-item" data-history="${index}"><span>⌕</span>${escapeHtml(query)}<b>↗</b></button>`).join('') : '<p class="history-empty">Your questions will appear here.</p>'}</div>
      <div class="chat-body">${state.query ? `<div class="chat-message user">${escapeHtml(state.query)}</div><div class="chat-message assistant"><span class="mini-logo">✳</span><div>${state.loading ? 'Finding annotations…' : state.error ? escapeHtml(state.error) : `Showing ${state.outputs.map(mode => `/${mode}`).join(', ')} below the video.`}</div></div>` : '<div class="chat-intro"><strong>What would you like to explore?</strong><p>Try “when was the clipper used?” or choose a feature below.</p></div>'}</div>
      <div class="chat-compose">${state.localVideo ? '<p>Event features require an indexed video.</p><button class="sample-btn" id="open-sample">Open indexed sample →</button>' : `<div class="suggestions"><button data-prompt="/timestamp clipper">/timestamp</button><button data-prompt="/quiz">/quiz</button><button data-prompt="/chart">/chart</button><button data-prompt="/model">/model</button></div><form id="search-form"><label class="sr-only" for="query">Ask about this video</label><input id="query" name="q" placeholder="Ask about this video…" required><button type="submit" aria-label="Search">→</button></form><small>Outputs use available annotations for this video.</small>`}</div></aside>
      <div class="feature-results" aria-live="polite">${outputSections()}</div></main>`;
}

function openSample(seek = null) {
  state.page = 'dash'; state.caseId = 'VID01'; state.title = 'VID01 · Cholecystectomy';
  state.videoUrl = videoForCase('VID01'); state.localVideo = false; state.error = '';
  state.results = []; state.caseClips = []; state.outputs = []; state.query = ''; state.active = null; state.duration = 0; state.pendingSeek = seek;
  render();
  if (seek != null) runSearch('/timestamp clipper');
}
function wire() {
  document.querySelector('#change-video')?.addEventListener('click', () => { state.page = 'home'; state.error = ''; render(); });
  const preview = document.querySelector('.preview-video video');
  preview?.addEventListener('loadedmetadata', () => { preview.currentTime = 674; });
  document.querySelector('#sample')?.addEventListener('click', () => openSample());
  document.querySelector('#sample-event')?.addEventListener('click', () => openSample(674));
  document.querySelector('#open-sample')?.addEventListener('click', () => openSample());
  const zone = document.querySelector('#drop-zone');
  const input = document.querySelector('#file-input');
  zone?.addEventListener('click', () => input.click());
  zone?.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); input.click(); } });
  zone?.addEventListener('dragover', event => { event.preventDefault(); zone.classList.add('drag'); });
  zone?.addEventListener('dragleave', () => zone.classList.remove('drag'));
  zone?.addEventListener('drop', event => { event.preventDefault(); zone.classList.remove('drag'); openFile(event.dataTransfer.files[0]); });
  input?.addEventListener('change', () => openFile(input.files[0]));
  document.querySelector('#search-form')?.addEventListener('submit', event => { event.preventDefault(); runSearch(new FormData(event.currentTarget).get('q')); });
  document.querySelectorAll('[data-prompt]').forEach(el => el.addEventListener('click', () => runSearch(el.dataset.prompt)));
  document.querySelectorAll('[data-history]').forEach(el => el.addEventListener('click', () => runSearch(state.history[Number(el.dataset.history)])));
  document.querySelectorAll('[data-result]').forEach(el => el.addEventListener('click', () => selectResult(Number(el.dataset.result))));
  document.querySelectorAll('[data-answer]').forEach(el => el.addEventListener('click', () => { state.quizRevealed = true; const sample = state.caseClips.find(hit => hit.label === 'clipper') ?? state.caseClips[0]; document.querySelector('#quiz-feedback').textContent = `${el.dataset.answer === sample.label ? 'Correct.' : 'Not quite.'} The annotation labels ${sample.label} at ${formatTime(sample.start_sec)}–${formatTime(sample.end_sec)}.`; }));
  document.querySelectorAll('[data-quiz-time]').forEach(el => el.addEventListener('click', () => { const video = document.querySelector('#player'); if (video) video.currentTime = Number(el.dataset.quizTime); }));
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
  state.results = []; state.active = null; state.error = ''; state.duration = 0; state.pendingSeek = null;
  render();
}
async function runSearch(raw) {
  const query = String(raw ?? '').trim();
  if (!query || state.localVideo) return;
  const { modes, label } = detectRequest(query);
  state.query = query; state.queryLabel = label; state.outputs = modes; state.loading = true;
  state.history = [query, ...state.history.filter(item => item !== query)].slice(0, 6);
  state.error = ''; state.results = []; state.active = null; state.quizRevealed = false;
  render();
  try {
    if (modes.some(mode => mode !== 'model')) {
      const needsAll = modes.includes('chart') || modes.includes('quiz') || !label;
      const clips = needsAll ? await loadCaseClips(state.caseId) : (await searchClips(label)).filter(hit => hit.case_id === state.caseId);
      state.caseClips = clips;
      state.results = label ? clips.filter(hit => hit.label === label) : clips;
    }
  } catch (error) { state.error = `${error.message}. Check the backend connection.`; }
  finally { state.loading = false; render(); }
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
    const result = state.results[Number(el.dataset.result)];
    const left = Math.min(99, Math.max(0, Number(result.start_sec) / state.duration * 100));
    el.style.left = `${left}%`;
    el.style.width = `${Math.max(.65, Math.min(100 - left, (Number(result.end_sec) - Number(result.start_sec)) / state.duration * 100))}%`;
  });
  track.querySelector('.timeline-end').textContent = formatTime(state.duration);
}
render();
