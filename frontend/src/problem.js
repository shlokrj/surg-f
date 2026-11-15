/* "Finding one moment": the problem statement for the demo version of the homepage. A pinned stage
   (same mechanics as architecture.js) in three chapters, drawn from real VID01 frames and data:
   VID01 runs 1,728 s (28:48); the cystic duct is cut at 860–877 s (shared/triplets.annotation.csv);
   instrument lanes are the surgeons' annotations (architecture.js TRACKS). */
import { onStage, paintFrames, cachedFrame, TRACKS, VID01_LEN } from './architecture.js';

const CUT = [860, 877];
const SAMPLES = Array.from({length: 24}, (_, i) => 36 + i * 72); // one frame every 72 s across VID01
const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const pct = v => `${(v * 100).toFixed(3)}%`;
const frame = (t, w = 160, h = 90) => `<canvas class="vf" data-t="${t}" width="${w}" height="${h}" aria-hidden="true"></canvas>`;
const strip = () => `<div class="pb-strip">${SAMPLES.map(t => `<span>${frame(t)}</span>`).join('')}</div>`;
/* Where the scrubber looks while you hunt for the cut, then where it lands (fractions of the video). */
const HUNT = [.1, .74, .3, .62, .41, .55, CUT[0] / VID01_LEN];

const CHAPTERS = [
  {
    id: 'length', name: 'Half an hour',
    title: 'A surgery is half an hour of video.',
    body: 'VID01, one gallbladder removal from the CholecT50 dataset, is a single recording of 28 minutes 48 seconds. The dataset has 50 recordings like it.',
    note: 'Real VID01 frames, one every 72 seconds, folding into its time line.',
    scene: () => `<div class="sc pb-length">${SAMPLES.map((t, i) => {
      const c = i % 6, r = Math.floor(i / 6);
      return `<span class="pb-tile" style="--x0:${14 + c * 90}px;--y0:${96 + r * 56}px;--x1:${14 + i * 532 / 24}px;--w1:${(532 / 24).toFixed(2)}px;--st:${((c + r) * .02).toFixed(3)}">${frame(t)}</span>`;
    }).join('')}
      <div class="pb-total"><b data-clock="${VID01_LEN}">0:00</b><span>VID01, start to finish</span></div>
      <div class="pb-ticks"><span>0:00</span><span>14:24</span><span>28:48</span></div></div>`,
  },
  {
    id: 'needle', name: '17 seconds',
    title: 'The moment you need lasts 17 seconds.',
    body: 'The cystic duct is cut at 14:20 and it is over by 14:37. That is about 1% of the video. Without an index, finding it means scrubbing back and forth until you land on it.',
    note: 'The cut, 860–877 s, from the surgeons’ annotations. Preview frames are real VID01 frames.',
    scene: () => `<div class="sc pb-needle" style="--cx:${pct(CUT[0] / VID01_LEN)};--cw:${pct((CUT[1] - CUT[0]) / VID01_LEN)}">
      <div class="pb-preview"><canvas class="pv" width="854" height="480" aria-hidden="true"></canvas><span class="pv-time" data-hunt>0:00</span><canvas class="vf" data-t="860.16" width="2" height="2" hidden></canvas></div>
      <div class="pb-bar">${strip()}<span class="pb-cut"></span><span class="pb-knob"></span></div>
      <div class="pb-callout"><b>Cystic duct cut</b><span>14:20 to 14:37, 17 s of 1,728 s</span></div></div>`,
  },
  {
    id: 'index', name: 'No index',
    title: 'Video has no index.',
    body: 'Nothing in a video file says what happens when. Surgeons labeled every second of CholecT50 by hand; Surg+F learns from those labels and makes every second searchable, so the cut is one question away.',
    note: 'Instrument lanes are the surgeons’ annotations for VID01.',
    scene: () => `<div class="sc pb-index" style="--cx:${pct(CUT[0] / VID01_LEN)}">
      <div class="pb-ask"><span class="pb-glyph" aria-hidden="true"></span><span class="pb-q" data-type="When is the cystic duct cut?"></span></div>
      <div class="pb-bar small">${strip()}<span class="pb-jump"></span></div>
      <div class="pb-lanes">${Object.entries(TRACKS).map(([name, segs], k) => `<div class="pb-lane${name === 'scissors' ? ' is-cut' : ''}" style="--k:${k}"><span>${name}</span><span class="tr">${segs.map(([s, e]) => `<i style="left:${pct(s / VID01_LEN)};width:${pct(Math.max(2, e - s) / VID01_LEN)}"></i>`).join('')}</span></div>`).join('')}</div>
      <div class="pb-hit"><b>14:20</b><span>scissors, cystic duct. One question, one jump.</span></div></div>`,
  },
];

