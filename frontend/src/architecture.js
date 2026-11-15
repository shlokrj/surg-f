/* "Dig into the stack": the homepage architecture section (MadHacks 2026 theme: let's dig in).
   One pinned stage. A block pulls apart into six layers, shrinks into a clickable layer map, and the
   stage digs down through it one layer at a time, from the surface (the player) to bedrock (the
   surgery video). Each layer plays its own scroll-driven 3D scene.

   Every fact comes from the repo: README.md, agent-kit/SPEC.md, backend/app/repository.py,
   frontend/public/model-evals.md, frontend/public/overlays/VID01.json and shared/triplets.annotation.csv.
   Every link was checked on 2026-11-14. */
import { videoForCase } from './cases.js';

const link = (href, text) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;

export const LAYERS = [
  {
    id: 'player', name: 'The player',
    body: 'A Vite app in plain JavaScript. Choosing a result seeks the video to the clip’s first second. Experimental Faster R-CNN detectors, trained on Endoscapes, look for anatomy and instruments every 0.24 s and draw boxes over the video.',
    stack: [['Vite', 'https://vite.dev/'], ['Inclusive Sans', 'https://www.oliviaking.com/inclusivesans'], ['torchvision Faster R-CNN', 'https://docs.pytorch.org/vision/stable/models/faster_rcnn.html'], ['Endoscapes', 'https://github.com/CAMMA-public/Endoscapes']],
    sources: [['Ren et al., Faster R-CNN, 2015', 'https://arxiv.org/abs/1506.01497'], ['Murali et al., Endoscapes, 2023', 'https://arxiv.org/abs/2312.12429']],
  },
  {
    id: 'search', name: 'Search and chat',
    body: 'A FastAPI backend searches clips with Databricks SQL. A Llama 3.3 70B endpoint routes chat messages, and Databricks Genie answers free-form questions about the data.',
    stack: [['FastAPI', 'https://fastapi.tiangolo.com/'], ['Databricks SQL', 'https://docs.databricks.com/aws/en/sql/'], ['Genie', 'https://docs.databricks.com/aws/en/genie/'], ['Foundation Model APIs', 'https://docs.databricks.com/aws/en/machine-learning/foundation-model-apis/']],
    sources: [],
  },
  {
    id: 'index', name: 'Clip index',
    body: 'Every surgeon label and model prediction becomes one row: case, start, end, label and source. A single Delta table holds them all, rebuilt by a Lakeflow job without duplicates.',
    stack: [['Delta Lake', 'https://delta.io/'], ['Lakeflow Jobs', 'https://docs.databricks.com/aws/en/jobs/'], ['Unity Catalog Volumes', 'https://docs.databricks.com/aws/en/volumes/']],
    sources: [],
  },
  {
    id: 'model', name: 'Label model',
    body: 'A scikit-learn neural network reads five seconds of features and predicts 29 labels at once. It was trained on 42 surgeries, tuned on 3 and tested on 4 it never saw, with every run logged in MLflow.',
    stack: [['scikit-learn MLPClassifier', 'https://scikit-learn.org/stable/modules/generated/sklearn.neural_network.MLPClassifier.html'], ['MLflow', 'https://mlflow.org/'], ['Databricks Jobs', 'https://docs.databricks.com/aws/en/jobs/']],
    sources: [],
  },
  {
    id: 'features', name: 'Frame features',
    body: 'SurgVLP, pretrained on hundreds of surgical video lectures, stays frozen. Its ResNet-50 image branch turns each one-second frame into 768 numbers, extracted on Databricks serverless and stored in a Unity Catalog Volume.',
    stack: [['SurgVLP', 'https://github.com/CAMMA-public/SurgVLP'], ['PyTorch', 'https://pytorch.org/'], ['Unity Catalog Volumes', 'https://docs.databricks.com/aws/en/volumes/']],
    sources: [['Yuan et al., Learning multi-modal representations by watching hundreds of surgical video lectures, 2023', 'https://arxiv.org/abs/2307.15220'], ['He et al., Deep residual learning, 2015', 'https://arxiv.org/abs/1512.03385']],
  },
  {
    id: 'video', name: 'Surgery video',
    body: 'CholecT50: 50 laparoscopic gallbladder removals with instrument, action and target labels for every second. VID01 and VID02 play at 25 fps from the Cholec80 release.',
    stack: [['CholecT50', 'https://github.com/CAMMA-public/cholect50'], ['Voxel51/cholect50 on Hugging Face', 'https://huggingface.co/datasets/Voxel51/cholect50'], ['Cholec80', 'https://camma.unistra.fr/datasets/']],
    sources: [['Nwoye et al., Rendezvous, 2022', 'https://arxiv.org/abs/2109.03223'], ['Twinanda et al., EndoNet, 2017', 'https://arxiv.org/abs/1602.03012']],
  },
];

