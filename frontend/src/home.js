
export function homePage({videoUrl, filterOn, filterButton, error}) {
  return `<main class="landing" id="main-content">
    <section class="landing-intro" aria-labelledby="landing-title">
      <div class="intro-sticky">
        <div class="surgical-field" aria-hidden="true"><span class="field-ring"></span><span class="field-axis horizontal"></span><span class="field-axis vertical"></span><i class="field-mark mark-a">+</i><i class="field-mark mark-b">+</i><i class="field-mark mark-c">+</i><i class="field-mark mark-d">+</i></div>
        <div class="intro-copy"><h1 id="landing-title">Surg<span class="word-plus">+</span>F<span class="word-cursor" aria-hidden="true"></span></h1><p>Find a moment in surgery.</p><button type="button" class="landing-button" id="open-sample">Open a case <span aria-hidden="true">↗</span></button></div>
        <div class="intro-foot"><span>Surgical video search</span><a href="#case-preview">Scroll to explore <span aria-hidden="true">↓</span></a><span class="shortcut-note"><kbd>ctrl</kbd><span>+</span><kbd>F</kbd><span>for surgical video</span></span></div>
      </div>
    </section>
    <section class="case-section" id="case-preview" aria-labelledby="case-heading">
      <div class="case-copy"><h2 id="case-heading">Less scrubbing.<br>More finding.</h2><p>Search by instrument. Go straight to the matching part of an annotated operation.</p><button type="button" class="landing-link" id="sample">Explore the demo <span aria-hidden="true">↗</span></button></div>
      <div class="case-console"><div class="console-bar"><span>VID01 · Cholecystectomy</span>${filterButton}</div>
      <div class="preview-video surgical-media ${filterOn ? 'filtered' : ''}"><video src="${videoUrl}" muted playsinline preload="metadata" aria-label="Surgical footage from the VID01 demo case"></video><span class="preview-unavailable" hidden>Video preview unavailable. You can still open the case.</span></div>
      <button type="button" id="sample-event" class="find-result"><span class="find-query"><span aria-hidden="true">⌕</span> clipper</span><span class="find-time">11:14 <span aria-hidden="true">↗</span></span></button><div class="console-caption"><span>Dataset annotation</span><span>Jump to this moment</span></div></div>
    </section>
    <section class="local-section" aria-labelledby="local-heading"><div><h2 id="local-heading">Your video, too.</h2><p>Open an MP4 or MOV for local playback.<br>Indexed search is available in the demo cases.</p></div><button type="button" id="drop-zone" class="local-open" aria-label="Open a local MP4 or MOV for playback only">Open a video <span aria-hidden="true">＋</span></button><input type="file" id="file-input" accept="video/mp4,video/quicktime,.mp4,.mov" hidden>${error ? `<p class="home-error" role="alert">${error}</p>` : ''}</section>
    <footer class="landing-footer"><span>Surg+F</span><a href="#landing-title">Back to top ↑</a></footer>
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
