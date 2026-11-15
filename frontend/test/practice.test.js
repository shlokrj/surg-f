import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { EXERCISES, parsePracticeIntent, findExercise, validateExercise } from '../src/practice/catalog.js';
import { sampleRanges, digestFile, checkEligibility, FINGERPRINT_ALGORITHM } from '../src/practice/eligibility.js';
import { createSession, reduce, evaluate, checklist, currentStage } from '../src/practice/controller.js';
import { STEP_SCENES } from '../src/model/steps.js';

const read = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url)));
const manifest = read('../src/model/manifest.json');
const exercise = EXERCISES[0];
const steps01 = read('../../backend/fixtures/steps.VID01.json');

// Drive the controller through a list of actions.
const run = (actions, start = createSession(exercise)) => actions.reduce((state, action) => reduce(exercise, state, action), start);
const solve = stage => [{ type: 'pickup', toolId: stage.expected_tool_id }, { type: 'place', pointId: stage.action_point_ids[0] }, { type: 'gesture', complete: true }];

test('the exercise definition is complete and every reference resolves', () => {
  assert.deepEqual(validateExercise(exercise, manifest), []);
  assert.equal(exercise.schema_version, 1);
  assert.ok(STEP_SCENES[exercise.step_key], 'bound to a known step');
  assert.equal(new Set(exercise.stages.map(stage => stage.id)).size, exercise.stages.length);
});

test('the exercise records the exact model revision it was authored on', () => {
  const glb = fs.readFileSync(new URL(`../public/${manifest.file}`, import.meta.url));
  assert.equal(exercise.model_revision, `sha256:${crypto.createHash('sha256').update(glb).digest('hex')}`, 'model changed: re-review the exercise and update model_revision');
});

test('unreviewed content stays labelled as a draft', () => {
  assert.ok(['draft', 'approved'].includes(exercise.review.status));
  if (exercise.review.status !== 'approved') {
    assert.equal(exercise.review.reviewed_at, null);
    assert.ok(exercise.review.limitations.length >= 2);
  }
});

test('stage reference moments sit inside annotated VID01 intervals and the step', () => {
  const rows = fs.readFileSync(new URL('../../shared/triplets.annotation.csv', import.meta.url), 'utf8').trim().split(/\r?\n/).slice(1)
    .map(line => line.split(',')).filter(([caseId]) => caseId === 'VID01')
    .map(([, start, end, instrument]) => ({ start: Number(start), end: Number(end), instrument }));
  for (const stage of exercise.stages) {
    const match = rows.find(row => row.instrument === stage.expected_tool_id && row.start <= stage.reference_start_sec && row.end >= stage.reference_end_sec);
    assert.ok(match, `${stage.id}: no ${stage.expected_tool_id} annotation covers ${stage.reference_start_sec}-${stage.reference_end_sec}`);
  }
  const step = steps01.steps.find(item => item.key === exercise.step_key);
  for (const stage of exercise.stages.slice(1)) assert.ok(stage.reference_start_sec >= step.start_sec && stage.reference_end_sec <= step.end_sec, stage.id);
  const starts = exercise.stages.map(stage => stage.reference_start_sec);
  assert.deepEqual(starts, [...starts].sort((a, b) => a - b), 'stages follow the video in order');
});

test('practice prompts are recognised; quiz requests are not', () => {
  assert.deepEqual(parsePracticeIntent('Let me practice clipping and cutting.'), { step_key: 'ClippingCutting' });
  assert.deepEqual(parsePracticeIntent('practice the clipping step'), { step_key: 'ClippingCutting' });
  assert.deepEqual(parsePracticeIntent('/practice'), { step_key: null });
  assert.deepEqual(parsePracticeIntent('can I practise Calot triangle dissection?'), { step_key: 'CalotTriangleDissection' });
  assert.deepEqual(parsePracticeIntent('practice gallbladder dissection'), { step_key: 'GallbladderDissection' });
  assert.equal(parsePracticeIntent('give me practice questions'), null);
  assert.equal(parsePracticeIntent('quiz me, I want to practice'), null);
  assert.equal(parsePracticeIntent('when is the cystic duct clipped?'), null);
  assert.equal(findExercise('ClippingCutting'), exercise);
  assert.equal(findExercise(null), exercise);
  assert.equal(findExercise('CalotTriangleDissection'), null);
});