/* A slab is a real CSS-3D cuboid: a top face plus the two side faces that face the viewer. */
const slab = (cls = '', top = '') => `<div class="slab ${cls}"><div class="face top">${top}</div><div class="face front"></div><div class="face side"></div></div>`;
/* A real VID01 frame, painted from the video at time t (seconds) once the section is near. */
const frame = (t, w = 256, h = 144) => `<canvas class="vf" data-t="${t}" width="${w}" height="${h}" aria-hidden="true"></canvas>`;

/* ---- Real data ---- */
/* frontend/public/overlays/VID01.json at 860.16 s (frame 21504, v3 model): experimental anatomy prediction (not ground truth). */
const BOX = {t: 860.16, label: 'gallbladder', score: '0.998', xyxy: [0.3147, 0.0, 0.6913, 0.4779]};
/* Proposals the detector "considers" before settling (illustration of the search, not model output). */
const CANDS = [[4, 46, 30, 40], [58, 50, 34, 44], [18, 20, 44, 52], [46, 4, 46, 30], [8, 6, 28, 34], [62, 14, 30, 36]];
/* shared/triplets.annotation.csv, VID01, in time order. */
const ROWS = [['VID01', 561, 658, 'hook'], ['VID01', 674, 690, 'clipper'], ['VID01', 698, 747, 'clipper'], ['VID01', 815, 844, 'clipper'], ['VID01', 860, 877, 'scissors'], ['VID01', 894, 921, 'hook'], ['VID01', 1010, 1026, 'bipolar']];
/* VID01 instrument time line, merged per instrument from the same CSV. VID01_LEN is the video's real
   length (1,733.04 s, 28:53); the annotations end at 1,728 s. */
export const VID01_LEN = 1733;
export const TRACKS = {
  grasper: [[0, 5], [10, 108], [136, 172], [177, 190], [276, 298], [302, 312], [324, 363], [367, 387], [391, 395], [397, 401], [403, 406], [415, 471], [477, 484], [493, 496], [524, 530], [536, 621], [651, 746], [750, 751], [754, 758], [763, 771], [774, 796], [812, 883], [935, 936], [1037, 1039], [1100, 1111], [1116, 1118], [1158, 1437], [1439, 1440], [1443, 1460], [1478, 1565], [1567, 1655], [1658, 1678], [1689, 1690], [1697, 1709], [1711, 1718], [1721, 1728]],
  hook: [[20, 272], [484, 505], [561, 658], [894, 921], [1039, 1378], [1381, 1434], [1438, 1439]],
  bipolar: [[325, 391], [433, 476], [1010, 1026]],
  irrigator: [[291, 315], [402, 425], [936, 978], [981, 988], [990, 996], [1606, 1640]],
  clipper: [[674, 690], [698, 747], [749, 758], [815, 844]],
  scissors: [[860, 877]],
};
/* VID01 seconds 856–863: grasper throughout, scissors from 860 s. */
const SECONDS = Array.from({length: 8}, (_, i) => ({t: 856 + i, label: `14:${String(16 + i).padStart(2, '0')}`, tools: 856 + i >= 860 ? ['grasper', 'scissors'] : ['grasper']}));
const OUT = ['grasper', 'hook', 'bipolar', 'clipper', 'irrigator', 'scissors', 'grasp', 'retract', 'dissect', 'coagulate', 'clip', 'cut', 'aspirate', 'irrigate', 'pack', 'gallbladder', 'cystic plate', 'cystic duct', 'cystic artery', 'cystic pedicle', 'blood vessel', 'fluid', 'abdominal wall', 'liver', 'adhesion', 'omentum', 'peritoneum', 'gut', 'specimen bag'];
/* model-evals.md: the reliable labels and their F1 on 4 unseen surgeries. */
const RELIABLE = {grasper: '0.89', hook: '0.83', retract: '0.86', dissect: '0.78', gallbladder: '0.88', 'specimen bag': '0.75'};
const bars = Array.from({length: 28}, (_, i) => Math.abs((Math.sin(i * 12.9898) * 43758.5453) % 1));
const pct = v => `${(v * 100).toFixed(2)}%`;

