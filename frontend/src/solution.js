/* "Ask, and jump to it": the solution, right after the problem in the demo version. A pinned stage in
   three chapters (label, ask, jump) that replaces the old "Find the clip" block there; its buttons open
   the real VID01 case. Data: VID01 surgeon labels (architecture.js TRACKS), the cut at 860–877 s, the
   scissors clip count across 50 surgeries (agent-kit/PROGRESS.md), and the backend's label search. */
import { onStage, paintFrames, TRACKS, VID01_LEN } from './architecture.js';
import { frameStrip } from './problem.js';

const pct = v => `${(v * 100).toFixed(3)}%`;
const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const CUT = [860, 877];

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
];

export function solutionSection() {
  return `<section class="dig dig-model dig-solution" id="solution" aria-labelledby="solution-heading" data-intro="0" data-per="1.2" style="--travel:3.6;--nav:1">
    <div class="dig-pin">
      <div class="mn-heading"><h2 id="solution-heading">Ask, and jump to it.</h2></div>
      <div class="dig-map"><ol class="dig-labels" aria-label="The solution">${CHAPTERS.map((c, i) => `<li><button type="button" data-dig="${i}"><span>${i + 1}</span>${c.name}</button></li>`).join('')}</ol></div>
      ${CHAPTERS.map((c, i) => `<div class="layer" id="solution-${c.id}" data-layer="${i}" style="--p:0;--s:1">
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
  const read = section.querySelector('[data-clock]');
  setText(read, clock(Number(read.dataset.clock) * clamp((ps[0] - .05) / .6)));
  const q = section.querySelector('.so-q');
  setText(q, q.dataset.type.slice(0, Math.round(q.dataset.type.length * clamp((ps[1] - .04) / .26))));
  const more = section.querySelector('[data-count]');
  setText(more, String(Math.round(Number(more.dataset.count) * ease(clamp((ps[1] - .62) / .25)))));
  setText(section.querySelector('[data-jump]'), clock(CUT[0] * ease(clamp((ps[2] - .2) / .3))));
});
