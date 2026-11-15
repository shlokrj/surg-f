/* "How well the model sees": the homepage model notes as a pinned stage (same mechanics as "Dig into
   the stack", see architecture.js). Six chapters, each with a scroll-driven scene. Every number comes
   from frontend/public/model-evals.md: the label model (Aadhi, final MLflow run 9d18d20a, F1 on 4
   held-out surgeries) and the box detector (Mihir, v3 on 409 Endoscapes test frames, IoU 0.5).
   The smoothing strip is an illustration of the rule, not model output. */
import { onStage } from './architecture.js';

const F1 = {
  instruments: [['Grasper', .89], ['Hook', .83], ['Bipolar', .52], ['Scissors', .29], ['Irrigator', .26], ['Clipper', .19]],
  actions: [['Retract', .86], ['Dissect', .78], ['Coagulate', .46], ['Grasp', .40]],
  targets: [['Gallbladder', .88], ['Specimen bag', .75], ['Liver', .51], ['Omentum', .21]],
};
const RELIABLE = new Set(['Grasper', 'Hook', 'Retract', 'Dissect', 'Gallbladder', 'Specimen bag']);
const AVG = .34;
/* Box detector (model-evals.md, "Bounding boxes on the video"): precision and recall at the deployed
   thresholds, and COCO AP for v3 (0.38) against the previous version (0.35). */
const BOXES = {gallbladder: [['Precision', .93], ['Recall', .93]], duct: [['Precision', .69], ['Recall', .39]], ap: .38};

/* 49 surgeries: 42 trained on, 3 tuned on, 4 tested on. Tiles start in one grid and sort into groups. */
const SPLIT = (() => {
  const order = Array.from({length: 49}, (_, i) => (i * 19) % 49); // deterministic shuffle of grid slots
  return order.map((slot, i) => {
    const x0 = 89 + (slot % 7) * 56, y0 = 46 + Math.floor(slot / 7) * 56;
    let x1, y1, group;
    if (i < 42) { group = 'train'; x1 = 24 + (i % 6) * 52; y1 = 46 + Math.floor(i / 6) * 52; }
    else if (i < 45) { group = 'tune'; x1 = 374; y1 = 46 + (i - 42) * 52; }
    else { group = 'test'; x1 = 446 + ((i - 45) % 2) * 52; y1 = 46 + Math.floor((i - 45) / 2) * 52; }
    return {group, x0, y0, x1, y1, st: ((slot % 7) * .018 + Math.floor(slot / 7) * .012).toFixed(3)};
  });
})();

/* Smoothing rule from model-evals.md: fill gaps of 2 s or less, then drop clips shorter than 2 s.
   The per-second pattern is illustrative; the result is computed from it with the real rule. */
const RAW = '0111011001110000001000111101110110000100'.split('').map(Number);
const SMOOTHED = (() => {
  const s = [...RAW];
  let last = -1;
  RAW.forEach((v, i) => { if (v) { if (last >= 0 && i - last - 1 <= 2) for (let k = last + 1; k < i; k++) s[k] = 2; last = i; } });
  const runs = [];
  for (let i = 0; i < s.length;) { if (!s[i]) { i++; continue; } let j = i; while (j < s.length && s[j]) j++; runs.push([i, j]); i = j; }
  return {fill: s, keep: runs.filter(([a, b]) => b - a >= 2), drop: runs.filter(([a, b]) => b - a < 2)};
})();
const LABELED = [[2, 13], [21, 34]]; // illustrative surgeon clips, for comparison

const rows = (list, base = 0) => `<ul class="mn-rows">${list.map(([label, v], i) => `<li class="${RELIABLE.has(label) ? 'is-good' : ''}" data-f1 data-v="${v}" data-i="${base + i}" style="--v:${v};--g:0"><span>${label}</span><span class="mn-track"><i></i></span><b>0.00</b></li>`).join('')}</ul>`;

