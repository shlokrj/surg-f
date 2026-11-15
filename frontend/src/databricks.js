/* "Built on Databricks": everything the team ran on Databricks, as a pinned stage (same mechanics as
   architecture.js and modelnotes.js). Facts come from agent-kit/DATABRICKS.md, agent-kit/PROGRESS.md,
   ml/PROGRESS.md, databricks/README.md and backend/README.md (all logged 2026-11-14). Links checked
   2026-11-14. The Databricks mark is the simple-icons path (CC0 drawing of the Databricks trademark). */
import { onStage, pickChapters } from './architecture.js';

const link = (href, text) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
export const DATABRICKS_MARK = '<svg class="db-mark" viewBox="0 0 24 24" aria-hidden="true"><path fill="#FF3621" d="M.95 14.184L12 20.403l9.919-5.55v2.21L12 22.662l-10.484-5.96-.565.308v.77L12 24l11.05-6.218v-4.317l-.515-.309L12 19.118l-9.867-5.653v-2.21L12 16.805l11.05-6.218V6.32l-.515-.308L12 11.974 2.647 6.681 12 1.388l7.76 4.368.668-.411v-.566L12 0 .95 6.27v.72L12 13.207l9.919-5.55v2.26L12 15.52 1.516 9.56l-.565.308Z"/></svg>';

/* The lowercase databricks wordmark: letter paths from Wikimedia Commons File:Databricks-logo.svg, set
   beside the mark as in Databricks' horizontal logo. */
