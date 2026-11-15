/* "Built on Databricks": everything the team ran on Databricks, as a pinned stage (same mechanics as
   architecture.js and modelnotes.js). Facts come from agent-kit/DATABRICKS.md, agent-kit/PROGRESS.md,
   ml/PROGRESS.md, databricks/README.md and backend/README.md (all logged 2026-11-14). Links checked
   2026-11-14. The Databricks mark is the simple-icons path (CC0 drawing of the Databricks trademark). */
import { onStage } from './architecture.js';

const link = (href, text) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
export const DATABRICKS_MARK = '<svg class="db-mark" viewBox="0 0 24 24" aria-hidden="true"><path fill="#FF3621" d="M.95 14.184L12 20.403l9.919-5.55v2.21L12 22.662l-10.484-5.96-.565.308v.77L12 24l11.05-6.218v-4.317l-.515-.309L12 19.118l-9.867-5.653v-2.21L12 16.805l11.05-6.218V6.32l-.515-.308L12 11.974 2.647 6.681 12 1.388l7.76 4.368.668-.411v-.566L12 0 .95 6.27v.72L12 13.207l9.919-5.55v2.26L12 15.52 1.516 9.56l-.565.308Z"/></svg>';

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
];

export function databricksSection() {
  return `<section class="dig dig-model dig-db" id="databricks" aria-labelledby="db-heading" data-intro="0" data-per="1.2" style="--travel:6;--nav:1">
    <div class="dig-pin">
      <div class="mn-heading db-heading"><h2 id="db-heading">${DATABRICKS_MARK}Built on Databricks.</h2><p>Everything below the player runs on Databricks.</p></div>
      <div class="dig-map"><ol class="dig-labels" aria-label="Databricks">${CHAPTERS.map((c, i) => `<li><button type="button" data-dig="${i}"><span>${i + 1}</span>${c.name}</button></li>`).join('')}</ol></div>
      ${CHAPTERS.map((c, i) => `<div class="layer" id="db-${c.id}" data-layer="${i}" style="--p:0;--s:1">
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