export function problemSection() {
  return `<section class="dig dig-model dig-problem" id="problem" aria-labelledby="problem-heading" data-intro="0" data-per="1.2" style="--travel:3.6;--nav:1">
    <div class="dig-pin">
      <div class="mn-heading"><h2 id="problem-heading">Finding one moment.</h2></div>
      <div class="dig-map"><ol class="dig-labels" aria-label="The problem">${CHAPTERS.map((c, i) => `<li><button type="button" data-dig="${i}"><span>${i + 1}</span>${c.name}</button></li>`).join('')}</ol></div>
      ${CHAPTERS.map((c, i) => `<div class="layer" id="problem-${c.id}" data-layer="${i}" style="--p:0;--s:1">
        <div class="dig-copy layer-copy"><h3>${c.title}</h3><p>${c.body}</p></div>
        <div class="pit" style="--k:${i}" role="img" aria-label="${c.name} animation"><canvas class="sky-dither" data-horizon=".72" data-ceiling="4.6" aria-hidden="true"></canvas><div class="fit">${c.scene()}</div><p class="v-cap">${c.note}</p></div>
      </div>`).join('')}
    </div>
  </section>`;
}

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = v => 1 - Math.pow(1 - v, 3);
const setText = (el, text) => { if (el && el.textContent !== text) el.textContent = text; };
/* Piecewise scrubber position: hops between HUNT points as p goes from .08 to .8. */
const huntAt = p => {
  const u = clamp((p - .08) / .72) * (HUNT.length - 1), i = Math.min(HUNT.length - 2, Math.floor(u));
  const f = u - i, e = f * f * (3 - 2 * f);
  return HUNT[i] + (HUNT[i + 1] - HUNT[i]) * e;
};
let shown = null;
onStage((section, ps) => {
  if (section.id !== 'problem') return;
  paintFrames(section);
  const clockEl = section.querySelector('[data-clock]');
  setText(clockEl, clock(Number(clockEl.dataset.clock) * ease(clamp((ps[0] - .3) / .45))));
  /* Hunting scrubber: the knob, the timestamp and the preview frame follow the scroll. */
  const needle = section.querySelector('.pb-needle');
  const x = huntAt(ps[1]);
  needle.style.setProperty('--hx', x.toFixed(4));
  const t = x * VID01_LEN;
  setText(section.querySelector('[data-hunt]'), clock(t));
  const landed = Math.abs(t - CUT[0]) < 1;
  const nearest = landed ? 860.16 : SAMPLES.reduce((a, b) => Math.abs(b - t) < Math.abs(a - t) ? b : a);
  const src = cachedFrame(nearest);
  const pv = section.querySelector('.pv');
  if (src && shown !== nearest) { pv.getContext('2d')?.drawImage(src, 0, 0, pv.width, pv.height); pv.classList.add('is-painted'); shown = nearest; }
  /* The answer: the question types itself, then the jump lands on 14:20. */
  const q = section.querySelector('.pb-q');
  setText(q, q.dataset.type.slice(0, Math.round(q.dataset.type.length * clamp((ps[2] - .4) / .2))));
});