const DATABRICKS_WORD = '<svg class="db-word" viewBox="25.15 1.85 106.85 16.91" aria-hidden="true"><path fill="currentColor" d="M 37.449,18.443 V 1.852 h -2.556 v 6.207 c 0,0.093 -0.056,0.167 -0.148,0.204 A 0.23,0.23 0 0 1 34.505,8.207 C 33.634,7.191 32.282,6.618 30.8,6.618 c -3.167,0 -5.65,2.66 -5.65,6.06 0,1.663 0.575,3.197 1.63,4.324 a 5.44,5.44 0 0 0 4.02,1.736 c 1.463,0 2.815,-0.61 3.704,-1.662 0.056,-0.074 0.167,-0.093 0.24,-0.074 0.093,0.037 0.15,0.11 0.15,0.203 v 1.238 z m -6.093,-2.014 c -2.038,0 -3.63,-1.644 -3.63,-3.75 0,-2.107 1.592,-3.751 3.63,-3.751 2.038,0 3.63,1.644 3.63,3.75 0,2.106 -1.593,3.75 -3.63,3.75 m 19.762,2.016 V 6.896 H 48.581 V 8.06 c 0,0.093 -0.056,0.166 -0.149,0.203 A 0.2,0.2 0 0 1 48.192,8.19 C 47.34,7.173 46.006,6.6 44.487,6.6 c -3.167,0 -5.649,2.661 -5.649,6.06 0,3.4 2.482,6.06 5.65,6.06 1.463,0 2.815,-0.61 3.704,-1.68 0.055,-0.075 0.166,-0.093 0.24,-0.075 0.093,0.037 0.149,0.111 0.149,0.204 v 1.256 h 2.537 z M 45.062,16.43 c -2.038,0 -3.63,-1.645 -3.63,-3.75 0,-2.107 1.592,-3.751 3.63,-3.751 2.038,0 3.63,1.644 3.63,3.75 0,2.106 -1.593,3.75 -3.63,3.75 m 27.781,2.015 V 6.896 H 70.305 V 8.06 c 0,0.093 -0.055,0.166 -0.148,0.203 -0.093,0.037 -0.185,0 -0.24,-0.073 C 69.064,7.173 67.731,6.6 66.212,6.6 c -3.186,0 -5.649,2.661 -5.649,6.08 0,3.417 2.482,6.06 5.649,6.06 1.463,0 2.815,-0.61 3.704,-1.682 0.056,-0.074 0.167,-0.093 0.241,-0.074 0.093,0.037 0.148,0.11 0.148,0.203 v 1.256 z M 66.786,16.43 c -2.037,0 -3.63,-1.645 -3.63,-3.75 0,-2.107 1.593,-3.751 3.63,-3.751 2.037,0 3.63,1.644 3.63,3.75 0,2.106 -1.593,3.75 -3.63,3.75 m 10.706,0.647 c 0.019,0 0.056,-0.019 0.074,-0.019 0.056,0 0.13,0.037 0.167,0.074 0.87,1.016 2.222,1.589 3.704,1.589 3.167,0 5.65,-2.66 5.65,-6.06 0,-1.663 -0.575,-3.196 -1.63,-4.323 A 5.44,5.44 0 0 0 81.437,6.6 c -1.463,0 -2.815,0.61 -3.704,1.663 -0.056,0.074 -0.148,0.092 -0.24,0.074 C 77.4,8.3 77.344,8.226 77.344,8.133 V 1.852 h -2.556 v 16.59 h 2.556 V 17.28 c 0,-0.093 0.056,-0.166 0.148,-0.203 m -0.26,-4.398 c 0,-2.106 1.594,-3.75 3.631,-3.75 2.037,0 3.63,1.644 3.63,3.75 0,2.106 -1.593,3.75 -3.63,3.75 -2.037,0 -3.63,-1.662 -3.63,-3.75 M 94.477,9.263 c 0.24,0 0.463,0.019 0.61,0.056 V 6.695 A 2.4,2.4 0 0 0 94.662,6.658 c -1.334,0 -2.556,0.684 -3.204,1.774 -0.056,0.092 -0.149,0.13 -0.241,0.092 A 0.22,0.22 0 0 1 91.05,8.321 V 6.898 h -2.537 v 11.566 h 2.556 v -5.1 c 0,-2.53 1.296,-4.1 3.408,-4.1 m 4.815,-2.367 h -2.593 v 11.566 h 2.593 z M 97.958,1.87 a 1.571,1.571 0 1 0 0,3.141 1.571,1.571 0 1 0 0,-3.14 m 8.928,4.729 c -3.556,0 -6.131,2.55 -6.131,6.08 0,1.717 0.612,3.25 1.704,4.36 1.112,1.108 2.667,1.718 4.408,1.718 1.445,0 2.556,-0.277 4.668,-1.83 l -1.463,-1.533 c -1.038,0.684 -2.001,1.016 -2.945,1.016 -2.149,0 -3.76,-1.607 -3.76,-3.732 0,-2.125 1.611,-3.732 3.76,-3.732 1.018,0 1.963,0.333 2.908,1.016 L 111.664,8.43 C 109.757,6.804 108.034,6.6 106.886,6.6 m 9.149,6.762 a 0.2,0.2 0 0 1 0.149,-0.055 h 0.018 c 0.056,0 0.111,0.037 0.167,0.073 l 4.093,5.063 h 3.149 l -5.297,-6.393 c -0.075,-0.092 -0.075,-0.222 0.018,-0.295 l 4.871,-4.86 h -3.13 l -4.204,4.213 c -0.056,0.055 -0.148,0.074 -0.241,0.055 a 0.23,0.23 0 0 1 -0.13,-0.203 V 1.87 h -2.574 v 16.591 h 2.556 v -4.508 c 0,-0.055 0.018,-0.13 0.074,-0.166 z"/><path fill="currentColor" d="m 127.776,18.739 c 2.093,0 4.223,-1.275 4.223,-3.695 0,-1.589 -1,-2.68 -3.037,-3.344 l -1.39,-0.462 c -0.944,-0.314 -1.389,-0.758 -1.389,-1.367 0,-0.702 0.63,-1.183 1.519,-1.183 0.852,0 1.611,0.555 2.093,1.515 l 2.056,-1.108 c -0.759,-1.552 -2.334,-2.513 -4.149,-2.513 -2.297,0 -3.963,1.478 -3.963,3.492 0,1.607 0.963,2.679 2.944,3.307 l 1.427,0.462 c 1,0.314 1.426,0.72 1.426,1.367 0,0.98 -0.908,1.33 -1.686,1.33 -1.037,0 -1.963,-0.665 -2.407,-1.755 l -2.093,1.109 c 0.685,1.755 2.37,2.845 4.426,2.845 M 58.23,18.628 c 0.815,0 1.538,-0.074 1.945,-0.13 v -2.216 a 14,14 0 0 1 -1.278,0.073 c -1.037,0 -1.833,-0.184 -1.833,-2.42 V 9.187 c 0,-0.13 0.092,-0.222 0.222,-0.222 h 2.5 V 6.877 h -2.5 A 0.214,0.214 0 0 1 57.064,6.656 V 3.33 h -2.556 v 3.344 c 0,0.13 -0.093,0.222 -0.223,0.222 h -1.778 v 2.088 h 1.778 c 0.13,0 0.223,0.092 0.223,0.221 v 5.377 c 0,4.046 2.704,4.046 3.722,4.046"/></svg>';
const DATABRICKS_LOGO = `<a class="db-logo" href="https://www.databricks.com/" target="_blank" rel="noopener noreferrer" aria-label="Databricks (opens databricks.com)">${DATABRICKS_MARK}${DATABRICKS_WORD}</a>`;