/* Caption under each scene, kept at a readable size outside the scaled drawing. */
const NOTES = {
  player: 'VID01 at 14:20. The box is the detector’s real output, an experimental prediction.',
  search: '“Cut” searches the scissors. Chat questions go to Llama 3.3 70B, which can hand them to Genie.',
  index: 'Real VID01 rows from the surgeon labels. The scan is the search’s WHERE clause.',
  model: 'Lit labels are reliable on unseen surgeries, shown with their F1 score.',
  features: 'ResNet-50 stages, by channel count. The 768 bars are illustrative values.',
  video: 'Real VID01 frames, one per second. Labels and time line are the surgeons’ annotations.',
};

function scene(id) {
  switch (id) {
    case 'player': {
      const [x1, y1, x2, y2] = BOX.xyxy;
      return `<div class="sc sc-player" style="--bx:${pct(x1)};--by:${pct(y1)};--bw:${pct(x2 - x1)};--bh:${pct(y2 - y1)}">
        <div class="win"><div class="win-bar"><i></i><i></i><i></i><span>surg+f, VID01</span></div>
          <div class="win-video">${frame(BOX.t, 854, 480)}
            <span class="anchors"></span><span class="scanline"></span>
            ${CANDS.map(([x, y, w, h], i) => `<span class="cand" style="--i:${i};--x0:${x}%;--y0:${y}%;--w0:${w}%;--h0:${h}%"></span>`).join('')}
            <span class="lock"><i></i><i></i><i></i><i></i><b>${BOX.label} ${BOX.score}</b></span>
          </div>
          <div class="win-scrub"><span class="fill"></span><span class="knob"></span></div>
          <div class="win-meta"><span class="t">14:20</span><span>Experimental prediction, not ground truth</span></div>
        </div></div>`;
    }
    case 'search': return `<div class="sc sc-search">
        <div class="ask"><span class="ask-icon" aria-hidden="true"></span><span class="ask-text" data-type="When is the cystic duct cut?"></span><span class="caret"></span></div>
        <div class="plane">
          <svg class="wires" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path class="w-hot" d="M14 50H50L86 22"/><path class="w-cold" d="M50 50L86 80"/></svg>
          <div class="node n-app">${slab('', 'App')}</div>
          <div class="node n-api">${slab('', 'FastAPI')}</div>
          <div class="node n-sql">${slab('', 'SQL')}</div>
          <div class="node n-genie">${slab('', 'Genie')}</div>
          <span class="pkt go"></span><span class="pkt back"></span>
        </div>
        <code class="route">GET /search?q=scissors</code>
        <pre class="query"><code>SELECT case_id, start_sec, end_sec
FROM surgf_clips
WHERE lower(label) = 'scissors'</code></pre>
        <div class="hit"><b>VID01, 860–877 s</b><span>scissors, surgeon label</span></div>
      </div>`;
    case 'index': return `<div class="sc sc-index"><div class="iso">
        ${ROWS.map(([c, s, e, l], k) => `<div class="row${l === 'scissors' ? ' is-hit' : ''}" style="--k:${k}">${slab('', `<span>${c}</span><span>${s}</span><span>${e}</span><span>${l}</span>`)}</div>`).join('')}
        <div class="beam"></div>
        <div class="base">${slab('', '')}</div></div>
        <code class="tbl">workspace.default.surgf_clips</code>
      </div>`;
    case 'model': return `<div class="sc sc-model"><div class="rig">
        <div class="mplane l-in"><b>Input</b>${['−2 s', '−1 s', '0 s', '+1 s', '+2 s'].map((t, r) => `<div class="row-in" style="--r:${r}"><span>${t}</span><span class="cells">${'<i></i>'.repeat(16)}</span></div>`).join('')}<small>5 seconds × 768 features</small></div>
        <div class="mplane l-hid"><b>Hidden</b><div class="dots">${Array.from({length: 24}, (_, i) => `<i style="--j:${i}"></i>`).join('')}</div></div>
        <div class="mplane l-out"><b>29 labels at once</b><div class="outs">${OUT.map(o => RELIABLE[o] ? `<i class="hot">${o}<em>${RELIABLE[o]}</em></i>` : `<i>${o}</i>`).join('')}</div></div>
        ${Array.from({length: 7}, (_, i) => `<span class="spark" style="--i:${i};--y:${22 + (i * 37) % 52}%"></span>`).join('')}
      </div></div>`;
    case 'features': return `<div class="sc sc-features">
        <div class="in-frame">${frame(BOX.t)}<span>VID01, 14:20</span></div>
        <div class="tower">${[['256', 150], ['512', 116], ['1024', 86], ['2048', 60]].map(([c, w], i) => `<div class="stage" style="--i:${i};--sw:${w}px">${slab()}<span>${c}</span></div>`).join('')}</div>
        <div class="proj"><span>2048 → 768</span></div>
        <div class="vec">${bars.map((h, i) => `<i style="--h:${(.18 + h * .82).toFixed(2)};--j:${i}"></i>`).join('')}</div>
      </div>`;
    case 'video': return `<div class="sc sc-video">
        <div class="arc">${SECONDS.map(({t, label, tools}, i) => `<div class="fr${tools.includes('scissors') ? ' is-cut' : ''}" style="--i:${i}">${frame(t, 192, 108)}<span class="ts">${label}</span><span class="tags">${tools.map(x => `<em>${x}</em>`).join('')}</span></div>`).join('')}</div>
        <div class="tl"><div class="tl-plane">
          ${Object.entries(TRACKS).map(([name, segs]) => `<div class="lane${name === 'scissors' ? ' is-cut' : ''}"><span>${name}</span><span class="track">${segs.map(([s, e]) => `<i style="left:${pct(s / VID01_LEN)};width:${pct(Math.max(2, e - s) / VID01_LEN)}"></i>`).join('')}</span></div>`).join('')}
          <span class="here" style="left:calc(100px + (100% - 132px) * ${(856 / VID01_LEN).toFixed(4)})"></span>
        </div></div>
      </div>`;
    default: return '';
  }
}