test('the fingerprint samples the start, middle and end of the file', async () => {
  assert.deepEqual(sampleRanges(100), [[0, 100]]);
  const size = 692593324;
  const ranges = sampleRanges(size);
  assert.equal(ranges.length, 3);
  assert.deepEqual(ranges[0], [0, 262144]);
  assert.deepEqual(ranges[2], [size - 262144, size]);
  const blob = new Blob([new Uint8Array(1000).map((_, i) => i % 251)]);
  const print = await digestFile(blob);
  assert.equal(print.algorithm, FINGERPRINT_ALGORITHM);
  assert.equal(print.sample_sha256, crypto.createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex'));
});

test('the bound fingerprint matches the real VID01 file when it is present', { skip: !fs.existsSync(new URL('../public/videos/VID01.mp4', import.meta.url)) && 'VID01.mp4 not downloaded' }, async () => {
  const buffer = fs.readFileSync(new URL('../public/videos/VID01.mp4', import.meta.url));
  const print = await digestFile(new Blob([buffer]));
  assert.equal(print.bytes, exercise.eligible_video.fingerprint.bytes);
  assert.equal(print.sample_sha256, exercise.eligible_video.fingerprint.sample_sha256);
});

test('only the exact uploaded demo asset is eligible', () => {
  const good = { ...exercise.eligible_video.fingerprint };
  const upload = { localVideo: true, caseId: 'Local video', fingerprint: good, duration: 1733.04, videoError: false, fingerprintError: false };
  assert.deepEqual(checkEligibility(exercise, upload), { ok: true });
  const reason = video => checkEligibility(exercise, { ...upload, ...video }).reason;
  assert.equal(reason({ localVideo: false, caseId: 'VID01' }), 'not_uploaded'); // hosted copy
  assert.equal(reason({ localVideo: false, caseId: 'VID02' }), 'not_uploaded');
  assert.equal(reason({ fingerprint: null }), 'pending');
  assert.equal(reason({ fingerprint: null, fingerprintError: true }), 'fingerprint_error');
  assert.equal(reason({ fingerprint: { ...good, sample_sha256: '0'.repeat(64) } }), 'mismatch');
  assert.equal(reason({ fingerprint: { ...good, bytes: good.bytes - 1 } }), 'mismatch');
  assert.equal(reason({ duration: 0 }), 'unknown_duration');
  assert.equal(reason({ duration: NaN }), 'unknown_duration');
  assert.equal(reason({ duration: 1500 }), 'duration_mismatch');
  assert.equal(reason({ videoError: true }), 'video_error');
  for (const video of [{ localVideo: false }, { fingerprint: null }, { duration: 1500 }]) assert.ok(checkEligibility(exercise, { ...upload, ...video }).message.length > 20);
});

test('evaluation reports the first failed constraint in a fixed order', () => {
  const stage = exercise.stages[1]; // first clip: clipper on the bile-duct side of the cystic duct
  assert.equal(evaluate(exercise, stage, { toolId: 'scissors', pointId: 'duct_bile_side' }), 'tool');
  assert.equal(evaluate(exercise, stage, { toolId: 'clipper', pointId: 'artery_middle' }), 'target');
  assert.equal(evaluate(exercise, stage, { toolId: 'clipper', pointId: 'duct_gb_side' }), 'placement');
  assert.equal(evaluate(exercise, stage, { toolId: 'clipper', pointId: 'duct_bile_side', gestureComplete: false }), 'gesture');
  assert.equal(evaluate(exercise, stage, { toolId: 'clipper', pointId: 'duct_bile_side' }), null);
});

test('a wrong attempt gives specific feedback, counts, and changes nothing', () => {
  const start = createSession(exercise);
  const wrong = run([{ type: 'pickup', toolId: 'hook' }, { type: 'place', pointId: 'gb_neck' }, { type: 'gesture', complete: true }], start);
  assert.equal(wrong.phase, 'ready');
  assert.equal(wrong.stageIndex, 0);
  assert.equal(wrong.heldToolId, null);
  assert.equal(wrong.attempts, 1);
  assert.deepEqual(wrong.effects, []);
  assert.equal(wrong.feedback.kind, 'tool');
  assert.equal(wrong.feedback.message, exercise.stages[0].feedback.tool);
  assert.deepEqual(wrong.outcome, { type: 'rejected', kind: 'tool', stageId: 'expose' });
  const placement = run([{ type: 'pickup', toolId: 'grasper' }, { type: 'place', pointId: 'gb_fundus' }, { type: 'gesture' }], wrong);
  assert.equal(placement.feedback.kind, 'placement');
  assert.equal(placement.attempts, 2);
  // An unfinished gesture keeps the tool placed so the resident can try again.
  const unfinished = run([{ type: 'pickup', toolId: 'grasper' }, { type: 'place', pointId: 'gb_neck' }, { type: 'gesture', complete: false }]);
  assert.equal(unfinished.phase, 'placed');
  assert.equal(unfinished.feedback.kind, 'gesture');
  assert.equal(unfinished.attempts, 0);
});

test('Continue only after an accepted action; the whole exercise runs in order', () => {
  let state = createSession(exercise);
  assert.equal(reduce(exercise, state, { type: 'continue' }), state, 'cannot skip a stage');
  exercise.stages.forEach((stage, index) => {
    assert.equal(currentStage(exercise, state).id, stage.id);
    state = run(solve(stage), state);
    assert.equal(state.phase, 'accepted');
    assert.equal(state.effects.length, index + 1);
    assert.ok(checklist(state).every(item => item.done));
    // Nothing more can happen until Continue.
    assert.equal(reduce(exercise, state, { type: 'pickup', toolId: stage.expected_tool_id }), state);
    state = reduce(exercise, state, { type: 'continue' });
  });
  assert.equal(state.phase, 'complete');
  assert.deepEqual(state.records.map(record => record.stageId), exercise.stages.map(stage => stage.id));
  assert.deepEqual(state.effects.map(effect => effect.type), ['hold', 'clip', 'clip', 'cut']);
  assert.ok(Object.isFrozen(state.records[0]), 'completed records cannot be altered');
  assert.ok(state.records.every(record => record.attempts === 1 && !record.guided));
});

test('the checklist never reveals correctness before evaluation', () => {
  const placed = run([{ type: 'pickup', toolId: 'grasper' }, { type: 'place', pointId: 'gb_neck' }]);
  assert.ok(checklist(placed).every(item => !item.done));
});

test('cancel returns the tool without penalty; Escape-style cancel works from placed', () => {
  const held = run([{ type: 'pickup', toolId: 'clipper' }]);
  const back = reduce(exercise, held, { type: 'cancel' });
  assert.equal(back.phase, 'ready');
  assert.equal(back.attempts, 0);
  const placed = run([{ type: 'pickup', toolId: 'clipper' }, { type: 'place', pointId: 'duct_middle' }, { type: 'cancel' }]);
  assert.equal(placed.phase, 'ready');
  assert.equal(placed.pointId, null);
});

test('reset stage undoes only the current stage; restart returns to stage one', () => {
  let state = run([...solve(exercise.stages[0]), { type: 'continue' }, ...solve(exercise.stages[1])]);
  assert.equal(state.effects.length, 2);
  state = reduce(exercise, state, { type: 'resetStage' });
  assert.equal(state.stageIndex, 1);
  assert.equal(state.phase, 'ready');
  assert.deepEqual(state.effects.map(effect => effect.stageId), ['expose'], 'earlier stage kept');
  assert.deepEqual(state.records.map(record => record.stageId), ['expose']);
  const restarted = reduce(exercise, state, { type: 'restart' });
  assert.equal(restarted.stageIndex, 0);
  assert.deepEqual(restarted.effects, []);
  assert.deepEqual(restarted.records, []);
});

test('guidance names the answer only when asked, and marks the stage as guided', () => {
  const fresh = createSession(exercise);
  assert.ok(!fresh.feedback.message.toLowerCase().includes('grasper'), 'the expected tool is not disclosed up front');
  const guided = reduce(exercise, fresh, { type: 'guidance' });
  assert.equal(guided.guided, true);
  assert.match(guided.feedback.message, /grasper/i);
  const done = run([...solve(exercise.stages[0]), { type: 'continue' }], guided);
  assert.equal(done.records[0].guided, true);
  assert.equal(done.guided, false, 'the next stage starts unguided');
});

test('state transitions are deterministic and never mutate the previous state', () => {
  const actions = [...solve(exercise.stages[0]), { type: 'continue' }, { type: 'pickup', toolId: 'scissors' }, { type: 'place', pointId: 'duct_middle' }, { type: 'gesture' }];
  assert.deepEqual(run(actions), run(actions));
  const start = createSession(exercise);
  const snapshot = JSON.stringify(start);
  run(actions, start);
  assert.equal(JSON.stringify(start), snapshot);
  assert.ok(Object.isFrozen(start));
  assert.equal(reduce(exercise, start, { type: 'place', pointId: 'gb_neck' }), start, 'cannot place without holding a tool');
  assert.equal(reduce(exercise, start, { type: 'pickup', toolId: 'unknown' }), start);
});
