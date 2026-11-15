/* Wordmark: the real "+" glyph sits where the font puts it; the lens and handle are drawn around it. */
const lens = `<svg class="sf-lens" aria-hidden="true" viewBox="0 0 100 100" fill="none"><circle cx="40" cy="40" r="31"/><path d="M62 62 82 82"/></svg>`;
export const wordmark = (cls = '') => `<span class="sf-mark ${cls}">surg<span class="sf-plus">+${lens}</span>f</span>`;

/* Sky palette, darkest at the top. The dither quantizes a smooth ramp into these steps. */
const SKY = ['#1a8a81', '#2a988e', '#3ba69b', '#52b4a8', '#6cc3b7', '#8ad2c6', '#acdfd5', '#cdece5', '#e8f7f3', '#f8fdfb'];
const RGB = SKY.map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)));
const BAYER = [0,32,8,40,2,34,10,42,48,16,56,24,50,18,58,26,12,44,4,36,14,46,6,38,60,28,52,20,62,30,54,22,3,35,11,43,1,33,9,41,51,19,59,27,49,17,57,25,15,47,7,39,13,45,5,37,63,31,55,23,61,29,53,21].map(n => (n + .5) / 64);

const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const smooth = t => t * t * (3 - 2 * t);
function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), u = smooth(x - xi), v = smooth(y - yi);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const ridge = x => .55 * noise(x * 3.1, 7.3) + .3 * noise(x * 8.7, 2.1) + .15 * noise(x * 21, 5.9);

/* Deterministic ordered dither for a w×h cell grid: sky ramp on top, uneven pale ombre along the bottom. */
export function ditherPixels(w, h) {
  const out = new Uint8ClampedArray(w * h * 4), top = SKY.length - 1, aspect = w / Math.max(1, h);
  for (let x = 0; x < w; x++) {
    const u = x / Math.max(1, w - 1);
    const horizon = .6 + .16 * ridge(u * aspect * .55) - .07 * Math.exp(-((u - .5) ** 2) / .08);
    for (let y = 0; y < h; y++) {
      const v = y / Math.max(1, h - 1);
      let g = Math.pow(v, 1.35) * 5.2;
      const t = (v - horizon) / (1 - horizon);
      if (t > 0) g += smooth(Math.min(1, t)) * 5 + (noise(u * aspect * 9, v * 9) - .5) * 1.6 * Math.min(1, t * 2.5);
      g = Math.max(0, Math.min(top, g));
      const base = Math.floor(g), step = g - base > BAYER[(y & 7) * 8 + (x & 7)] ? 1 : 0;
      const [r, gr, b] = RGB[Math.min(top, base + step)], i = (y * w + x) * 4;
      out[i] = r; out[i + 1] = gr; out[i + 2] = b; out[i + 3] = 255;
    }
  }
  return out;
}

export function paintDither(canvas, cell = 3) {
  /* Sized from layout (not transforms), so scroll scaling never triggers a repaint. */
  const w = Math.max(1, Math.ceil(canvas.offsetWidth / cell)), h = Math.max(1, Math.ceil(canvas.offsetHeight / cell));
  if (canvas.width === w && canvas.height === h) return;
  let ctx = null;
  try { ctx = canvas.getContext('2d'); } catch { /* no canvas support */ }
  if (!ctx || typeof ImageData === 'undefined') return;
  canvas.width = w; canvas.height = h;
  ctx.putImageData(new ImageData(ditherPixels(w, h), w, h), 0, 0);
}

const searchGlyph = `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 5 5"/></svg>`;

export function homePage({videoUrl, filterOn, filterButton, error}) {
  return `<main class="landing" id="main-content">
    <section class="landing-intro" aria-labelledby="landing-title">
      <div class="intro-sticky">
        <div class="hero-frame">
          <canvas class="sky-dither" aria-hidden="true"></canvas>
          <nav class="hero-nav" aria-label="Main"><a class="small-brand" href="#landing-title" aria-label="surg+f home">${wordmark()}</a><button type="button" id="open-sample" class="nav-case">Open a case</button></nav>
          <div class="intro-copy"><h1 id="landing-title">${wordmark('sf-hero')}</h1><p>Search surgical video.</p><a class="hero-demo-link" href="#case-preview">See the demo <span aria-hidden="true">↓</span></a></div>
          <a href="#case-preview" class="hero-preview-edge" aria-label="Jump to the clipper example in VID01">
            <span class="edge-query">${searchGlyph}clipper</span>
            <span class="edge-hit"><span>VID01</span><span class="edge-time">11:14</span></span>
          </a>
        </div>
      </div>
    </section>
    <section class="case-section" id="case-preview" aria-labelledby="case-heading">
      <div class="case-copy"><h2 id="case-heading">Find the clip.</h2><p>Search an instrument to jump to its annotated timestamp.</p><button type="button" class="landing-link" id="sample">Explore the demo <span aria-hidden="true">↗</span></button></div>
      <div class="case-console"><div class="console-bar"><span class="console-case"><strong>VID01</strong><span>Cholecystectomy</span></span>${filterButton}</div>
      <div class="preview-video surgical-media ${filterOn ? 'filtered' : ''}"><video src="${videoUrl}" muted playsinline preload="metadata" aria-label="Surgical footage from the VID01 demo case"></video><span class="preview-unavailable" hidden>Video preview unavailable. You can still open the case.</span></div>
      <button type="button" id="sample-event" class="find-result"><span class="find-query">${searchGlyph}clipper</span><span class="find-time">11:14 <span aria-hidden="true">↗</span></span></button><div class="console-caption"><span>Dataset annotation</span><span>Jump to this moment</span></div></div>
    </section>
    <section class="local-section" aria-labelledby="local-heading"><div><h2 id="local-heading">Open your video.</h2><p>Open an MP4 or MOV for local playback.<br>Indexed search is available in the demo cases.</p></div><button type="button" id="drop-zone" class="local-open" aria-label="Open a local MP4 or MOV for playback only">Open a video <span aria-hidden="true">＋</span></button><input type="file" id="file-input" accept="video/mp4,video/quicktime,.mp4,.mov" hidden>${error ? `<p class="home-error" role="alert">${error}</p>` : ''}</section>
    <footer class="landing-footer">${wordmark()}<a href="#landing-title">Back to top ↑</a></footer>
  </main>`;
}

export function mountHome(root) {
  if (!root) return () => {};
  const intro = root.querySelector('.landing-intro');
  const canvas = root.querySelector('.sky-dither');
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;
  const update = () => {
    frame = 0;
    const progress = media.matches ? 0 : Math.max(0, Math.min(1, -intro.getBoundingClientRect().top / Math.max(1, intro.offsetHeight - window.innerHeight)));
    root.style.setProperty('--journey', progress.toFixed(4));
    if (canvas) paintDither(canvas);
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  window.addEventListener('scroll', schedule, {passive:true});
  window.addEventListener('resize', schedule);
  media.addEventListener('change', schedule);
  const video = root.querySelector('video');
  const unavailable = () => { root.querySelector('.preview-unavailable').hidden = false; };
  video.addEventListener('error', unavailable);
  update();
  return () => { window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); media.removeEventListener('change', schedule); video.removeEventListener('error', unavailable); cancelAnimationFrame(frame); };
}