/* reverse: the chapters run bottom-up, from the surgery video to the player. The block keeps its shape
   (player on top); only the order of the chapters and their numbers flip. */
export function architectureSection({per = 2.1, reverse = false} = {}) {
  const order = reverse ? [...LAYERS].reverse() : LAYERS;
  const chapter = l => order.indexOf(l);
  const intro = reverse
    ? 'Surg+F is six layers, from the surgery video at the bottom up to the player you use. Scroll to build up through them, or pick a layer.'
    : 'Surg+F is six layers, from the player you use down to the surgery video underneath. Scroll to dig through them, or pick a layer.';
  return `<section class="dig" id="architecture" aria-labelledby="dig-heading" data-intro="1.6" data-per="${per}"${reverse ? ' data-reverse' : ''} style="--e:0;--nav:0;--depth:0;--travel:${1.6 + LAYERS.length * per}">
    <div class="dig-pin">
      <div class="dig-copy dig-intro-copy" data-copy="-1"><h2 id="dig-heading">Dig into the stack.</h2><p>${intro}</p></div>
      <div class="dig-map">
        <div class="dig-stage" aria-hidden="true"><div class="block">${LAYERS.map((l, i) => slab(`s${i}`)).join('')}</div></div>
        <ol class="dig-labels" aria-label="Layers"${reverse ? ' reversed' : ''}>${LAYERS.map(l => `<li><button type="button" data-dig="${chapter(l)}"><span>${chapter(l) + 1}</span>${l.name}</button></li>`).join('')}</ol>
      </div>
      ${order.map((l, i) => `<div class="layer" id="layer-${l.id}" data-layer="${i}" style="--p:0;--s:1">
        <div class="dig-copy layer-copy">
          <h3 id="layer-${l.id}-title">${l.name}</h3>
          <p>${l.body}</p>
          <div class="lv-stack"><span>Built with</span><ul>${l.stack.map(([t, h]) => `<li>${link(h, t)}</li>`).join('')}</ul></div>
          ${l.sources.length ? `<div class="lv-sources"><span>Sources</span><ul>${l.sources.map(([t, h]) => `<li>${link(h, t)}</li>`).join('')}</ul></div>` : ''}
        </div>
        <div class="pit" style="--k:${i}" role="img" aria-label="${l.name} animation"><canvas class="sky-dither" data-horizon=".72" data-ceiling="4.6" aria-hidden="true"></canvas><div class="fit">${scene(l.id)}</div><p class="v-cap">${NOTES[l.id]}</p></div>
      </div>`).join('')}
    </div>
  </section>`;
}