/* data-scrub="from,to,start,span,digits": the number follows the scroll inside its chapter. */
const num = (from, to, start, span, digits = 0) => `<b data-scrub="${from},${to},${start},${span},${digits}">${Number(from).toFixed(digits)}</b>`;

/* ml/PROGRESS.md, v2 smoothing sweep on the 3 tuning surgeries (model fa3903c8), six-tool event F1. */
const SWEEP = [['0:1', .0872], ['1:1', .1246], ['2:2', .1816], ['3:3', .1717], ['5:3', .1680], ['10:5', .1501]];

const CHAPTERS = [
  {
    id: 'volumes', name: 'Unity Catalog Volume',
    title: 'One Volume for every file.',
    body: 'A Unity Catalog Volume holds everything too big for a table: SurgVLP features for all 50 surgeries, the 29-label file, every trained model, the predicted clips, and the two demo videos.',
    stack: [['Unity Catalog Volumes', 'https://docs.databricks.com/aws/en/volumes/'], ['Unity Catalog', 'https://docs.databricks.com/aws/en/data-governance/unity-catalog/']],
    note: 'The team Volume, /Volumes/workspace/default/surgf. One square per surgery’s feature bundle.',
    scene: () => `<div class="sc db-vol"><div class="db-win">
        <div class="db-path"><span>/Volumes/workspace/default/surgf/</span></div>
        <div class="fold f-feat" style="--r:0"><i class="fico"></i><span>features/</span><em>${num(0, 50, .12, .4)} surgeries</em>
          <div class="bundles">${Array.from({length: 50}, (_, j) => `<i style="--j:${j}"></i>`).join('')}</div></div>
        <div class="fold" style="--r:1"><i class="fico"></i><span>labels/</span><em>labels_v1.json, 29 labels</em></div>
        <div class="fold" style="--r:2"><i class="fico"></i><span>models/</span><em>multilabel/9d18d20a…</em></div>
        <div class="fold" style="--r:3"><i class="fico"></i><span>predictions/</span><em>predicted clip CSVs</em></div>
        <div class="fold" style="--r:4"><i class="fico"></i><span>videos/</span><em>VID01.mp4, VID02.mp4</em></div>
      </div></div>`,
  },
  {
    id: 'jobs', name: 'Serverless jobs',
    title: 'Every heavy step is a job.',
    body: 'Feature extraction, training, the smoothing sweep, the final test and clip export all ran as Databricks jobs on serverless CPU, launched from scripts in the repo. Serverless CPU started in under a minute, so nobody waited on a cluster.',
    stack: [['Serverless compute', 'https://docs.databricks.com/aws/en/compute/serverless/'], ['Lakeflow Jobs', 'https://docs.databricks.com/aws/en/jobs/']],
    note: 'The jobs behind the demo model, in order. Counts are from the team’s run log.',
    scene: () => `<div class="sc db-jobs"><span class="rail"><i></i></span>
      ${[['Extract features', 'SurgVLP on all 50 surgeries'], ['Train', 'Neural network on 42 surgeries'], ['Smoothing sweep', '6 settings × 3 tuning surgeries'], ['Final test', '4 held-out surgeries, run 9d18d20a'], ['Export clips', '1,658 predicted clips to the Volume']].map(([t, d], k) => `<div class="job" style="--k:${k}"><span class="dot"></span><div><b>${t}</b><small>${d}</small></div><span class="state"><span class="q">Queued</span><span class="ok">Succeeded</span></span><span class="chip">Serverless</span></div>`).join('')}
    </div>`,
  },
  {
    id: 'mlflow', name: 'MLflow',
    title: 'Every run is logged.',
    body: 'Each training run, sweep setting and test score is tracked in MLflow. Smoothing was picked on the tuning surgeries before the test was read, and the demo model is run 9d18d20a.',
    stack: [['MLflow on Databricks', 'https://docs.databricks.com/aws/en/mlflow/'], ['MLflow', 'https://mlflow.org/']],
    note: 'Logged runs. Sweep: six-tool clip F1 on the tuning surgeries, by max gap : min clip in seconds.',
    scene: () => `<div class="sc db-ml">
      <div class="runs"><h4>Test macro F1</h4>
        <div class="mlrun" style="--i:0;--v:.304"><code>3ce73d86</code><span>v1, 12 surgeries</span><span class="bar"><i></i></span>${num(0, .304, .06, .3, 3)}</div>
        <div class="mlrun is-best" style="--i:1;--v:.343"><code>9d18d20a</code><span>v2, 42 surgeries</span><span class="bar"><i></i></span>${num(0, .343, .12, .3, 3)}</div>
      </div>
      <div class="sweep"><h4>Smoothing sweep</h4><div class="cols">${SWEEP.map(([k, v], i) => `<div class="col${k === '2:2' ? ' is-best' : ''}" style="--i:${i};--v:${(v / .2).toFixed(3)}"><span class="val">${v.toFixed(3)}</span><span class="b"><i></i></span><span class="k">${k}</span></div>`).join('')}</div><span class="pick">Selected: 2 s : 2 s</span></div>
    </div>`,
  },
  {
    id: 'lakeflow', name: 'Lakeflow and Delta',
    title: 'Imports that never duplicate.',
    body: 'An on-demand Lakeflow job, surgf-import-clips, stages a CSV from the Volume and MERGEs it into one Delta table. Rerunning it inserts nothing new: a duplicate-key check returned 0.',
    stack: [['Lakeflow Jobs', 'https://docs.databricks.com/aws/en/jobs/'], ['MERGE INTO', 'https://docs.databricks.com/aws/en/sql/language-manual/delta-merge-into'], ['Delta Lake', 'https://delta.io/']],
    note: 'Row counts in workspace.default.surgf_clips after the last import.',
    scene: () => `<div class="sc db-lake">
      <div class="dag"><span class="file">clips_all.csv</span><span class="task t1"><b>stage</b><small>read_files</small></span><span class="task t2"><b>import</b><small>MERGE</small></span><span class="dpkt"></span>
        <svg viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><path d="M0 5H100"/></svg></div>
      <div class="delta"><div class="dt-head"><code>surgf_clips</code><span>Delta table</span></div>
        <div class="stackbar"><i class="s-ann"></i><i class="s-pred"></i></div>
        <div class="legend"><span><i class="s-ann"></i>Surgeon labels ${num(0, 11264, .3, .3)}</span><span><i class="s-pred"></i>Model predictions ${num(0, 1658, .38, .3)}</span></div></div>
      <div class="rerun"><b>Rerun</b><span>0 inserted</span><span>0 duplicate keys</span></div>
    </div>`,
  },
  {
    id: 'ai', name: 'SQL, Genie and Llama',
    title: 'Search and chat on Databricks.',
    body: 'Search runs parameterized queries on a Databricks SQL warehouse. Chat goes to Llama 3.3 70B on Foundation Model APIs, which picks a tool, and free-form questions go to a Genie space built on our quiz-facts view.',
    stack: [['Databricks SQL', 'https://docs.databricks.com/aws/en/sql/'], ['Genie', 'https://docs.databricks.com/aws/en/genie/'], ['Foundation Model APIs', 'https://docs.databricks.com/aws/en/machine-learning/foundation-model-apis/']],
    note: 'Live checks from the team log on 2026-11-14. Questions are paraphrased; routes and times are as logged.',
    scene: () => `<div class="sc db-ai">
      ${[['Show me the clipper', 'Llama 3.3 70B → SQL search', 'Opened clipper search', 2.0], ['Which instrument is used the longest?', 'Genie', 'Grasper, 1141 s', 11.7], ['When is the hook used after minute 10?', 'Genie', '6 intervals', 11.3]].map(([q, route, a, sec], k) => `<div class="ex" style="--k:${k};--sec:${sec / 12}">
        <span class="q">${q}</span><span class="via">${route}</span><span class="a">${a}</span><span class="time"><i></i><em>${sec.toFixed(1)} s</em></span></div>`).join('')}
      <div class="space"><span>Genie space</span><code>surgf_quiz_facts</code><code>surgf_steps</code><code>surgf_clock()</code></div>
    </div>`,
  },
  {
    id: 'apps', name: 'Databricks Apps',
    title: 'Hosted on Databricks Apps.',
    body: 'Surg+F runs as a Databricks App, with the web app and its FastAPI backend inside the same workspace. The app’s own service principal reaches the SQL warehouse, Genie, the Llama endpoint and the Volume, so there are no personal access tokens to hand around.',
    stack: [['Databricks Apps', 'https://docs.databricks.com/aws/en/dev-tools/databricks-apps/'], ['App resources', 'https://docs.databricks.com/aws/en/dev-tools/databricks-apps/resources']],
    note: 'The app and the workspace resources it reaches with its own service principal.',
    scene: () => `<div class="sc db-apps">
      <div class="app-card">
        <div class="app-head">${DATABRICKS_MARK}${DATABRICKS_WORD}<b>Apps</b></div>
        <div class="app-parts"><span>Web app</span><span>FastAPI backend</span></div>
        <div class="app-sp"><i aria-hidden="true"></i>Service principal</div></div>
      <svg class="app-wires" viewBox="0 0 560 540" aria-hidden="true">${[76, 212, 348, 484].map((x, k) => `<path style="--k:${k}" pathLength="1" d="M280 238C280 300 ${x} 292 ${x} 372"/>`).join('')}</svg>
      ${[76, 212, 348, 484].map((x, k) => `<span class="app-key" style="--k:${k};--x:${x}px"></span>`).join('')}
      <div class="app-res">${[['SQL warehouse', 'Search'], ['Genie space', 'Free-form questions'], ['Llama 3.3 70B', 'Chat routing'], ['Unity Catalog Volume', 'Features, models, videos']].map(([t, d], k) => `<div style="--k:${k}"><b>${t}</b><small>${d}</small></div>`).join('')}</div>
    </div>`,
  },
];

