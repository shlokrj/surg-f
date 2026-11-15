import { architectureSection, updateArchitecture, digScrollTop, digScenes } from './architecture.js';
import { modelSection } from './modelnotes.js';
import { databricksSection } from './databricks.js';
import { problemSection } from './problem.js';
import { solutionSection } from './solution.js';
import { futureSection } from './future.js';

/* Brand: "surg" and "f" as keycaps joined by "+", read like the Ctrl+F shortcut. Same markup in the hero
   and the small lockup; colors follow currentColor, so it works white-on-teal and teal-on-light.
   The text content is "surg+f". The favicon (public/favicon.svg) is a teal plus with a mini plus in each quadrant. */
export const wordmark = (cls = '') => `<span class="sf-mark ${cls}"><kbd>surg</kbd><span class="sf-join">+</span><kbd class="sf-key-letter">f</kbd></span>`;

/* Sky palette, darkest at the top. */
/* The last stop is the page color (--page), so the hero fades into the section below with no seam. */
const SKY = ['#1a8a81', '#2a988e', '#3ba69b', '#52b4a8', '#6cc3b7', '#8ad2c6', '#acdfd5', '#cdece5', '#e6f2ee', '#f7f9f6'];
const RGB = SKY.map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)));
const BAYER = [0,32,8,40,2,34,10,42,48,16,56,24,50,18,58,26,12,44,4,36,14,46,6,38,60,28,52,20,62,30,54,22,3,35,11,43,1,33,9,41,51,19,59,27,49,17,57,25,15,47,7,39,13,45,5,37,63,31,55,23,61,29,53,21].map(n => (n + .5) / 64);

const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const smooth = t => t * t * (3 - 2 * t);
const clamp01 = t => Math.max(0, Math.min(1, t));
function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), u = smooth(x - xi), v = smooth(y - yi);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const ridge = x => .55 * noise(x * 3.1, 7.3) + .3 * noise(x * 8.7, 2.1) + .15 * noise(x * 21, 5.9);
const sky = g => {
  const top = SKY.length - 1, x = Math.max(0, Math.min(top, g)), i = Math.min(top - 1, Math.floor(x)), f = x - i;
  return RGB[i].map((c, k) => Math.round(c + (RGB[i + 1][k] - c) * f));
};

/* Deterministic plus-mark dither over a cols×rows grid. The sky is quantized into small levels; inside
   a level an 8×8 Bayer threshold decides which cells carry a lighter "+". A plus covers about a quarter of
   its cell, so it is drawn LIFT levels brighter and the average color stays continuous (no banding).
   The bottom gets an uneven pale ombre shaped by value noise. */
const STEP = .42, LIFT = STEP * 4;
export function ditherCells(cols, rows, {horizon: base = .6, ceiling = 9, ramp = 1} = {}) {
  const bg = new Uint8ClampedArray(cols * rows * 3), mark = new Uint8ClampedArray(cols * rows * 4);
  const top = SKY.length - 1;
  const aspect = cols / Math.max(1, rows);
  for (let x = 0; x < cols; x++) {
    const u = x / Math.max(1, cols - 1);
    const horizon = base + .16 * ridge(u * aspect * .55) - .07 * Math.exp(-((u - .5) ** 2) / .08);
    for (let y = 0; y < rows; y++) {
      const v = y / Math.max(1, rows - 1), t = (v - horizon) / (1 - horizon);
      let g = Math.pow(v, 1.35) * 5.2 * ramp;
      if (t > 0) g += (smooth(Math.min(1, t)) * 5 + (noise(u * aspect * 9, v * 9) - .5) * 1.6 * Math.min(1, t * 2.5)) * ramp;
      g = Math.max(0, Math.min(ceiling, g));
      // Bottom fifth: every column eases to the page color by the last row, so the hero ends on a straight,
      // seamless line instead of a jagged terrain edge.
      if (ceiling >= top) g += (top - g) * smooth(clamp01((v - .8) / .2));
      const level = Math.floor(g / STEP) * STEP, frac = (g - level) / STEP, i = y * cols + x;
      const settled = g >= top - .02; // fully faded: exact page color, no marks
      const [r, gr, b] = settled ? RGB[top] : sky(level);
      bg[i * 3] = r; bg[i * 3 + 1] = gr; bg[i * 3 + 2] = b;
      if (!settled && frac > BAYER[(y & 7) * 8 + (x & 7)]) {
        const [mr, mg, mb] = sky(level + LIFT);
        mark[i * 4] = mr; mark[i * 4 + 1] = mg; mark[i * 4 + 2] = mb; mark[i * 4 + 3] = 255;
      }
    }
  }
  return {bg, mark};
}

