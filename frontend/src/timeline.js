// Timeline panel. By default it shows the steps of the operation for the open video.
// When the user searches for an instrument, every matching moment is added in yellow:
// as a marker on the track and as a time chip inside the step it happens in.

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
const formatTime = seconds => {
  const n = Math.floor(Number(seconds) || 0);
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
};
const capitalize = text => text.charAt(0).toUpperCase() + text.slice(1);
const percent = (value, total) => Math.min(100, Math.max(0, (Number(value) / total) * 100));

function hitChip(hit, showLabel) {
  const predicted = hit.source === 'prediction';
  return `<button type="button" class="tl-hit${predicted ? ' is-predicted' : ''}" data-seek="${hit.start_sec}"
    title="${escapeHtml(capitalize(hit.label))}${predicted ? ' (model prediction)' : ''}">${showLabel ? `<span>${escapeHtml(hit.label)}</span> ` : ''}${formatTime(hit.start_sec)}–${formatTime(hit.end_sec)}</button>`;
}

export function timelinePanel(state, stepNotes = {}) {
  const steps = state.steps?.steps ?? [];
  const hits = state.results.filter(hit => hit.case_id === state.caseId);
  const labels = [...new Set(hits.map(hit => hit.label))];
  const searched = state.outputs.includes('timestamp') && Boolean(state.queryLabel);
  const total = state.duration || steps.at(-1)?.end_sec || Math.max(1, ...hits.map(hit => hit.end_sec));
  const showLabel = labels.length > 1;
  const predicted = hits.filter(hit => hit.source === 'prediction').length;

  const search = !searched ? '' : `<div class="tl-search" role="status">
      <span class="tl-search-term">${escapeHtml(capitalize(state.queryLabel))}</span>
      <span class="tl-search-count">${hits.length ? `${hits.length} moment${hits.length === 1 ? '' : 's'} in ${escapeHtml(state.caseId)}${predicted ? `, ${predicted} predicted by the model` : ''}` : `No moments in ${escapeHtml(state.caseId)}`}</span>
      <button type="button" class="btn-quiet" id="clear-search">Clear search</button>
    </div>`;

  const track = `<div class="tl-track" id="tl-track" data-total="${total}">
      ${steps.map(step => `<button type="button" class="tl-seg" data-seek="${step.start_sec}" data-start="${step.start_sec}" data-end="${step.end_sec}"
        style="left:${percent(step.start_sec, total)}%;width:${percent(step.end_sec - step.start_sec, total)}%"
        title="${step.order}. ${escapeHtml(step.label)} · ${formatTime(step.start_sec)}–${formatTime(step.end_sec)}"
        aria-label="Step ${step.order}, ${escapeHtml(step.label)}, starts at ${formatTime(step.start_sec)}"><span>${step.order}</span></button>`).join('')}
      ${hits.map(hit => `<button type="button" class="tl-mark${hit.source === 'prediction' ? ' is-predicted' : ''}" data-seek="${hit.start_sec}"
        style="left:${percent(hit.start_sec, total)}%;width:${percent(hit.end_sec - hit.start_sec, total)}%"
        title="${escapeHtml(capitalize(hit.label))} · ${formatTime(hit.start_sec)}–${formatTime(hit.end_sec)}"
        aria-label="${escapeHtml(hit.label)} at ${formatTime(hit.start_sec)}"></button>`).join('')}
      <div class="tl-playhead" id="tl-playhead" hidden></div>
    </div>
    <div class="tl-axis"><span>00:00</span><span>${formatTime(total)}</span></div>`;

  const inStep = step => hits.filter(hit => hit.start_sec >= step.start_sec && hit.start_sec < step.end_sec);
  const stepList = steps.length ? `<ol class="tl-steps">${steps.map(step => {
    const found = inStep(step);
    return `<li class="tl-step${found.length ? ' has-hits' : ''}" data-start="${step.start_sec}" data-end="${step.end_sec}">
        <button type="button" class="tl-step-main" data-seek="${step.start_sec}">
          <span class="tl-step-num">${step.order}</span>
          <span class="tl-step-text"><strong>${escapeHtml(step.label)}</strong>${stepNotes[step.key] ? `<small>${escapeHtml(stepNotes[step.key])}</small>` : ''}</span>
          <span class="tl-step-time">${formatTime(step.start_sec)}–${formatTime(step.end_sec)}</span>
        </button>
        ${found.length ? `<div class="tl-hits" aria-label="${escapeHtml(state.queryLabel)} moments in this step">${found.map(hit => hitChip(hit, showLabel)).join('')}</div>` : ''}
      </li>`;
  }).join('')}</ol>`
    : hits.length ? `<div class="tl-hits tl-hits-flat">${hits.map(hit => hitChip(hit, showLabel)).join('')}</div>`
      : `<p class="tl-empty">${state.stepsError ? 'The steps for this video could not be loaded.' : state.localVideo ? 'This video has no saved steps.' : 'Loading the steps for this video…'}</p>`;

  const intro = searched
    ? 'Matching moments are highlighted in yellow. Select one to jump there.'
    : 'The steps of the operation in this video. Select a step to jump to it.';
  return `<section class="panel" id="sec-timeline" aria-labelledby="timeline-title">
    <div class="panel-head tl-head"><div><h2 id="timeline-title">Timeline</h2><p>${intro}</p></div>
      ${steps.length ? `<div class="step-nav-group" role="group" aria-label="Move between steps">
        <button type="button" class="step-nav" data-step-nav="-1" aria-label="Previous step"><i class="ico ico-left" aria-hidden="true"></i></button>
        <button type="button" class="step-nav" data-step-nav="1" aria-label="Next step"><i class="ico ico-right" aria-hidden="true"></i></button></div>` : ''}</div>
    <div class="panel-body">${search}${track}${stepList}</div>
  </section>`;
}

// Move the playhead and mark the step being played. Called on every video timeupdate,
// so it only touches classes and one style property.
export function timelineTick(currentTime, duration) {
  const track = document.querySelector('#tl-track');
  if (!track) return;
  const total = duration || Number(track.dataset.total);
  const playhead = track.querySelector('#tl-playhead');
  if (playhead && total) { playhead.hidden = false; playhead.style.left = `${percent(currentTime, total)}%`; }
  document.querySelectorAll('.tl-step, .tl-seg').forEach(el => {
    const current = currentTime >= Number(el.dataset.start) && currentTime < Number(el.dataset.end);
    el.classList.toggle('is-current', current);
  });
}