export function databricksSection({only, per = 2} = {}) {
  const chapters = pickChapters(CHAPTERS, only);
  return `<section class="dig dig-model dig-db" id="databricks" aria-labelledby="db-heading" data-intro="0" data-per="${per}" style="--travel:${chapters.length * per};--nav:1">
    <div class="dig-pin">
      <div class="mn-heading db-heading"><h2 id="db-heading"><span>Built on</span>${DATABRICKS_LOGO}</h2><p>Everything below the player runs on Databricks.</p></div>
      <div class="dig-map"><ol class="dig-labels" aria-label="Databricks">${chapters.map((c, i) => `<li><button type="button" data-dig="${i}"><span>${i + 1}</span>${c.name}</button></li>`).join('')}</ol></div>
      ${chapters.map((c, i) => `<div class="layer" id="db-${c.id}" data-layer="${i}" style="--p:0;--s:1">
        <div class="dig-copy layer-copy"><h3>${c.title}</h3><p>${c.body}</p><div class="lv-stack"><span>Built with</span><ul>${c.stack.map(([t, h]) => `<li>${link(h, t)}</li>`).join('')}</ul></div></div>
        <div class="pit" style="--k:${i}" role="img" aria-label="${c.name} animation"><canvas class="sky-dither" data-horizon=".72" data-ceiling="4.6" aria-hidden="true"></canvas><div class="fit">${c.scene()}</div><p class="v-cap">${c.note}</p></div>
      </div>`).join('')}
    </div>
  </section>`;
}

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = v => 1 - Math.pow(1 - v, 3);
onStage((section, ps) => {
  if (section.id !== 'databricks') return;
  section.querySelectorAll('.layer').forEach((layer, j) => {
    layer.querySelectorAll('[data-scrub]').forEach(el => {
      const [from, to, start, span, digits] = el.dataset.scrub.split(',').map(Number);
      const v = from + (to - from) * ease(clamp((ps[j] - start) / span));
      const text = digits ? v.toFixed(digits) : Math.round(v).toLocaleString('en-US');
      if (el.textContent !== text) el.textContent = text;
    });
  });
});
