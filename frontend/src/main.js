import './style.css';
import { searchClips, fixtureMode } from './api.js';
import { videoForCase } from './cases.js';

const app = document.querySelector('#app');
const state = {
  page: 'home', caseId: 'VID01', title: 'VID01 · Cholecystectomy', videoUrl: videoForCase('VID01'),
  localVideo: false, localUrl: null, query: '', results: [], history: [], active: null,
  loading: false, error: '', pendingSeek: null, duration: 0,
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

function dashboard() {
  const currentResults = state.results.map((result, index) => ({ result, index })).filter(({ result }) => result.case_id === state.caseId);
  const duration = state.duration || 1800;
  return `<main class="dashboard"><section class="workbench"><div class="section-heading"><div><span class="kicker">VIDEO</span><h1>${escapeHtml(state.title)}</h1></div><span class="case-pill">${escapeHtml(state.caseId)}</span></div>
    <div class="video-frame"><video id="player" data-case-id="${escapeHtml(state.caseId)}" controls preload="metadata" ${state.videoUrl ? `src="${escapeHtml(state.videoUrl)}"` : ''}></video>
    <div class="video-fallback" id="video-fallback" hidden><strong>Video unavailable</strong><span>The video for ${escapeHtml(state.caseId)} has not been downloaded or hosted yet.</span></div></div>
    ${state.localVideo ? '<p class="local-note">Local video playback only. This file has no indexed annotations, so event search is unavailable.</p>' : ''}
    <div class="timeline-panel"><div class="timeline-header"><div><span class="kicker">CURRENT VIDEO</span><h2>Matching moments on this timeline</h2></div></div>
      <div class="timeline-track" id="timeline" aria-label="Matches in current video"><div class="timeline-line"></div>
      ${currentResults.map(({ result, index }) => {
        const left = Math.min(99, Math.max(0, Number(result.start_sec) / duration * 100));
        const width = Math.max(.65, Math.min(100 - left, (Number(result.end_sec) - Number(result.start_sec)) / duration * 100));
        return `<button class="timeline-event ${state.active === index ? 'selected' : ''}" data-result="${index}" style="left:${left}%;width:${width}%" title="${escapeHtml(result.label)} · ${formatTime(result.start_sec)}–${formatTime(result.end_sec)}" aria-label="${escapeHtml(result.label)} at ${formatTime(result.start_sec)}"></button>`;
      }).join('')}<span class="timeline-end">${state.duration ? formatTime(duration) : '—'}</span></div>
      <div class="legend"><span><i></i> Search matches in ${escapeHtml(state.caseId)}</span><span>${currentResults.length} shown</span></div></div>
    <section class="moments"><div class="moments-heading"><div><span class="kicker">ALL CASES</span><h2>Search results</h2></div><span class="count">${state.results.length}</span></div>
      ${state.loading ? '<p class="empty">Searching annotated clips…</p>' : state.error ? `<p class="empty error" role="alert">${escapeHtml(state.error)}</p>` : state.results.length
        ? `<div class="results">${state.results.map(resultCard).join('')}</div>`
        : `<div class="empty"><strong>${state.query ? 'No matching moments found' : 'No search yet'}</strong><p>${state.query ? 'Try another instrument label.' : state.localVideo ? 'Search is available for indexed cases.' : 'Search an instrument label to see its timestamps.'}</p></div>`}</section></section>
    <aside class="chat"><div class="chat-header"><span class="kicker">ANNOTATION SEARCH</span><h2>Find an instrument</h2><p>Search the labeled cases by instrument name.</p></div>
      ${state.localVideo ? '' : `<div class="history"><div class="aside-label">RECENT SEARCHES</div>${state.history.length
        ? state.history.map((query, index) => `<button class="history-item" data-history="${index}"><span>⌕</span>${escapeHtml(query)}<b>↗</b></button>`).join('')
        : '<p class="history-empty">Your searches will appear here.</p>'}</div>`}
      <div class="chat-body">${state.localVideo
        ? '<div class="chat-intro"><strong>This video is not indexed</strong><p>You can play it here. Search results are available for the prepared cases.</p></div>'
        : state.query
          ? `<div class="chat-message user">${escapeHtml(state.query)}</div><div class="chat-message assistant"><span class="mini-logo">⌕</span><div>${state.loading ? 'Searching annotations…' : state.error ? escapeHtml(state.error) : state.results.length ? `${state.results.length} matching ${state.results.length === 1 ? 'interval' : 'intervals'} across ${new Set(state.results.map(r => r.case_id)).size} ${new Set(state.results.map(r => r.case_id)).size === 1 ? 'case' : 'cases'}. Select a result on the left.` : 'No matches in the available annotations.'}</div></div>`
          : '<div class="chat-intro"><strong>Search the annotations</strong><p>Enter an instrument label to find its appearances across indexed surgeries.</p></div>'}</div>
      ${state.localVideo ? '<div class="chat-compose"><button class="sample-btn" id="open-sample">Open indexed sample <span>→</span></button></div>'
        : `<div class="chat-compose"><div class="suggestions"><button data-prompt="clipper">Clipper</button><button data-prompt="hook">Hook</button><button data-prompt="grasper">Grasper</button></div>
          <form id="search-form"><label for="query" class="sr-only">Instrument label</label><input id="query" name="q" placeholder="Instrument label, e.g. clipper" autocomplete="off" required><button type="submit" aria-label="Search" ${state.loading ? 'disabled' : ''}>→</button></form>
          <small>Exact instrument labels. This search does not answer general questions.</small></div>`}</aside></main>`;
}

function openSample(seek = null) {
  state.page = 'dash'; state.caseId = 'VID01'; state.title = 'VID01 · Cholecystectomy';
  state.videoUrl = videoForCase('VID01'); state.localVideo = false; state.error = '';
  state.results = []; state.query = ''; state.active = null; state.duration = 0; state.pendingSeek = seek;
  render();
  if (seek != null) runSearch('clipper');
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
  document.querySelectorAll('[data-result]').forEach(el => el.addEventListener('click', () => selectResult(Number(el.dataset.result))));
  document.querySelectorAll('[data-history]').forEach(el => el.addEventListener('click', () => runSearch(state.history[Number(el.dataset.history)], false)));
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
async function runSearch(raw, addHistory = true) {
  const query = String(raw ?? '').trim().toLowerCase();
  if (!query || state.localVideo) return;
  state.query = query; state.loading = true; state.error = ''; state.results = []; state.active = null;
  if (addHistory) state.history = [query, ...state.history.filter(item => item !== query)].slice(0, 6);
  render();
  try { state.results = await searchClips(query); }
  catch (error) { state.error = `${error.message}. Check the backend connection.`; }
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
