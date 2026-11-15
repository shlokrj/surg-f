/* "Ask, and jump to it": the solution, right after the problem in the demo version. A pinned stage in
   three chapters (label, ask, jump) that replaces the old "Find the clip" block there; its buttons open
   the real VID01 case. Data: VID01 surgeon labels (architecture.js TRACKS), the cut at 860–877 s, the
   scissors clip count across 50 surgeries (the surgf_clips table), and the backend's label search. */
import { onStage, paintFrames, TRACKS, VID01_LEN, layerP, pickChapters } from './architecture.js';
import { frameStrip, RECORD } from './problem.js';

const pct = v => `${(v * 100).toFixed(3)}%`;
const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const CUT = [860, 877];
/* Captures of Surg+F's 3D panel at three VID01 steps, with each step's span. */
const PRACTICE = [['Calot’s triangle dissection', 21, 673], ['Clipping and cutting', 673, 887], ['Gallbladder dissection', 887, 1470]];

const CHAPTERS = [
  {
    id: 'label', name: 'Label every second',
    title: 'Label every second.',
    body: 'A model trained on 42 surgeries reads the video one second at a time and predicts 29 labels: instruments, actions and anatomy. Each run of a label becomes a clip in one searchable table.',
    note: 'Lanes are VID01’s surgeon labels, the same kind of labels the model writes for a new recording.',
    scene: () => `<div class="sc so-label">
      <div class="pb-bar small">${frameStrip()}<span class="so-head"></span></div>
      <div class="so-lanes">${Object.entries(TRACKS).map(([name, segs]) => `<div class="so-lane"><span>${name}</span><span class="tr">${segs.map(([s, e]) => `<i style="left:${pct(s / VID01_LEN)};width:${pct(Math.max(2, e - s) / VID01_LEN)}"></i>`).join('')}</span></div>`).join('')}</div>
      <div class="so-meter"><b data-clock="${VID01_LEN}">0:00</b><span>read, 29 labels per second</span></div></div>`,
  },
  {
    id: 'ask', name: 'Ask in plain words',
    title: 'Ask in plain words.',
    body: 'Type a question. Surg+F maps it to labels, so “cut” searches the scissors, and Databricks SQL returns every labeled and predicted clip. Free-form chat questions can go to Genie.',
    note: 'The VID01 result is real. The count is every surgeon-labeled scissors clip across 50 surgeries.',
    scene: () => `<div class="sc so-ask">
      <div class="so-bar"><span class="pb-glyph" aria-hidden="true"></span><span class="so-q" data-type="When is the cystic duct cut?"></span></div>
      <div class="so-map"><span>cut</span><i aria-hidden="true">→</i><span>scissors</span></div>
      <div class="so-results">
        <div class="so-row is-top"><b>VID01</b><span>14:20 to 14:37</span><span>scissors</span><em>Surgeon label</em></div>
        <div class="so-more"><b data-count="103">0</b><span>more scissors clips across 50 surgeries</span></div>
      </div></div>`,
  },
  {
    id: 'jump', name: 'Jump to the moment',
    title: 'Jump straight to it.',
    body: 'Pick a result and the player seeks to the clip’s first second. From there, the case timeline, an instrument chart and a quiz are one click away.',
    note: 'The real VID01 frame at 14:20. The bright band is the 17-second clip.',
    cta: true,
    scene: () => `<div class="sc so-jump" style="--cx:${pct(CUT[0] / VID01_LEN)};--cw:${pct((CUT[1] - CUT[0]) / VID01_LEN)}">
      <div class="so-win"><div class="so-video"><canvas class="vf" data-t="860.16" width="854" height="480" aria-hidden="true"></canvas><span class="so-flash"></span></div>
        <div class="so-scrub"><span class="clip"></span><span class="fill"></span><span class="knob"></span></div>
        <div class="so-meta"><b data-jump>0:00</b><span>VID01, scissors cut the cystic duct</span></div></div></div>`,
  },
  {
    id: 'record', name: 'The labels are the record',
    title: 'The labels are the record.',
    body: 'Every label Surg+F stores already says which step, which instrument and when. Laid out as a record, all of VID01 fills in at once. Writing clinical notes from it is the next step.',
    note: 'Built from VID01’s labels. Surg+F does not write clinical notes yet.',
    scene: () => `<div class="sc so-record"><div class="pb-form">
      <div class="pb-form-head"><b>From the labels</b><span>VID01, laparoscopic cholecystectomy</span></div>
      <div class="pb-form-cols"><span>Step</span><span>Time</span><span>Instruments</span></div>
      ${RECORD.map(([step, a, b, tools], k) => `<div class="pb-form-row" style="--k:${k}"><span>${step}</span><span>${clock(a)}–${clock(b)}</span><span>${tools}</span><i aria-hidden="true">✓</i></div>`).join('')}
    </div></div>`,
  },
  {
    id: 'practice', name: 'Practice in 3D',
    title: 'Practice the anatomy in 3D.',
    body: 'Practice on cadavers is expensive and hard to come by. Surg+F adds a 3D model of the gallbladder region that follows the video step by step: rotate it, zoom in, and fade organs away to see what the surgeon is working around.',
    note: 'Real captures of Surg+F’s 3D panel. Anatomy from BodyParts3D (CC BY 4.0); clips, cut and triangle are schematic and not yet medically reviewed.',
    scene: () => `<div class="sc so-practice">
      <div class="so-3d"><div class="so-3d-stage">${PRACTICE.map(([name], k) => `<img src="/screens/model-step${k + 1}.jpg" alt="" loading="lazy" style="--k:${k}">`).join('')}</div>
        <div class="so-steps">${PRACTICE.map(([name, a, b], k) => `<span style="--k:${k}"><b>${name}</b><em>${clock(a)}–${clock(b)}</em></span>`).join('')}</div></div></div>`,
  },
];

