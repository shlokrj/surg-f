/* "Finding one moment": the problem statement for the demo version of the homepage. A pinned stage
   (same mechanics as architecture.js) in three chapters, drawn from real VID01 frames and data:
   VID01 runs 1,733 s (28:53); the cystic duct is cut at 860–877 s (shared/triplets.annotation.csv);
   instrument lanes are the surgeons' annotations (architecture.js TRACKS). */
import { onStage, paintFrames, cachedFrame, TRACKS, VID01_LEN, layerP, pickChapters } from './architecture.js';

const CUT = [860, 877];
const SAMPLES = Array.from({length: 24}, (_, i) => 36 + i * 72); // one frame every 72 s across VID01
const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const pct = v => `${(v * 100).toFixed(3)}%`;
const frame = (t, w = 160, h = 90) => `<canvas class="vf" data-t="${t}" width="${w}" height="${h}" aria-hidden="true"></canvas>`;
export const frameStrip = () => `<div class="pb-strip">${SAMPLES.map(t => `<span>${frame(t)}</span>`).join('')}</div>`;
/* Where the scrubber looks while you hunt for the cut, then where it lands (fractions of the video). */
const HUNT = [.1, .74, .3, .62, .41, .55, CUT[0] / VID01_LEN];
/* VID01 steps (backend/fixtures/steps.VID01.json, Cholec80 phases) with the instruments annotated in each
   (shared/triplets.annotation.csv). */
export const RECORD = [
  ['Preparation', 0, 21, 'grasper, hook'],
  ['Calot’s triangle dissection', 21, 673, 'grasper, hook, bipolar, irrigator'],
  ['Clipping and cutting', 673, 887, 'grasper, clipper, scissors'],
  ['Gallbladder dissection', 887, 1470, 'grasper, hook, bipolar, irrigator'],
  ['Gallbladder packaging', 1470, 1568, 'grasper'],
  ['Cleaning and coagulation', 1568, 1641, 'grasper, irrigator'],
  ['Gallbladder removal', 1641, 1733, 'grasper'],
];
/* Who needs one moment, each pinned to a real VID01 interval (shared/triplets.annotation.csv). The clipper
   count is the surgeon-labeled clipper clips across all 50 surgeries (agent-kit/PROGRESS.md). */
const USES = [
  {who: 'Residents', what: 'Watch the cystic duct being clipped', when: '11:38 to 12:27', at: [[698, 747]]},
  {who: 'Surgeons', what: 'Review the gallbladder dissection before a case', when: '9:21 to 10:58', at: [[561, 658]]},
  {who: 'Educators', what: 'Cut the duct division into a lesson', when: '14:20 to 14:37', at: [[860, 877]]},
  {who: 'Researchers', what: 'Compare clipping across operations', when: '154 clipper clips in 50 surgeries', at: [[674, 690], [698, 747], [749, 758], [815, 844]]},
];