const CHAPTERS = [
  {
    id: 'test', name: 'Held-out test',
    title: 'Scored on surgeries it never saw.',
    body: 'Surg+F learned from 42 surgeries, was tuned on 3, and was tested on 4 that stayed out of training and tuning the whole time. Every setting was chosen on the tuning surgeries before the test ran.',
    note: 'One tile per CholecT50 surgery used: 42 trained on, 3 tuned on, 4 tested on.',
    scene: () => `<div class="sc mn-split">${SPLIT.map(t => `<i class="tile t-${t.group}" style="--x0:${t.x0}px;--y0:${t.y0}px;--x1:${t.x1}px;--y1:${t.y1}px;--st:${t.st}"></i>`).join('')}
      <span class="grp g-train" style="left:24px;top:420px"><b>42</b>trained on</span>
      <span class="grp g-tune" style="left:358px;top:212px"><b>3</b>tuned on</span>
      <span class="grp g-test" style="left:446px;top:160px"><b>4</b>tested on</span></div>`,
  },
  {
    id: 'instruments', name: 'Instruments',
    title: 'Instruments.',
    body: 'F1 runs from 0 to 1 and balances catching every true moment against false alarms, second by second. The grasper and hook are reliable. Scissors, irrigator and clipper appear rarely, so they are often missed.',
    note: 'F1 per instrument on the 4 test surgeries.',
    scene: () => `<div class="sc mn-board"><div class="mn-panel wide"><h4>Instruments</h4>${rows(F1.instruments)}<div class="axis"><span>0</span><span>0.5</span><span>1</span></div></div></div>`,
  },
  {
    id: 'actions', name: 'Actions and targets',
    title: 'Actions and targets.',
    body: 'Retract, dissect, gallbladder and specimen bag are reliable. Across all 29 labels the average is 0.34, because rare labels like pack, adhesion and gut are effectively never predicted correctly.',
    note: 'Best actions and best targets on the 4 test surgeries. The line is the average across all 29 labels.',
    scene: () => `<div class="sc mn-board two"><div class="mn-panel"><h4>Best actions</h4>${rows(F1.actions)}</div><div class="mn-panel"><h4>Best targets</h4>${rows(F1.targets, 2)}</div>
      <div class="avg"><b data-avg="${AVG}">0.00</b><span>average F1, all 29 labels</span></div></div>`,
  },
  {
    id: 'clips', name: 'From seconds to clips',
    title: 'From seconds to clips.',
    body: 'The model labels every second. Smoothing then fills gaps of 2 s or less and drops clips shorter than 2 s, a setting chosen on the tuning surgeries only. The result is a suggested moment: usually in the right place, with approximate edges.',
    note: 'Illustration of the smoothing rule on 40 seconds. Surgeon-labeled clips are ground truth.',
    scene: () => `<div class="sc mn-smooth">
      <div class="strip s-raw"><span>Each second</span><div class="cells">${RAW.map((v, i) => `<i class="${v ? 'on' : ''}${SMOOTHED.fill[i] === 2 ? ' fill' : ''}${SMOOTHED.drop.some(([a, b]) => i >= a && i < b) ? ' drop' : ''}" style="--i:${i}"></i>`).join('')}</div></div>
      <div class="strip s-clip"><span>Predicted clips</span><div class="slane">${SMOOTHED.keep.map(([a, b]) => `<i style="left:${(a / 40 * 100).toFixed(2)}%;width:${((b - a) / 40 * 100).toFixed(2)}%"></i>`).join('')}</div></div>
      <div class="strip s-label"><span>Surgeon labels</span><div class="slane">${LABELED.map(([a, b]) => `<i style="left:${(a / 40 * 100).toFixed(2)}%;width:${((b - a) / 40 * 100).toFixed(2)}%"></i>`).join('')}</div></div>
      <div class="ticks"><span>0 s</span><span>20 s</span><span>40 s</span></div></div>`,
  },
  {
    id: 'versions', name: 'v1 to v2',
    title: 'More surgeries, better scissors.',
    body: 'Training on 42 surgeries instead of 12 raised the average F1 and more than quadrupled scissors F1, the instrument behind “When is the cystic duct cut?”. Every number traces to a logged MLflow run.',
    note: 'Neural network v1 against v2, the live model. Final model: MLflow run 9d18d20a.',
    link: '/evals.html',
    scene: () => `<div class="sc mn-up"><div class="ver"><span class="v1">v1</span><span class="v2">v2, live</span></div>
      ${[['Training surgeries', 12, 42, 50, 0], ['Average F1', .30, .34, 1, 2], ['Scissors F1', .07, .29, 1, 2]].map(([label, a, b, max, dg], i) => `<div class="up" data-up data-from="${a}" data-to="${b}" data-digits="${dg}" data-i="${i}" style="--a:${a / max};--b:${b / max};--u:0"><span>${label}</span><div class="bars"><i class="was"></i><i class="now"></i></div><b>${a.toFixed(dg)}</b></div>`).join('')}
      <code class="run">MLflow 9d18d20a</code></div>`,
  },
  {
    id: 'boxes', name: 'Boxes on the video',
    title: 'Boxes on the video.',
    body: 'A second model, a Faster R-CNN fine-tuned on Endoscapes, draws boxes around the gallbladder and cystic duct every quarter second. On 409 frames from 41 surgeries it never trained on, the gallbladder is reliable. The cystic duct is small and often hidden, so many are missed. It has not yet been checked on this video itself.',
    note: 'Precision: boxes that are right. Recall: real ones it finds. A box counts when it overlaps the surgeon’s box by at least half.',
    link: '/evals.html#bounding-boxes-on-the-video-experimental',
    scene: () => `<div class="sc mn-board"><div class="mn-panel"><h4>Gallbladder</h4>${rows(BOXES.gallbladder)}</div><div class="mn-panel"><h4>Cystic duct</h4>${rows(BOXES.duct, 2)}</div>
      <div class="avg"><b data-avg="${BOXES.ap}">0.00</b><span>detection score (COCO AP), up from 0.35</span></div></div>`,
  },
];