export function solutionSection({only, per = 2} = {}) {
  const chapters = pickChapters(CHAPTERS, only);
  return `<section class="dig dig-model dig-solution" id="solution" aria-labelledby="solution-heading" data-intro="0" data-per="${per}" style="--travel:${chapters.length * per};--nav:1">
    <div class="dig-pin">
      <div class="mn-heading"><h2 id="solution-heading">Ask, and jump to it.</h2></div>
      <div class="dig-map"><ol class="dig-labels" aria-label="The solution">${chapters.map((c, i) => `<li><button type="button" data-dig="${i}"><span>${i + 1}</span>${c.name}</button></li>`).join('')}</ol></div>
      ${chapters.map((c, i) => `<div class="layer" id="solution-${c.id}" data-layer="${i}" style="--p:0;--s:1">
        <div class="dig-copy layer-copy"><h3>${c.title}</h3><p>${c.body}</p>${c.cta ? '<div class="so-cta"><button type="button" class="btn-primary" id="sample-event">Open VID01 at 14:20</button><button type="button" class="btn-secondary" id="sample">Explore the demo</button></div>' : ''}</div>
        <div class="pit" style="--k:${i}" role="img" aria-label="${c.name} animation"><canvas class="sky-dither" data-horizon=".72" data-ceiling="4.6" aria-hidden="true"></canvas><div class="fit">${c.scene()}</div><p class="v-cap">${c.note}</p></div>
      </div>`).join('')}
    </div>
  </section>`;
}

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = v => 1 - Math.pow(1 - v, 3);
const setText = (el, text) => { if (el && el.textContent !== text) el.textContent = text; };
onStage((section, ps) => {
  if (section.id !== 'solution') return;
  paintFrames(section);
  const pLabel = layerP(section, ps, 'solution-label');
  if (pLabel !== null) { const el = section.querySelector('[data-clock]'); setText(el, clock(Number(el.dataset.clock) * clamp((pLabel - .05) / .6))); }
  const pAsk = layerP(section, ps, 'solution-ask');
  if (pAsk !== null) {
    const q = section.querySelector('.so-q');
    setText(q, q.dataset.type.slice(0, Math.round(q.dataset.type.length * clamp((pAsk - .04) / .26))));
    const more = section.querySelector('[data-count]');
    setText(more, String(Math.round(Number(more.dataset.count) * ease(clamp((pAsk - .62) / .25)))));
  }
  const pJump = layerP(section, ps, 'solution-jump');
  if (pJump !== null) setText(section.querySelector('[data-jump]'), clock(CUT[0] * ease(clamp((pJump - .2) / .3))));
  /* Practice in 3D: the model moves through three steps; each picture and its step chip fade in turn. */
  const pPractice = layerP(section, ps, 'solution-practice');
  if (pPractice !== null) {
    const pos = clamp((pPractice - .2) / .65) * (PRACTICE.length - 1);
    section.querySelectorAll('.so-3d-stage img, .so-steps span').forEach(el => el.style.setProperty(el.tagName === 'IMG' ? '--o' : '--on', clamp(1 - Math.abs(pos - Number(el.style.getPropertyValue('--k')))).toFixed(3)));
  }
});
