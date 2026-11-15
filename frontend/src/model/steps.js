// What the 3D model shows at each step of a laparoscopic gallbladder removal.
//
// Keys are the Cholec80 phase names the backend returns from /cases/{case_id}/steps.
// Every entry is the FULL picture at that step (not a change from the previous one), so
// jumping straight to any step draws it correctly.
//
// This is a schematic study aid on a generic body. It is NOT YET MEDICALLY REVIEWED: a
// person with medical knowledge must check each entry before the notice in the panel is
// removed (see REVIEWED below).

export const REVIEWED = false;

// Camera positions. `target` is a point in the model (centimetres, gallbladder centre at
// the origin, +y up, +z toward the front of the body, -x the patient's right). `from` is
// the direction the camera sits in, and `distance` how far away, in centimetres.
export const VIEWS = {
  body: { target: [4.5, -2, -4], from: [0.2, 0.08, 1], distance: 84 },
  region: { target: [3.2, 1.2, -2], from: [0.12, -0.12, 1], distance: 44 },
  triangle: { target: [2.0, 1.6, -1.8], from: [0.18, -0.3, 1], distance: 13 },
  gallbladder: { target: [0.8, -0.4, 0.4], from: [-0.05, -0.3, 1], distance: 24 },
  liverBed: { target: [-0.2, 0.4, 0], from: [0.05, -0.35, 1], distance: 22 },
};

// Organs made see-through by a step so the working area is visible (0 = invisible, 1 = solid).
const CLEARED = { liver: 0.14, stomach: 0.05, duodenum: 0.06, pancreas: 0.06 };
// Later steps: the liver stays solid enough to show where the gallbladder sat.
const OPENED = { liver: 0.5, stomach: 0.06, duodenum: 0.08, pancreas: 0.08 };

// Fields: view (a key of VIEWS); outline (opacity of the body outline); ghost (step-driven
// see-through organs); highlight (organs that glow); ports, triangle, clips, cut, bed, bag
// (0 or 1: schematic props shown); lift (centimetres the freed gallbladder is pulled away);
// toPort (0 to 1: how far the bagged gallbladder has travelled to the navel port);
// specimen (opacity of the gallbladder and its bag); shows (one line for the panel).
const BASE = {
  view: 'region', outline: 0.1, ghost: {}, highlight: [], ports: 0, triangle: 0, clips: 0, cut: 0,
  bed: 0, bag: 0, lift: 0, toPort: 0, specimen: 1, shows: '',
};

// The view when no step applies (a local video, or steps that failed to load).
export const FREE_SCENE = { ...BASE, shows: 'The gallbladder and the organs around it.' };

export const STEP_SCENES = {
  Preparation: {
    ...BASE, view: 'body', outline: 0.24, ports: 1,
    shows: 'Where the four ports usually go. The camera enters at the navel.',
  },
  CalotTriangleDissection: {
    ...BASE, view: 'triangle', ghost: CLEARED, highlight: ['cystic_duct', 'cystic_artery'], triangle: 1,
    shows: 'The yellow triangle is the area cleared to expose the cystic duct and cystic artery. The liver is faded so you can see it.',
  },
  ClippingCutting: {
    ...BASE, view: 'triangle', ghost: CLEARED, highlight: ['cystic_duct', 'cystic_artery'], clips: 1, cut: 1,
    shows: 'Clips close the cystic duct and cystic artery, and each is cut between the clips.',
  },
  GallbladderDissection: {
    ...BASE, view: 'gallbladder', ghost: OPENED, highlight: ['gallbladder'], clips: 1, cut: 1, bed: 1, lift: 2.2,
    shows: 'The gallbladder is freed from the liver. The orange patch marks where it was attached.',
  },
  GallbladderPackaging: {
    ...BASE, view: 'gallbladder', ghost: OPENED, clips: 1, cut: 1, bag: 1, lift: 3.4,
    shows: 'The freed gallbladder is placed in a retrieval bag.',
  },
  CleaningCoagulation: {
    ...BASE, view: 'liverBed', ghost: { ...OPENED, liver: 0.85 }, clips: 1, cut: 1, bed: 1, bag: 1, lift: 3.4, specimen: 0.4,
    shows: 'The area where the gallbladder was attached is rinsed and checked for bleeding.',
  },
  GallbladderRetraction: {
    ...BASE, view: 'body', outline: 0.24, ports: 1, clips: 1, cut: 1, bag: 1, lift: 3.4, toPort: 0.92, specimen: 0.8,
    shows: 'The bagged gallbladder is pulled out through a port.',
  },
};

// Words in a chat message that name a step, most specific first. Used by tests and docs;
// the backend holds the copy that actually routes chat messages.
export const STEP_ORDER = Object.keys(STEP_SCENES);

// The step being played at `time` seconds, or null. `steps` is the list from the backend:
// [{ key, start_sec, end_sec, ... }]. A time past the last step counts as the last step.
export function stepAt(steps, time) {
  if (!Array.isArray(steps) || !steps.length || !Number.isFinite(time)) return null;
  const index = stepIndexAt(steps, time);
  return index < 0 ? null : steps[index];
}

export function stepIndexAt(steps, time) {
  if (!Array.isArray(steps) || !steps.length || !Number.isFinite(time)) return -1;
  if (time < steps[0].start_sec) return 0;
  for (let i = 0; i < steps.length; i += 1) {
    if (time >= steps[i].start_sec && time < steps[i].end_sec) return i;
  }
  return steps.length - 1;
}