const CHAPTERS = [
  {
    id: 'length', name: 'Half an hour',
    title: 'A surgery is half an hour of video.',
    body: 'VID01, one gallbladder removal from the CholecT50 dataset, is a single recording of 28 minutes 53 seconds. The dataset has 50 recordings like it.',
    note: 'Real VID01 frames, one every 72 seconds, folding into its time line.',
    scene: () => `<div class="sc pb-length">${SAMPLES.map((t, i) => {
      const c = i % 6, r = Math.floor(i / 6);
      return `<span class="pb-tile" style="--x0:${14 + c * 90}px;--y0:${96 + r * 56}px;--x1:${14 + i * 532 / 24}px;--w1:${(532 / 24).toFixed(2)}px;--st:${((c + r) * .02).toFixed(3)}">${frame(t)}</span>`;
    }).join('')}
      <div class="pb-total"><b data-clock="${VID01_LEN}">0:00</b><span>VID01, start to finish</span></div>
      <div class="pb-ticks"><span>0:00</span><span>14:26</span><span>28:53</span></div></div>`,
  },
  {
    id: 'needle', name: '17 seconds',
    title: 'The moment you need lasts 17 seconds.',
    body: 'The cystic duct is cut at 14:20 and it is over by 14:37. That is about 1% of the video. Without an index, finding it means scrubbing back and forth until you land on it.',
    note: 'The cut, 860–877 s, from the surgeons’ annotations. Preview frames are real VID01 frames.',
    scene: () => `<div class="sc pb-needle" style="--cx:${pct(CUT[0] / VID01_LEN)};--cw:${pct((CUT[1] - CUT[0]) / VID01_LEN)}">
      <div class="pb-preview"><canvas class="pv" width="854" height="480" aria-hidden="true"></canvas><span class="pv-time" data-hunt>0:00</span><canvas class="vf" data-t="860.16" width="2" height="2" hidden></canvas></div>
      <div class="pb-bar">${frameStrip()}<span class="pb-cut"></span><span class="pb-knob"></span></div>
      <div class="pb-callout"><b>Cystic duct cut</b><span>14:20 to 14:37, 17 s of 1,733 s</span></div></div>`,
  },
  {
    id: 'docs', name: 'Writing it down',
    title: 'Then someone has to write it all down.',
    body: 'Every operation is documented: each step, the instruments used, and when. Done by hand, it takes time and has to be exact, and gaps in the record turn into delays and billing questions.',
    note: 'Rows are VID01’s real steps (Cholec80 phases) and the instruments annotated in each.',
    scene: () => `<div class="sc pb-docs"><div class="pb-form">
      <div class="pb-form-head"><b>Operative record</b><span>VID01, laparoscopic cholecystectomy</span></div>
      <div class="pb-form-cols"><span>Step</span><span>Time</span><span>Instruments</span></div>
      ${RECORD.map(([step, a, b, tools], k) => `<div class="pb-form-row" style="--k:${k}"><span>${step}</span><span>${clock(a)}–${clock(b)}</span><span>${tools}</span></div>`).join('')}
      </div>
      <div class="pb-review"><b data-review="${VID01_LEN}">0:00</b><span>of 28:53 reviewed, by hand</span></div></div>`,
  },
  {
    id: 'learning', name: 'Learning is costly',
    title: 'Learning surgery is slow and expensive.',
    body: 'A general surgery resident must operate on 850 cases over five years. A resident makes a laparoscopic gallbladder removal about 37% longer, at about $58 per operating-room minute. Nearly every resident prepares with video, mostly YouTube, and none of it is searchable.',
    sources: [
      ['ACGME case minimums, 2024', 'https://www.acgme.org/globalassets/definedcategoryminimumnumbersforgeneralsurgeryresidentsandcreditrole.pdf'],
      ['Shin et al., Surg Endosc, 2021', 'https://doi.org/10.1007/s00464-020-07780-5'],
      ['Ashrafi et al., JAMA Surg, 2026', 'https://doi.org/10.1001/jamasurg.2026.2355'],
      ['van der Leun et al., Eur Urol Open Sci, 2024', 'https://doi.org/10.1016/j.euros.2024.07.108'],
    ],
    note: 'Published figures; each card names its source. Operating time: 344 cases at one academic center, 2018 to 2019. Cost: California hospitals, fiscal year 2022.',
    scene: () => `<div class="sc pb-learn">
      <div class="lc lc-cases" style="--k:0"><span class="lc-src">ACGME, 2024</span><b data-num="850">0</b><span>major operations a general surgery resident must perform</span>
        <div class="lc-years">${[1, 2, 3, 4, 5].map(y => `<i style="--y:${y}"><em>${y}</em></i>`).join('')}</div><small class="lc-cap">over five years of residency</small></div>
      <div class="lc lc-time" style="--k:1"><span class="lc-src">Shin et al., 2021</span><span>Laparoscopic gallbladder removal, operating time</span>
        <div class="lc-bar a"><em>Faculty alone</em><i style="--w:${100 / 140}"></i><b>1.00×</b></div>
        <div class="lc-bar b"><em>With a resident</em><i style="--w:${137 / 140}"></i><b>1.37×</b></div>
        <span class="lc-plus">+37%</span></div>
      <div class="lc lc-cost" style="--k:2"><span class="lc-src">Ashrafi et al., 2026</span><b>$<span data-num="57.71" data-dec="2">0.00</span></b><span>for every minute of operating-room time</span></div>
      <div class="lc lc-video" style="--k:3"><span class="lc-src">van der Leun et al., 2024</span><b><span data-num="98.6" data-dec="1">0.0</span>%</b><span>of residents prepare by watching video, mostly YouTube</span>
        <div class="lc-dots">${Array.from({length: 72}, (_, i) => `<i class="${i < 71 ? 'on' : ''}" style="--i:${i}"></i>`).join('')}</div><small class="lc-cap">71 of 72 residents surveyed</small></div>
    </div>`,
  },
  {
    id: 'uses', name: 'Who needs it',
    title: 'Everyone who learns from surgery needs one moment.',
    body: 'A resident wants to watch the duct being clipped before doing it. A surgeon reviews the dissection before a case. An educator cuts the critical seconds into a lesson. A researcher compares one step across many operations.',
    note: 'Each moment is a real VID01 interval from the surgeons’ annotations. Clipper count: all 50 CholecT50 surgeries.',
    scene: () => `<div class="sc pb-uses"><div class="pb-bar mid">${frameStrip()}${USES.map((u, k) => u.at.map(([a, b]) => `<span class="pb-mark" style="--k:${k};left:${pct(a / VID01_LEN)};width:${pct(Math.max(6, b - a) / VID01_LEN)}"></span>`).join('')).join('')}</div>
      ${USES.map((u, k) => `<div class="pb-use" style="--k:${k};--tx:${pct(u.at[0][0] / VID01_LEN)}"><b>${u.who}</b><span>${u.what}</span><em>${u.when}</em></div>`).join('')}</div>`,
  },
  {
    id: 'index', name: 'No index',
    title: 'Video has no index.',
    body: 'Nothing in a video file says what happens when. For CholecT50, surgeons labeled every second by hand: 11,264 labeled clips across 50 surgeries. A new recording arrives with none of this.',
    note: 'Instrument lanes are the surgeons’ annotations for VID01. The count is every surgeon-labeled clip in the Surg+F index.',
    scene: () => `<div class="sc pb-index">
      <div class="pb-bar small">${frameStrip()}<span class="pb-pen"></span></div>
      <div class="pb-lanes">${Object.entries(TRACKS).map(([name, segs], k) => `<div class="pb-lane${name === 'scissors' ? ' is-cut' : ''}" style="--k:${k}"><span>${name}</span><span class="tr">${segs.map(([s, e]) => `<i style="left:${pct(s / VID01_LEN)};width:${pct(Math.max(2, e - s) / VID01_LEN)}"></i>`).join('')}</span></div>`).join('')}</div>
      <div class="pb-hit"><b data-count="11264">0</b><span>clips labeled by hand, 50 surgeries</span></div></div>`,
  },
];