export function modelSection() {
  return `<section class="dig dig-model" id="model-notes" aria-labelledby="model-heading" data-intro="0" data-per="2" style="--travel:10;--nav:1">
    <div class="dig-pin">
      <h2 class="mn-heading" id="model-heading">How well the model sees.</h2>
      <div class="dig-map"><ol class="dig-labels" aria-label="Model notes">${CHAPTERS.map((c, i) => `<li><button type="button" data-dig="${i}"><span>${i + 1}</span>${c.name}</button></li>`).join('')}</ol></div>
      ${CHAPTERS.map((c, i) => `<div class="layer" id="model-${c.id}" data-layer="${i}" style="--p:0;--s:1">
        <div class="dig-copy layer-copy"><h3>${c.title}</h3><p>${c.body}</p>${c.link ? `<p class="mn-link"><a href="${c.link}">Read the full evaluation</a></p>` : ''}</div>
        <div class="pit" style="--k:${i}" role="img" aria-label="${c.name} animation"><canvas class="sky-dither" data-horizon=".72" data-ceiling="4.6" aria-hidden="true"></canvas><div class="fit">${c.scene()}</div><p class="v-cap">${c.note}</p></div>
      </div>`).join('')}
    </div>
  </section>`;
}

/* Numbers follow the scroll, so bars and their values always agree. */
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = v => 1 - Math.pow(1 - v, 3);
const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };
onStage((section, ps) => {
  if (section.id !== 'model-notes') return;
  section.querySelectorAll('.layer').forEach((layer, j) => {
    const p = ps[j];
    layer.querySelectorAll('[data-f1]').forEach(row => {
      const g = ease(clamp((p - .1 - Number(row.dataset.i) * .07) / .45));
      row.style.setProperty('--g', g.toFixed(4));
      setText(row.querySelector('b'), (Number(row.dataset.v) * g).toFixed(2));
    });
    const avg = layer.querySelector('[data-avg]');
    if (avg) setText(avg, (Number(avg.dataset.avg) * ease(clamp((p - .55) / .3))).toFixed(2));
    layer.querySelectorAll('[data-up]').forEach(row => {
      const u = ease(clamp((p - .3 - Number(row.dataset.i) * .08) / .4));
      row.style.setProperty('--u', u.toFixed(4));
      const a = Number(row.dataset.from), b = Number(row.dataset.to);
      setText(row.querySelector('b'), (a + (b - a) * u).toFixed(Number(row.dataset.digits)));
    });
  });
});
