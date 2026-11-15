export const findMark = `<svg class="find-mark" aria-hidden="true" viewBox="0 0 100 100" fill="none"><circle cx="42" cy="42" r="29"/><path d="m64 64 24 24M42 28v28M28 42h28"/></svg>`;

export function plusDither() {
  const marks = [];
  for (let y = 0; y < 38; y++) for (let x = 0; x < 76; x++) {
    const u = x / 75, v = y / 37;
    const edge = Math.abs(u - .5) * 2;
    const wave = .5 + .5 * Math.sin(u * 8 + v * 5);
    const density = Math.max(0, Math.min(.88, edge * .55 + v * .38 + wave * .12 - .19));
    const noise = ((x * 73 + y * 151 + x * y * 19) % 997) / 997;
    if (noise < density) {
      const px = x * 20, py = y * 20;
      marks.push(`<path d="M${px-2.5} ${py}h5M${px} ${py-2.5}v5" opacity="${(.16 + density * .42).toFixed(2)}"/>`);
    }
  }
  return `<svg class="plus-dither" viewBox="0 0 1500 740" preserveAspectRatio="xMidYMid slice" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1">${marks.join('')}</svg>`;
}

export function homePage({videoUrl, filterOn, filterButton, error}) {
  return `<main class="landing" id="main-content">
    <section class="landing-intro" aria-labelledby="landing-title">
      <div class="intro-sticky">
        <div class="hero-frame">
          ${plusDither()}
          <nav class="hero-nav" aria-label="Main"><a class="small-brand" href="#landing-title" aria-label="surg+f home">surg${findMark}f</a><button type="button" id="open-sample" class="nav-case">Open a case <span aria-hidden="true">↗</span></button></nav>
          <div class="intro-copy"><h1 id="landing-title" aria-label="surg+f"><span>surg</span>${findMark}<span>f</span></h1><p>Search surgical video.</p><a class="hero-demo-link" href="#case-preview">See the demo <span aria-hidden="true">↓</span></a></div>
          <a href="#case-preview" class="hero-preview-edge" aria-label="Explore the VID01 demo"><span>VID01</span><span>Cholecystectomy</span><span aria-hidden="true">↗</span></a>
        </div>
      </div>
    </section>
    <section class="case-section" id="case-preview" aria-labelledby="case-heading">
      <div class="case-copy"><h2 id="case-heading">Find the clip.</h2><p>Search an instrument to jump to its annotated timestamp.</p><button type="button" class="landing-link" id="sample">Explore the demo <span aria-hidden="true">↗</span></button></div>
      <div class="case-console"><div class="console-bar"><span>VID01 · Cholecystectomy</span>${filterButton}</div>
      <div class="preview-video surgical-media ${filterOn ? 'filtered' : ''}"><video src="${videoUrl}" muted playsinline preload="metadata" aria-label="Surgical footage from the VID01 demo case"></video><span class="preview-unavailable" hidden>Video preview unavailable. You can still open the case.</span></div>
      <button type="button" id="sample-event" class="find-result"><span class="find-query"><span aria-hidden="true">⌕</span> clipper</span><span class="find-time">11:14 <span aria-hidden="true">↗</span></span></button><div class="console-caption"><span>Dataset annotation</span><span>Jump to this moment</span></div></div>
    </section>
    <section class="local-section" aria-labelledby="local-heading"><div><h2 id="local-heading">Open your video.</h2><p>Open an MP4 or MOV for local playback.<br>Indexed search is available in the demo cases.</p></div><button type="button" id="drop-zone" class="local-open" aria-label="Open a local MP4 or MOV for playback only">Open a video <span aria-hidden="true">＋</span></button><input type="file" id="file-input" accept="video/mp4,video/quicktime,.mp4,.mov" hidden>${error ? `<p class="home-error" role="alert">${error}</p>` : ''}</section>
    <footer class="landing-footer"><span>surg+f</span><a href="#landing-title">Back to top ↑</a></footer>
  </main>`;
}

export function mountHome(root) {
  if (!root) return () => {};
  const intro = root.querySelector('.landing-intro');
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;
  const update = () => {
    frame = 0;
    const progress = media.matches ? 0 : Math.max(0, Math.min(1, -intro.getBoundingClientRect().top / Math.max(1, intro.offsetHeight - window.innerHeight)));
    root.style.setProperty('--journey', progress.toFixed(4));
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
