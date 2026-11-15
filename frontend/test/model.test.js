import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { STEP_SCENES, FREE_SCENE, VIEWS, stepAt, stepIndexAt } from '../src/model/steps.js';

const read = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url)));
const manifest = read('../src/model/manifest.json');
const cases = ['VID01', 'VID02'].map(id => read(`../../backend/fixtures/steps.${id}.json`));
const organs = new Set(manifest.parts.map(part => part.name));

test('every step of both demo videos has a 3D picture', () => {
  for (const saved of cases) {
    for (const step of saved.steps) assert.ok(STEP_SCENES[step.key], `${saved.case_id}: no picture for ${step.key}`);
  }
});

test('step pictures only name organs and views that exist', () => {
  for (const [key, scene] of Object.entries({ ...STEP_SCENES, free: FREE_SCENE })) {
    assert.ok(VIEWS[scene.view], `${key}: unknown view ${scene.view}`);
    assert.ok(scene.shows.length > 10, `${key}: needs a one-line description`);
    for (const name of [...Object.keys(scene.ghost), ...scene.highlight]) assert.ok(organs.has(name), `${key}: unknown organ ${name}`);
    for (const opacity of Object.values(scene.ghost)) assert.ok(opacity > 0 && opacity < 1);
    for (const flag of ['ports', 'triangle', 'clips', 'cut', 'bed', 'bag']) assert.ok([0, 1].includes(scene[flag]), `${key}.${flag}`);
  }
});

test('the operation runs in order: cut stays cut, the freed gallbladder stays free', () => {
  const order = ['Preparation', 'CalotTriangleDissection', 'ClippingCutting', 'GallbladderDissection', 'GallbladderPackaging', 'CleaningCoagulation', 'GallbladderRetraction'];
  assert.deepEqual(Object.keys(STEP_SCENES), order);
  const cut = order.map(key => STEP_SCENES[key].cut);
  assert.deepEqual(cut, [0, 0, 1, 1, 1, 1, 1]);
  const lift = order.map(key => STEP_SCENES[key].lift);
  assert.ok(lift.every((value, i) => i === 0 || value >= lift[i - 1]), 'the gallbladder never moves back');
  assert.equal(STEP_SCENES.GallbladderRetraction.toPort > 0.5, true);
});

test('the model file lists the structures the panel needs', () => {
  for (const name of ['gallbladder', 'cystic_duct', 'cystic_artery', 'bile_duct', 'hepatic_artery', 'portal_vein', 'liver', 'stomach', 'duodenum', 'pancreas', 'body_outline']) {
    assert.ok(organs.has(name), `missing ${name}`);
  }
  assert.equal(manifest.parts.find(part => part.name === 'cystic_artery').drawn, true);
  assert.equal(manifest.parts.find(part => part.name === 'body_outline').group, 'outline');
  assert.equal(manifest.ports.length, 4);
  assert.match(manifest.source, /BodyParts3D.*CC Attribution 4\.0/);
  const file = new URL(`../public/${manifest.file}`, import.meta.url);
  const size = fs.statSync(file).size;
  assert.ok(size > 100_000 && size < 5_000_000, `model file is ${size} bytes`);
  assert.equal(fs.readFileSync(file).subarray(0, 4).toString(), 'glTF');
});

test('stepAt picks the step being played, including at the edges', () => {
  const steps = cases[0].steps;
  assert.equal(stepAt(steps, 0).key, 'Preparation');
  assert.equal(stepAt(steps, 20.9).key, 'Preparation');
  assert.equal(stepAt(steps, 21).key, 'CalotTriangleDissection');
  assert.equal(stepAt(steps, 672.9).key, 'CalotTriangleDissection');
  assert.equal(stepAt(steps, 673).key, 'ClippingCutting');
  assert.equal(stepAt(steps, 99999).key, 'GallbladderRetraction'); // past the end: last step
  assert.equal(stepIndexAt(steps, -5), 0);
  assert.equal(stepAt([], 10), null);
  assert.equal(stepAt(undefined, 10), null);
  assert.equal(stepAt(steps, NaN), null);
  assert.equal(stepIndexAt(undefined, 10), -1);
});
