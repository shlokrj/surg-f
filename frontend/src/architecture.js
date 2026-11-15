/* "Dig into the stack": the homepage architecture section (MadHacks 2026 theme: let's dig in).
   An isometric block pulls apart into six layers, then each layer gets its own scroll-driven scene,
   from the surface (the player) down to the bedrock (surgery video). All facts come from the repo:
   README.md, agent-kit/SPEC.md, agent-kit/DATABRICKS.md, backend/README.md, ml/README.md and
   frontend/public/model-evals.md. Every link below was checked on 2026-11-14. */

const link = (href, text) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;

export const LAYERS = [
  {
    id: 'player', name: 'The player',
    body: 'A Vite app in plain JavaScript. Choosing a result seeks the video to the clip’s first second, and experimental anatomy boxes (gallbladder, cystic duct) from a Faster R-CNN trained on Endoscapes can be drawn over VID01.',
    stack: [['Vite', 'https://vite.dev/'], ['Inclusive Sans', 'https://www.oliviaking.com/inclusivesans'], ['Faster R-CNN (torchvision)', 'https://docs.pytorch.org/vision/0.21/models/generated/torchvision.models.detection.fasterrcnn_mobilenet_v3_large_320_fpn.html'], ['Endoscapes', 'https://github.com/CAMMA-public/Endoscapes']],
    sources: [['Ren et al., Faster R-CNN, 2015', 'https://arxiv.org/abs/1506.01497']],
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
    sources: [['Yuan et al., Learning multi-modal representations by watching hundreds of surgical video lectures, 2023', 'https://arxiv.org/abs/2307.15220']],
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

/* Mini stack beside each layer title: shows how deep this layer sits (1 = surface). */
const depth = i => `<span class="depth" role="img" aria-label="Layer ${i + 1} of ${LAYERS.length}">${LAYERS.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</span>`;

const clipRows = [['VID01', 674, 690, 'clipper'], ['VID01', 698, 747, 'clipper'], ['VID01', 749, 753, 'clipper'], ['VID01', 860, 877, 'scissors'], ['VID02', 1255, 1268, 'clipper']];
/* VID01 seconds 855–864 from shared/triplets.annotation.csv: grasper throughout, scissors from 860 s. */
const VIDEO_SECONDS = Array.from({length: 10}, (_, i) => [`14:${String(15 + i).padStart(2, '0')}`, 855 + i >= 860 ? ['grasper', 'scissors'] : ['grasper']]);
const OUT = ['grasper', 'hook', 'bipolar', 'clipper', 'irrigator', 'scissors', 'grasp', 'retract', 'dissect', 'coagulate', 'clip', 'cut', 'aspirate', 'irrigate', 'pack', 'gallbladder', 'cystic plate', 'cystic duct', 'cystic artery', 'cystic pedicle', 'blood vessel', 'fluid', 'abdominal wall', 'liver', 'adhesion', 'omentum', 'peritoneum', 'gut', 'specimen bag'];
const RELIABLE = new Set(['grasper', 'hook', 'retract', 'dissect', 'gallbladder', 'specimen bag']); // model-evals.md
const bars = Array.from({length: 32}, (_, i) => (Math.sin(i * 12.9898) * 43758.5453) % 1).map(v => Math.abs(v));

function visual(id) {
  switch (id) {
    case 'player': return `<div class="v-player">
        <div class="win"><div class="win-bar"><i></i><i></i><i></i><span>surg+f</span></div>
          <div class="win-video"><span class="bbox"><b>Experimental box</b></span></div>
          <div class="win-scrub"><span class="fill"></span><span class="knob"></span></div>
          <div class="win-meta"><span class="t">14:20</span><span>Cystic duct cut, VID01</span></div></div></div>`;
    case 'search': return `<div class="v-search"><div class="plane">
        <div class="node n-q"><span>Your question</span></div>
        <div class="node n-api">${slab('', 'FastAPI')}</div>
        <div class="node n-sql">${slab('', 'SQL')}</div>
        <div class="node n-genie">${slab('', 'Genie')}</div>
        <svg class="wires" viewBox="0 0 600 360" preserveAspectRatio="none" aria-hidden="true"><path d="M90 180H300"/><path d="M300 180L510 80"/><path d="M300 180L510 280"/></svg>
        <span class="pkt p1"></span><span class="pkt p2"></span><span class="pkt p3"></span><span class="pkt p4"></span>
      </div><div class="answer">860–877 s</div></div>`;
    case 'index': return `<div class="v-index"><div class="iso">
        ${clipRows.map(([c, s, e, l], k) => `<div class="row" style="--k:${k}">${slab('', `<span>${c}</span><span>${s}</span><span>${e}</span><span>${l}</span>`)}</div>`).join('')}
        <div class="base">${slab('', '')}</div></div><code class="tbl">workspace.default.surgf_clips</code></div>`;
    case 'model': return `<div class="v-model"><div class="rig">
        <div class="layer l-in"><b>Input</b><div class="grid">${'<i></i>'.repeat(60)}</div><small>5 s × 768 features</small></div>
        <div class="layer l-hid"><b>Hidden</b><div class="dots">${'<i></i>'.repeat(32)}</div></div>
        <div class="layer l-out"><b>29 labels</b><div class="outs">${OUT.map(o => `<i class="${RELIABLE.has(o) ? 'hot' : ''}">${o}</i>`).join('')}</div></div>
      </div></div>`;
    case 'features': return `<div class="v-features"><div class="lane">
        <div class="frame"><span>1 frame</span></div>
        <div class="enc-wrap"><div class="enc">${slab()}</div><span class="enc-label">SurgVLP<small>ResNet-50, frozen</small></span></div>
        <div class="vec">${bars.map((h, i) => `<i style="--h:${(.2 + h * .8).toFixed(2)};--j:${i}"></i>`).join('')}</div>
      </div><p class="v-cap">Illustration of one 768-number feature vector, 32 values shown.</p></div>`;
    case 'video': return `<div class="v-video"><div class="deck">
        ${VIDEO_SECONDS.map(([t, tools], i) => `<div class="fr${tools.includes('scissors') ? ' is-cut' : ''}" style="--i:${i}"><span>${t}</span><span class="tags">${tools.map(x => `<em>${x}</em>`).join('')}</span></div>`).join('')}
      </div><p class="v-cap">VID01, 14:15 to 14:24, one frame per second. Labels are the surgeons’ annotations.</p></div>`;
    default: return '';
  }
}

export function architectureSection() {
  return `<section class="dig" id="architecture" aria-labelledby="dig-heading">
    <div class="dig-intro">
      <div class="dig-sticky">
        <div class="dig-copy"><h2 id="dig-heading">Dig into the stack.</h2><p>Surg+F is six layers, from the player you use down to the surgery video underneath. Scroll to pull them apart.</p></div>
        <div class="dig-stage" aria-hidden="true">
          <div class="block">${LAYERS.map((l, i) => slab(`s${i}`)).join('')}</div>
        </div>
        <ol class="dig-labels">${LAYERS.map((l, i) => `<li data-label="${i}"><span>${i + 1}</span>${l.name}</li>`).join('')}</ol>
      </div>
    </div>
    ${LAYERS.map((l, i) => `<article class="lv" id="layer-${l.id}" aria-labelledby="layer-${l.id}-title" style="--p:0">
      <div class="lv-copy">
        ${depth(i)}
        <h3 id="layer-${l.id}-title">${l.name}</h3>
        <p>${l.body}</p>
        <div class="lv-stack"><span>Built with</span><ul>${l.stack.map(([t, h]) => `<li>${link(h, t)}</li>`).join('')}</ul></div>
        ${l.sources.length ? `<div class="lv-sources"><span>Sources</span><ul>${l.sources.map(([t, h]) => `<li>${link(h, t)}</li>`).join('')}</ul></div>` : ''}
      </div>
      <div class="lv-stage"><canvas class="sky-dither" data-horizon=".7" data-ceiling="4.6" aria-hidden="true"></canvas>${visual(l.id)}</div>
    </article>`).join('')}
  </section>`;
}

/* Scroll wiring: --e (0–1) explodes the block while the intro is pinned; each layer scene gets --p
   (0–1) as it passes through the viewport. Called from mountHome's rAF-throttled update. */
export function updateArchitecture(root, reduced) {
  const section = root.querySelector('.dig');
  if (!section) return;
  const vh = window.innerHeight;
  const intro = section.querySelector('.dig-intro');
  const span = Math.max(1, intro.offsetHeight - vh);
  const raw = reduced ? 1 : Math.max(0, Math.min(1, -intro.getBoundingClientRect().top / span));
  const e = Math.max(0, Math.min(1, (raw - .08) / .7));
  intro.style.setProperty('--e', (e * e * (3 - 2 * e)).toFixed(4));
  /* Labels track their slab's top face on screen. */
  const stage = section.querySelector('.dig-sticky').getBoundingClientRect();
  section.querySelectorAll('.block .slab').forEach((s, i) => {
    const r = s.querySelector('.top').getBoundingClientRect();
    const label = section.querySelector(`[data-label="${i}"]`);
    if (label) { label.style.top = `${(r.top + r.height / 2 - stage.top).toFixed(1)}px`; label.style.left = `${(r.right - stage.left + 24).toFixed(1)}px`; }
  });
  section.querySelectorAll('.lv').forEach(scene => {
    const r = scene.getBoundingClientRect();
    const p = reduced ? 1 : Math.max(0, Math.min(1, (vh * .9 - r.top) / (r.height * .9)));
    scene.style.setProperty('--p', p.toFixed(4));
  });
}