/* ---- Scroll mapping, shared by every pinned stage (`.dig`): this one and the model notes. The stage
   travels data-intro viewport heights before the first layer, then data-per for each layer. Inside a
   layer, the scene plays over the first PLAY of its span; the rest digs to the next. ---- */
const PLAY = .72, DIG = .2;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = v => v * v * (3 - 2 * v);
const config = section => {
  const intro = Number(section.dataset.intro) || 0, per = Number(section.dataset.per) || 1.3;
  const n = section.querySelectorAll('.layer').length;
  return {intro, per, n, travel: intro + n * per};
};

function digState(t, {intro, per, n}) {
  const e = smooth(clamp((t - .05) / 1.05));
  if (t < intro) return {e, d: -1 + smooth(clamp((t - (intro - .5)) / .5)), k: -1, u: 0};
  const L = (t - intro) / per, k = Math.min(n - 1, Math.floor(L)), u = clamp(L - k);
  const d = k + (k < n - 1 ? smooth(clamp((u - (1 - DIG)) / DIG)) : 0);
  return {e, d, k, u};
}

const isStacked = () => window.matchMedia?.('(max-width: 860px)').matches;

/* Scroll position that shows layer i of a pinned stage with its scene mostly played. */
export function digScrollTop(section, i) {
  if (!section) return null;
  if (isStacked()) {
    const el = section.querySelectorAll('.layer')[i];
    return el ? el.getBoundingClientRect().top + window.scrollY - 72 : null;
  }
  const cfg = config(section);
  const span = Math.max(1, section.offsetHeight - window.innerHeight);
  const t = cfg.intro + (i + (PLAY * .82)) * cfg.per;
  return section.getBoundingClientRect().top + window.scrollY + t / cfg.travel * span;
}

/* Arrow-key stops for one pinned stage: the opened block (stages with an intro), then each chapter
   just after its scene has finished playing and before it digs on to the next. */
export function digStops(section) {
  const layers = [...section.querySelectorAll('.layer')];
  if (isStacked()) return layers.map(l => l.getBoundingClientRect().top + window.scrollY - 72);
  const cfg = config(section);
  const span = Math.max(1, section.offsetHeight - window.innerHeight);
  const top = section.getBoundingClientRect().top + window.scrollY;
  const ts = cfg.intro > 0 ? [cfg.intro - .5] : [];
  for (let i = 0; i < cfg.n; i++) ts.push(cfg.intro + (i + PLAY + .06) * cfg.per);
  return ts.map(t => top + t / cfg.travel * span);
}