export function problemSection({only, per = 2} = {}) {
  const chapters = pickChapters(CHAPTERS, only);
  return `<section class="dig dig-model dig-problem" id="problem" aria-labelledby="problem-heading" data-intro="0" data-per="${per}" style="--travel:${chapters.length * per};--nav:1">
    <div class="dig-pin">
      <div class="mn-heading"><h2 id="problem-heading">Finding one moment.</h2></div>
      <div class="dig-map"><ol class="dig-labels" aria-label="The problem">${chapters.map((c, i) => `<li><button type="button" data-dig="${i}"><span>${i + 1}</span>${c.name}</button></li>`).join('')}</ol></div>
      ${chapters.map((c, i) => `<div class="layer" id="problem-${c.id}" data-layer="${i}" style="--p:0;--s:1">
        <div class="dig-copy layer-copy"><h3>${c.title}</h3><p>${c.body}</p>${c.sources ? `<div class="lv-sources"><span>Sources</span><ul>${c.sources.map(([t, h]) => `<li><a href="${h}" target="_blank" rel="noopener noreferrer">${t}</a></li>`).join('')}</ul></div>` : ''}</div>
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
  const pLen = layerP(section, ps, 'problem-length');
  if (pLen !== null) { const el = section.querySelector('[data-clock]'); setText(el, clock(Number(el.dataset.clock) * ease(clamp((pLen - .3) / .45)))); }
  /* Hunting scrubber: the knob, the timestamp and the preview frame follow the scroll. */
  const pNeedle = layerP(section, ps, 'problem-needle');
  if (pNeedle !== null) {
    const needle = section.querySelector('.pb-needle');
    const x = huntAt(pNeedle);
    needle.style.setProperty('--hx', x.toFixed(4));
    const t = x * VID01_LEN;
    setText(section.querySelector('[data-hunt]'), clock(t));
    const landed = Math.abs(t - CUT[0]) < 1;
    const nearest = landed ? 860.16 : SAMPLES.reduce((a, b) => Math.abs(b - t) < Math.abs(a - t) ? b : a);
    const src = cachedFrame(nearest);
    const pv = section.querySelector('.pv');
    if (src && shown !== nearest) { pv.getContext('2d')?.drawImage(src, 0, 0, pv.width, pv.height); pv.classList.add('is-painted'); shown = nearest; }
  }
  /* Writing it down: the review clock runs as the rows are typed in. */
  const pDocs = layerP(section, ps, 'problem-docs');
  if (pDocs !== null) { const el = section.querySelector('[data-review]'); setText(el, clock(Number(el.dataset.review) * clamp((pDocs - .08) / .7))); }
  /* Learning is costly: each card's number counts up as it arrives. */
  const pLearn = layerP(section, ps, 'problem-learning');
  if (pLearn !== null) section.querySelectorAll('#problem-learning [data-num]').forEach(el => {
    const k = Number(el.closest('.lc').style.getPropertyValue('--k'));
    const v = Number(el.dataset.num) * ease(clamp((pLearn - .08 - k * .16) / .3));
    const dec = Number(el.dataset.dec) || 0;
    setText(el, dec ? v.toFixed(dec) : Math.round(v).toLocaleString('en-US'));
  });
  /* Hand-labeled clips count up as the lanes are drawn. */
  const pIndex = layerP(section, ps, 'problem-index');
  if (pIndex !== null) { const el = section.querySelector('[data-count]'); setText(el, Math.round(Number(el.dataset.count) * ease(clamp((pIndex - .3) / .4))).toLocaleString('en-US')); }
});