export function paintDither(canvas) {
  const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
  /* Sized from layout (not transforms), so scroll scaling never triggers a repaint. */
  const width = Math.round(canvas.offsetWidth * dpr), height = Math.round(canvas.offsetHeight * dpr);
  if (!width || !height || (canvas.width === width && canvas.height === height)) return;
  let ctx = null;
  try { ctx = canvas.getContext('2d'); } catch { /* no canvas support */ }
  if (!ctx) return;
  canvas.width = width; canvas.height = height;
  const cell = 6 * dpr, arm = 2 * dpr, bar = dpr;
  const cols = Math.ceil(width / cell), rows = Math.ceil(height / cell);
  const {bg, mark} = ditherCells(cols, rows, {horizon: Number(canvas.dataset.horizon) || undefined, ceiling: Number(canvas.dataset.ceiling) || undefined, ramp: Number(canvas.dataset.ramp) || undefined});
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = y * cols + x, px = x * cell, py = y * cell;
    ctx.fillStyle = `rgb(${bg[i * 3]},${bg[i * 3 + 1]},${bg[i * 3 + 2]})`;
    ctx.fillRect(px, py, cell, cell);
    if (!mark[i * 4 + 3]) continue;
    const cx = px + (cell >> 1), cy = py + (cell >> 1);
    ctx.fillStyle = `rgb(${mark[i * 4]},${mark[i * 4 + 1]},${mark[i * 4 + 2]})`;
    ctx.fillRect(cx - arm, cy, arm * 2 + bar, bar);
    ctx.fillRect(cx, cy - arm, bar, arm * 2 + bar);
  }
}

/* The prefilled hero question. VID01 has one annotated scissors-cut-cystic-duct triplet, 860–877 s. */
export const DEMO_QUESTION = 'When is the cystic duct cut?';
export const DEMO_SEEK = 860;

/* Footer mark as a plus dither. The keycap "surg + f" mark is drawn once per size into a coarse
   coverage grid (weight 600). Scroll progress raises the Bayer
   threshold, so the word fills in with "+" marks and darkens. Redraws only when the 64-step level changes. */