/* A chapter's progress by its layer id (null when this page version leaves the chapter out). */
export const layerP = (section, ps, id) => { const i = [...section.querySelectorAll('.layer')].findIndex(l => l.id === id); return i < 0 ? null : ps[i]; };
/* Page versions can show a subset of a stage's chapters (only) and set its pace (per). */
export const pickChapters = (chapters, only) => only ? chapters.filter(c => only.includes(c.id)) : chapters;

/* Hooks a stage can register to run after the shared variables are set (ps = each layer's progress). */
const hooks = [];
export const onStage = fn => hooks.push(fn);

export function updateArchitecture(root, reduced) {
  root.querySelectorAll('.dig').forEach(section => updateStage(section, reduced));
}

function updateStage(section, reduced) {
  const vh = window.innerHeight;
  const layers = [...section.querySelectorAll('.layer')];
  const slabs = [...section.querySelectorAll('.block .slab')];
  const rect = section.getBoundingClientRect();
  if (rect.bottom < -vh || rect.top > vh * 2) return;
  const cfg = config(section);
  section.style.setProperty('--travel', cfg.travel); // keeps the pinned length in step with data-per
  let e, d, ps, nav;
  if (isStacked()) {
    /* Phones: no pin. The block opens as it passes; each scene plays as it crosses the viewport. */
    const map = section.querySelector('.dig-map')?.getBoundingClientRect();
    e = reduced || !map ? 1 : smooth(clamp((vh * .85 - map.top) / (vh * .6)));
    d = -1; nav = 0;
    ps = layers.map(l => { const r = l.querySelector('.pit').getBoundingClientRect(); return reduced ? 1 : clamp((vh * .92 - r.top) / (r.height * 1.1)); });
    layers.forEach(l => { l.style.setProperty('--s', 0); l.style.setProperty('--sa', 0); });
  } else {
    const t = clamp(-rect.top / Math.max(1, section.offsetHeight - vh)) * cfg.travel;
    let k, u;
    ({e, d, k, u} = digState(t, cfg));
    if (reduced) { e = 1; d = Math.round(d); }
    nav = clamp(d + 1);
    ps = layers.map((_, j) => reduced || j < k ? 1 : j > k ? 0 : clamp(u / PLAY));
    layers.forEach((l, j) => { l.style.setProperty('--s', (j - d).toFixed(4)); l.style.setProperty('--sa', Math.abs(j - d).toFixed(4)); });
    const introCopy = section.querySelector('.dig-intro-copy');
    introCopy?.style.setProperty('--s', (-1 - d).toFixed(4));
    introCopy?.style.setProperty('--sa', Math.abs(-1 - d).toFixed(4));
  }
  section.style.setProperty('--e', e.toFixed(4));
  section.style.setProperty('--nav', nav.toFixed(4));
  section.classList.toggle('is-open', e > .35);
  section.classList.toggle('is-dug', d > -.5);
  const down = clamp(d / Math.max(1, cfg.n - 1));
  section.style.setProperty('--depth', (section.hasAttribute('data-reverse') ? 1 - down : down).toFixed(4));
  layers.forEach((l, j) => {
    l.style.setProperty('--p', ps[j].toFixed(4));
    l.classList.toggle('is-on', Math.abs(j - d) < .5);
  });
  /* The map keeps its shape; only the current layer's slab stays in full color. */
  const active = d < -.5 ? -1 : Math.round(d);
  /* Slab i is chapter i, or chapter n-1-i when the chapters run bottom-up (data-reverse). */
  const rev = section.hasAttribute('data-reverse');
  slabs.forEach((s, i) => s.style.setProperty('--dim', (nav * (1 - clamp(1 - Math.abs((rev ? slabs.length - 1 - i : i) - d)))).toFixed(4)));
  section.querySelectorAll('[data-dig]').forEach(b => { const on = Number(b.dataset.dig) === active; b.classList.toggle('is-on', on); b.toggleAttribute('aria-current', on); });
  /* Labels track their slab's top face; all share one column right of the widest slab. */
  if (slabs.length && !isStacked()) {
    const map = section.querySelector('.dig-map').getBoundingClientRect();
    const tops = slabs.map(s => s.querySelector('.top').getBoundingClientRect());
    const right = Math.max(...tops.map(r => r.right)) - map.left + 22;
    section.querySelectorAll('.dig-labels li').forEach((li, i) => {
      const r = tops[i];
      li.style.top = `${(r.top + r.height / 2 - map.top).toFixed(1)}px`;
      li.style.left = `${right.toFixed(1)}px`;
    });
  }
  /* Scenes are drawn in a fixed 560×540 box and scaled to fit their card. */
  layers.forEach(l => {
    const pit = l.querySelector('.pit');
    // Leave room: 16px at each side, and space above for breathing room and below for the caption.
    const fit = Math.min(1.25, (pit.clientWidth - 32) / 560, (pit.clientHeight - 96) / 540) || 1;
    pit.style.setProperty('--fit', fit.toFixed(4));
  });
  const head = section.querySelector('.mn-heading');
  if (head) section.style.setProperty('--head-h', `${head.offsetHeight}px`);
  hooks.forEach(fn => fn(section, ps, reduced, {d, stacked: isStacked()}));
}

/* This stage's extras: real frames, and the search question typing itself as the scene plays. */
let typed = '';
onStage((section, ps) => {
  if (section.id !== 'architecture') return;
  paintFrames(section);
  const ask = section.querySelector('.ask-text');
  if (ask) {
    const full = ask.dataset.type;
    const next = full.slice(0, Math.round(full.length * clamp((layerP(section, ps, 'layer-search') ?? 0) / .22)));
    if (next !== typed || ask.textContent !== next) { typed = next; ask.textContent = next; }
  }
});

/* ---- Real VID01 frames. One hidden video seeks to each requested second in turn and copies the picture
   into a cache; every canvas for that second is then painted. Any section can ask (paintFrames). Without
   the video, cards keep their gradient fallback. ---- */
const frameCache = new Map();
const pending = new Set();
let frameVideo = null, seeking = false, framesFailed = false;
const drawFrame = el => {
  const src = frameCache.get(el.dataset.t);
  if (!src || el.dataset.painted) return;
  try { el.getContext('2d')?.drawImage(src, 0, 0, el.width, el.height); el.dataset.painted = '1'; el.classList.add('is-painted'); } catch { /* no canvas */ }
};
export const cachedFrame = t => frameCache.get(String(t)) ?? null;
export function paintFrames(scope) {
  scope.querySelectorAll('canvas.vf').forEach(c => { if (frameCache.has(c.dataset.t)) drawFrame(c); else pending.add(c.dataset.t); });
  pumpFrames();
}
function pumpFrames() {
  if (seeking || framesFailed || !pending.size || typeof document === 'undefined' || /jsdom/i.test(navigator.userAgent)) return;
  const url = videoForCase('VID01');
  if (!url) return;
  seeking = true;
  if (!frameVideo) {
    frameVideo = document.createElement('video');
    frameVideo.muted = true; frameVideo.preload = 'auto'; frameVideo.playsInline = true;
    frameVideo.addEventListener('error', () => { framesFailed = true; seeking = false; }, {once: true});
    frameVideo.addEventListener('loadedmetadata', () => { seeking = false; pumpFrames(); }, {once: true});
    frameVideo.src = url;
    return;
  }
  const key = [...pending].sort((a, b) => a - b)[0];
  pending.delete(key);
  frameVideo.addEventListener('seeked', () => {
    try {
      const c = document.createElement('canvas');
      c.width = 854; c.height = 480;
      c.getContext('2d').drawImage(frameVideo, 0, 0, c.width, c.height);
      frameCache.set(key, c);
    } catch { /* decode failed: keep the fallback */ }
    document.querySelectorAll('canvas.vf').forEach(el => { if (el.dataset.t === key) drawFrame(el); });
    seeking = false;
    pumpFrames();
  }, {once: true});
  frameVideo.currentTime = Number(key);
}