/* Cell size scales with width: 4 px on phones, 7 px on desktop. */
const footCell = width => Math.max(4, Math.min(7, Math.round(width / 200)));
export function footerMask(cols, rows) {
  let off;
  try { off = document.createElement('canvas'); off.width = cols; off.height = rows; } catch { return null; }
  const c = off.getContext?.('2d');
  if (!c) return null;
  const font = em => { c.font = `600 ${em}px "Inclusive Sans Variable", sans-serif`; c.letterSpacing = `${-0.03 * em}px`; };
  // Keycaps: rounded outlines around "surg" and "f", joined by "+", matching the CSS lockup proportions.
  font(100);
  const pad = .26, gap = .16, wS = c.measureText('surg').width / 100, wP = c.measureText('+').width / 100, wF = c.measureText('f').width / 100;
  const fKey = Math.max(wF + 2 * pad, 1.16); // single-letter key is square, like a real keycap
  const unit = (wS + 2 * pad) + gap + wP + gap + fKey;
  const em = Math.min(cols * .86 / unit, rows * .55);
  font(em);
  c.fillStyle = c.strokeStyle = '#000';
  c.lineWidth = .06 * em;
  const base = rows / 2 + .2 * em, top = base - .86 * em, h = 1.16 * em;
  let x = (cols - unit * em) / 2;
  const key = (label, w, kw) => {
    c.beginPath(); c.roundRect(x, top, kw * em, h, .2 * em); c.stroke();
    c.fillText(label, x + (kw - w) / 2 * em, base);
    x += kw * em;
  };
  key('surg', wS, wS + 2 * pad);
  x += gap * em; c.fillText('+', x, base); x += (wP + gap) * em;
  key('f', wF, fKey);
  const alpha = c.getImageData(0, 0, cols, rows).data, cover = new Uint8Array(cols * rows);
  for (let i = 0; i < cover.length; i++) cover[i] = alpha[i * 4 + 3] > 140 ? 1 : 0;
  return {cols, rows, cover};
}
export function paintFooterWord(canvas, progress, cache) {
  const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
  const w = canvas.offsetWidth, h = canvas.offsetHeight;
  if (!w || !h) return;
  const size = `${w}x${h}x${dpr}`;
  if (cache.size !== size) {
    const step = footCell(w);
    const mask = footerMask(Math.ceil(w / step), Math.ceil(h / step));
    if (!mask) return;
    Object.assign(cache, {size, mask, step, level: -1});
    canvas.width = w * dpr; canvas.height = h * dpr;
  }
  const level = Math.round((.14 + .86 * progress) * 64);
  if (level === cache.level) return;
  cache.level = level;
  let ctx = null;
  try { ctx = canvas.getContext('2d'); } catch { /* no canvas */ }
  if (!ctx) return;
  const {cols, rows, cover} = cache.mask, cell = cache.step * dpr, arm = Math.round(cache.step * .36 * dpr), bar = Math.max(1, Math.round(cache.step * .2 * dpr));
  const t = progress, mix = (a, b) => Math.round(a + (b - a) * t);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = `rgb(${mix(190, 104)},${mix(212, 160)},${mix(206, 150)})`;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (!cover[y * cols + x] || BAYER[(y & 7) * 8 + (x & 7)] * 64 >= level) continue;
    const px = x * cell + (cell >> 1), py = y * cell + (cell >> 1);
    ctx.fillRect(px - arm, py - (bar >> 1), arm * 2, bar);
    ctx.fillRect(px - (bar >> 1), py - arm, bar, arm * 2);
  }
}

const searchGlyph = `<svg class="glyph" aria-hidden="true" viewBox="0 0 24 24" fill="none"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 5 5"/></svg>`;
const clock = seconds => { const n = Math.floor(Number(seconds) || 0); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

/* Feature previews draw only from the saved backend fixtures passed in by main.js. */
function stepsPreview(steps) {
  const list = steps?.steps ?? [];
  const total = list.at(-1)?.end_sec || 1;
  return `<div class="fx-card"><div class="fx-head"><strong>VID01</strong><span>${list.length} steps</span></div>
    <div class="phase-bar" aria-hidden="true">${list.map(s => `<span class="${s.key === 'ClippingCutting' ? 'is-hit' : ''}" style="flex:${(s.end_sec - s.start_sec).toFixed(1)}"></span>`).join('')}</div>
    <ol class="step-list">${list.map(s => `<li class="${s.key === 'ClippingCutting' ? 'is-hit' : ''}"><span>${esc(s.label)}</span><span class="tnum">${clock(s.start_sec)}</span></li>`).join('')}</ol>
    <p class="fx-note">Phases from Cholec80. Total ${clock(total)}.</p></div>`;
}
function instrumentsPreview(timeline) {
  const rows = (timeline?.summary ?? []).slice().sort((a, b) => b.total_sec - a.total_sec);
  const max = rows[0]?.total_sec || 1;
  return `<div class="fx-card"><div class="fx-head"><strong>VID01</strong><span>Time on screen</span></div>
    <ul class="bar-list">${rows.map(r => `<li><span class="bar-label">${esc(r.label)}</span><span class="bar-track"><span style="width:${Math.max(3, r.total_sec / max * 100).toFixed(1)}%"></span></span><span class="tnum">${clock(r.total_sec)}</span></li>`).join('')}</ul>
    <p class="fx-note">Totals from dataset annotations. Intervals can overlap.</p></div>`;
}
function quizPreview(quiz) {
  const q = quiz?.questions?.[0];
  if (!q) return '';
  return `<div class="fx-card"><div class="fx-head"><strong>Question 1 of ${quiz.questions.length}</strong><span>${quiz.reviewed ? 'Reviewed' : 'Not yet clinically reviewed'}</span></div>
    <p class="fx-prompt">${esc(q.prompt)}</p>
    <ul class="fx-options">${q.options.map(o => `<li class="${o.id === q.correct_option_id ? 'is-correct' : ''}"><span class="opt-key">${o.id.toUpperCase()}</span>${esc(o.text)}</li>`).join('')}</ul></div>`;
}

const feature = ({id, title, body, action, command, horizon, preview, index}) => `<section class="feature stack-card" style="--i:${index}" aria-labelledby="${id}">
  <div class="feature-copy"><h2 id="${id}">${title}</h2><p>${body}</p><button type="button" class="btn-secondary" data-open-sample ${command ? `data-command="${command}"` : ''}>${action}</button></div>
  <div class="feature-visual"><canvas class="sky-dither" data-horizon="${horizon}" data-ceiling="7.2" aria-hidden="true"></canvas>${preview}</div>
</section>`;

/* Two versions of the homepage. `public`: the product. `demo` (/demo or ?demo, used to present the
   project): problem, solution (in place of "Find the clip"), features, the stack, model notes, the
   Databricks section and what's next (in place of "Open your own video"). */
export function homePage({videoUrl, filterOn, filterButton, error, showcase = {}, mode = 'public'}) {
  const demo = mode === 'demo';
  const findClip = `    <section class="case-section" id="case-preview" aria-labelledby="case-heading">
      <div class="case-copy"><h2 id="case-heading">Find the clip.</h2><p>Ask when a step happens and jump straight to the annotated moment.</p><button type="button" class="btn-primary" id="sample">Explore the demo</button></div>
      <div class="case-console"><div class="console-bar"><span class="console-case"><strong>VID01</strong><span>Cholecystectomy</span></span></div>
      <div class="preview-video surgical-media ${filterOn ? 'filtered' : ''}">${filterButton}<video src="${videoUrl}" muted playsinline preload="metadata" aria-label="Surgical footage from the VID01 demo case"></video><span class="preview-unavailable" hidden>Video preview unavailable. You can still open the case.</span></div>
      <button type="button" id="sample-event" class="find-result"><span class="find-query">${searchGlyph}${DEMO_QUESTION}</span><span class="find-time">14:20 <span aria-hidden="true">↗</span></span></button><div class="console-caption"><span>Annotated: scissors cut the cystic duct</span><span>Jump to this moment</span></div></div>
    </section>`;
  const features = `    <div class="feature-stack">
    ${feature({index: 0, id: 'feature-steps', title: 'Follow the operation, step by step.', body: 'Each case is split into its surgical phases. Select a step to jump straight to it.', action: 'Open the case timeline', horizon: .62, preview: stepsPreview(showcase.steps)})}
    ${feature({id: 'feature-chart', title: 'See which instruments appear, and for how long.', body: 'Time on screen for each instrument, totalled from the dataset annotations.', action: 'Show the instrument chart', command: '/chart instruments', horizon: .62, index: 1, preview: instrumentsPreview(showcase.timeline)})}
    ${feature({id: 'feature-quiz', title: 'Test yourself on the procedure.', body: 'Five questions on step order and instruments, each with an explanation and example clips.', action: 'Start the quiz', command: '/quiz', horizon: .62, index: 2, preview: quizPreview(showcase.quiz)})}
    </div>`;
  return `<main class="landing${demo ? ' is-demo' : ''}" id="main-content">
    <nav class="hero-nav" aria-label="Main"><a class="small-brand" href="#top" aria-label="surg+f, back to top">${wordmark()}</a><button type="button" id="open-sample" class="nav-case">Open a case</button></nav>
    <section class="landing-intro" aria-labelledby="landing-title">
      <div class="intro-sticky">
        <div class="hero-frame">
          <canvas class="sky-dither hero-dither" aria-hidden="true"></canvas>
          <div class="intro-copy"><h1 id="landing-title">${wordmark('sf-hero')}</h1><p>Search surgical video.</p><a class="hero-demo-link" href="${demo ? '#problem' : '#case-preview'}">${demo ? 'See the problem' : 'See the demo'} <span aria-hidden="true">↓</span></a></div>
          <form class="hero-search" id="hero-search" role="search">
            <label class="sr-only" for="hero-q">Ask about the VID01 demo case</label>
            ${searchGlyph}<input id="hero-q" name="q" value="${DEMO_QUESTION}" placeholder="Ask about the VID01 demo case" autocomplete="off" spellcheck="false" required>
            <button type="submit" aria-label="Search VID01"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></button>
          </form>
        </div>
      </div>
    </section>
    ${demo ? `${problemSection()}\n${solutionSection()}` : findClip}
    ${features}
    ${architectureSection()}
    ${modelSection()}
    ${demo ? `${databricksSection()}\n${futureSection()}` : ''}
    ${demo ? '' : `    <section class="local-section" aria-labelledby="local-heading"><div><h2 id="local-heading">Open your own video.</h2><p>MP4 and MOV files open for local playback. Indexed search covers the demo cases.</p></div><button type="button" id="drop-zone" class="btn-secondary local-open" aria-label="Open a local MP4 or MOV for playback only">Open a video</button><input type="file" id="file-input" accept="video/mp4,video/quicktime,.mp4,.mov" hidden>${error ? `<p class="home-error" role="alert">${error}</p>` : ''}</section>`}
    <footer class="site-footer" aria-label="About surg+f">
      <div class="footer-sticky">
        <div class="footer-top">
          <div class="footer-identity"><p>Search surgical video.</p></div>
          <nav class="footer-links" aria-label="Footer">${demo ? '<a href="#problem">The problem</a><a href="#solution">The solution</a>' : '<a href="#case-preview">The demo</a>'}<a href="#architecture">The stack</a><a href="#model-notes">Model</a>${demo ? '<a href="#databricks">Databricks</a><a href="#future">What’s next</a>' : ''}<a href="#top">Back to top</a></nav>
        </div>
        <canvas class="footer-word" aria-hidden="true"></canvas>
        <div class="footer-legal"><span>Aadhitya Balaji, Shlok Jadhav, Mihir Kaushal, Rohan Nuthi</span><span>MadHacks 2026</span></div>
      </div>
    </footer>
  </main>`;
}

export function mountHome(root) {
  if (!root) return () => {};
  const intro = root.querySelector('.landing-intro');
  const canvases = [...root.querySelectorAll('.sky-dither')];
  const footer = root.querySelector('.site-footer');
  const stack = [...root.querySelectorAll('.stack-card')];
  const nav = root.querySelector('.hero-nav');
  const footerWord = root.querySelector('.footer-word');
  const footerCache = {};
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;
  const update = () => {
    frame = 0;
    const progress = media.matches ? 0 : Math.max(0, Math.min(1, -intro.getBoundingClientRect().top / Math.max(1, intro.offsetHeight - window.innerHeight)));
    root.style.setProperty('--journey', progress.toFixed(4));
    /* Footer word widens and gains weight across the footer's extra scroll length, like Hangar's. */
    if (footer) {
      const span = Math.max(1, footer.offsetHeight - window.innerHeight);
      const fp = media.matches ? 1 : Math.max(0, Math.min(1, -footer.getBoundingClientRect().top / span));
      footer.style.setProperty('--footer-progress', fp.toFixed(4));
      if (footerWord) paintFooterWord(footerWord, fp, footerCache);
    }
    const vh = window.innerHeight;
    /* Stacked cards: each card shrinks and dims as the next one slides over it. */
    stack.forEach((card, i) => {
      const next = stack[i + 1];
      const cover = !next || media.matches ? 0 : Math.max(0, Math.min(1, (vh - next.getBoundingClientRect().top) / (vh - card.getBoundingClientRect().top || 1)));
      // Cards keep their size (like Hangar's stack); only the covered card's content dims.
      card.style.setProperty('--cover', cover.toFixed(3));
    });
    updateArchitecture(root, media.matches);
    /* The logo and "Open a case" stay pinned; past the hero they switch to the light page style. */
    nav?.classList.toggle('is-solid', intro.getBoundingClientRect().bottom < 80);
    canvases.forEach(paintDither);
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  /* In-page links scroll the window only. scrollIntoView would also scroll the clipped hero layers
     (the old logo-click glitch). "#top" returns to the start, where the frame is fully inset. */
  const jump = event => {
    /* Layer map: each label digs straight to its layer. */
    const dig = event.target.closest?.('[data-dig]');
    if (dig) {
      const top = digScrollTop(dig.closest('.dig'), Number(dig.dataset.dig));
      const section = dig.closest('.dig');
      const scene = digScenes(root).find(sc => sc.section === section && sc.index === Number(dig.dataset.dig));
      if (scene) playScene(scene); else if (top !== null) window.scrollTo(0, top);
      return;
    }
    const link = event.target.closest?.('a[href^="#"]');
    if (!link) return;
    const id = link.getAttribute('href').slice(1);
    const target = id === 'top' ? null : document.getElementById(id);
    if (id !== 'top' && !target) return;
    event.preventDefault();
    const top = target ? target.getBoundingClientRect().top + window.scrollY : 0;
    window.scrollTo({top, behavior: media.matches ? 'auto' : 'smooth'});
  };
  window.addEventListener('scroll', schedule, {passive:true});
  window.addEventListener('resize', schedule);
  media.addEventListener('change', schedule);
  root.addEventListener('click', jump);
  /* Keyboard focus on a hidden layer's link brings that layer into view. */
  const reveal = event => {
    const layer = event.target.closest?.('.layer:not(.is-on)');
    const top = layer ? digScrollTop(layer.closest('.dig'), Number(layer.dataset.layer)) : null;
    if (top !== null) window.scrollTo({top, behavior: 'auto'});
  };
  root.addEventListener('focusin', reveal);
  /* Presenter shortcut (deliberately not shown on the page). Right moves quickly to the next scene, then
     plays its animation slowly. Left slowly unplays the current scene, then moves quickly back to the
     previous scene's finished state. Mid-scene, Right finishes the scene and Left rewinds it. A press
     during a glide counts from where the glide is headed, so every press is one scene. Ignored while
     typing or with a modifier held; a wheel, touch or click cancels the glide. Chapter buttons use the
     same motion. */
  const PLAY_MS = 3200;
  let glide = 0, aim = null;
  const stopGlide = () => { cancelAnimationFrame(glide); glide = 0; aim = null; };
  const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const easeSine = t => .5 - Math.cos(Math.PI * t) / 2;
  const moveMs = dist => Math.min(1500, 450 + Math.abs(dist) / window.innerHeight * 260);
  /* Runs legs one after another: each leg is {to, ms, ease}. */
  const run = (legs, target) => {
    cancelAnimationFrame(glide);
    if (media.matches) { aim = null; window.scrollTo(0, target); return; }
    aim = target;
    let i = 0, from = window.scrollY, start = performance.now();
    const tick = now => {
      const leg = legs[i];
      const t = leg.ms ? Math.min(1, (now - start) / leg.ms) : 1;
      window.scrollTo(0, from + (leg.to - from) * leg.ease(t));
      if (t < 1) { glide = requestAnimationFrame(tick); return; }
      i += 1; from = leg.to; start = now;
      if (i < legs.length) glide = requestAnimationFrame(tick); else { glide = 0; aim = null; }
    };
    glide = requestAnimationFrame(tick);
  };
  const legs = (y, list) => list.filter(([to]) => Math.abs(to - y) > 2).reduce((out, [to, kind]) => {
    const prev = out.length ? out[out.length - 1].to : y;
    out.push(kind === 'play' ? {to, ms: Math.max(600, PLAY_MS * Math.min(1, Math.abs(to - prev) / Math.max(1, window.innerHeight * 1.4))), ease: easeSine} : {to, ms: moveMs(to - prev), ease: easeInOut});
    return out;
  }, []);
  const playScene = scene => { const y = window.scrollY; const l = legs(y, [[scene.start, 'move'], [scene.end, 'play']]); if (l.length) run(l, scene.end); };
  const step = event => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.defaultPrevented) return;
    if (event.target.closest?.('input, textarea, select, [contenteditable="true"], video')) return;
    event.preventDefault();
    const scenes = digScenes(root), y = window.scrollY, from = aim ?? y;
    if (event.key === 'ArrowRight') {
      const next = scenes.find(sc => sc.end > from + 4);
      if (!next) return;
      const inside = from >= next.start - 4;
      run(legs(y, inside ? [[next.end, 'play']] : [[next.start, 'move'], [next.end, 'play']]), next.end);
    } else {
      const k = scenes.findLastIndex(sc => sc.start < from - 4);
      if (k < 0) { if (from > 4) run(legs(y, [[0, 'move']]), 0); return; }
      const cur = scenes[k], prev = scenes[k - 1];
      if (from > cur.end + 4) { run(legs(y, [[cur.end, 'move']]), cur.end); return; }
      const back = prev ? prev.end : 0;
      run(legs(y, [[cur.start, 'play'], [back, 'move']]), back);
    }
  };
  ['wheel', 'touchstart', 'mousedown'].forEach(type => window.addEventListener(type, stopGlide, {passive: true}));
  window.addEventListener('keydown', step);
  /* Hero keys: pressing a key sinks only that key, like a real keycap. Purely visual: it does not move
     focus or touch the search box, and the browser's own Ctrl+F is never intercepted. */
  const press = root.querySelector('.sf-hero');
  let pressTimer = 0;
  const onDown = event => {
    const key = event.target.closest?.('kbd');
    if (!key) return;
    key.classList.add('is-pressed');
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => key.classList.remove('is-pressed'), 140);
  };
  press?.addEventListener('pointerdown', onDown);
  const video = root.querySelector('video');
  const unavailable = () => { root.querySelector('.preview-unavailable').hidden = false; };
  video?.addEventListener('error', unavailable); // the demo version has no preview video
  update();
  root.ownerDocument?.fonts?.ready?.then(() => { footerCache.size = null; schedule(); });
  return () => { window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); media.removeEventListener('change', schedule); root.removeEventListener('click', jump); root.removeEventListener('focusin', reveal); window.removeEventListener('keydown', step); stopGlide(); ['wheel', 'touchstart', 'mousedown'].forEach(type => window.removeEventListener(type, stopGlide)); press?.removeEventListener('pointerdown', onDown); clearTimeout(pressTimer); video?.removeEventListener('error', unavailable); cancelAnimationFrame(frame); };
}
