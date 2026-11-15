// Practice catalog: which exercises exist, and how a Lil Doc message asks for one.
// Exercises are static, versioned JSON kept apart from the study scenes (model/steps.js) and from
// the observational annotations. Add an exercise only after its content has been reviewed.

import clipping from './exercises/cholecystectomy.clipping.v1.json' with { type: 'json' };

export const EXERCISES = [clipping];

// Names for each Cholec80 step, most specific first, so "gallbladder dissection" is not read as
// Calot's triangle dissection.
const STEP_WORDS = [
  ['GallbladderDissection', /gallbladder (?:dissection|from the liver)|liver bed|peel/],
  ['CalotTriangleDissection', /calot|triangle|critical view|dissect/],
  ['ClippingCutting', /\bclip|\bcut|divid/],
  ['GallbladderPackaging', /\bbag|packag/],
  ['CleaningCoagulation', /clean|coagul|irrigat|bleed/],
  ['GallbladderRetraction', /remov|retract|extract/],
  ['Preparation', /\bports?\b|trocar|prepar/],
];

export const STEP_LABELS = {
  Preparation: 'preparation',
  CalotTriangleDissection: 'Calot’s triangle dissection',
  ClippingCutting: 'clipping and cutting',
  GallbladderDissection: 'gallbladder dissection',
  GallbladderPackaging: 'gallbladder packaging',
  CleaningCoagulation: 'cleaning and coagulation',
  GallbladderRetraction: 'gallbladder removal',
};

// Is this message a request to practice a step? Returns { step_key } (step_key may be null when
// no step is named) or null. "Practice questions" and quizzes stay with the quiz feature.
export function parsePracticeIntent(text) {
  const lower = String(text ?? '').toLowerCase();
  const asked = /(^|\s)\/practice\b/.test(lower)
    || (/\b(practi[cs]e|practi[cs]ing|rehearse|simulat\w*|hands[- ]on)\b/.test(lower) && !/\bquestions?\b|\bquiz/.test(lower));
  if (!asked) return null;
  const step = STEP_WORDS.find(([, words]) => words.test(lower));
  // "practice clipping on hard", "hard mode", "harder", "challenge me": preselect Hard.
  const mode = /\bhard(er|est)?\b|\bchallenge\b|\bstrict\b/.test(lower) ? 'hard' : /\beasy\b/.test(lower) ? 'easy' : null;
  return { step_key: step ? step[0] : null, mode };
}

// The exercise for a step, or the only/first authored exercise when no step was named. An
// exercise can cover several steps (the removal stages follow clipping and cutting).
export function findExercise(stepKey) {
  if (!stepKey) return EXERCISES[0] ?? null;
  return EXERCISES.find(exercise => exercise.step_key === stepKey || exercise.also_step_keys?.includes(stepKey)) ?? null;
}

export const exerciseById = id => EXERCISES.find(exercise => exercise.exercise_id === id) ?? null;

// Structural checks shared by the tests and the page: every reference in an exercise resolves.
export function validateExercise(exercise, modelManifest) {
  const problems = [];
  const tools = new Map(exercise.tools.map(tool => [tool.id, tool]));
  const targets = new Set(exercise.targets.map(target => target.id));
  const points = new Map(exercise.action_points.map(point => [point.id, point]));
  const organs = new Set(modelManifest.parts.map(part => part.name));
  const anchors = new Set(Object.keys(modelManifest.anchors));
  const ports = new Set(modelManifest.ports.map(port => port.name));
  const anchorOk = name => anchors.has(name) || (name.startsWith('part:') && organs.has(name.slice(5)));
  for (const target of exercise.targets) if (!organs.has(target.organ)) problems.push(`target ${target.id}: unknown organ ${target.organ}`);
  for (const point of exercise.action_points) {
    if (!targets.has(point.target_id)) problems.push(`point ${point.id}: unknown target ${point.target_id}`);
    const names = point.at.anchor ? [point.at.anchor] : point.at.between ?? [];
    if (!names.length) problems.push(`point ${point.id}: no position`);
    for (const name of [...names, ...(point.axis ?? [])]) if (!anchorOk(name)) problems.push(`point ${point.id}: unknown anchor ${name}`);
    for (const organ of [point.surface_of, point.center_on].filter(Boolean)) if (!organs.has(organ)) problems.push(`point ${point.id}: unknown organ ${organ}`);
  }
  if (!exercise.stages.length) problems.push('no stages');
  for (const stage of exercise.stages) {
    const where = `stage ${stage.id}`;
    const expected = tools.get(stage.expected_tool_id);
    if (!expected) problems.push(`${where}: unknown expected tool`);
    else if (expected.gesture !== stage.expected_gesture) problems.push(`${where}: expected gesture is not the tool's gesture`);
    if (!stage.tool_tray_ids.includes(stage.expected_tool_id)) problems.push(`${where}: expected tool is not in the tray`);
    if (stage.tool_tray_ids.length < 2) problems.push(`${where}: the tray must offer a choice`);
    for (const id of stage.tool_tray_ids) if (!tools.has(id)) problems.push(`${where}: unknown tray tool ${id}`);
    for (const id of stage.target_ids) if (!targets.has(id)) problems.push(`${where}: unknown target ${id}`);
    for (const id of stage.action_point_ids) {
      const point = points.get(id);
      if (!point) problems.push(`${where}: unknown action point ${id}`);
      else if (!stage.target_ids.includes(point.target_id)) problems.push(`${where}: action point ${id} is not on a stage target`);
    }
    if (!ports.has(stage.interaction.entry_port)) problems.push(`${where}: unknown entry port`);
    if (!(stage.interaction.snap_distance_cm > 0 && stage.interaction.preview_distance_cm > stage.interaction.snap_distance_cm)) problems.push(`${where}: snap distances`);
    for (const key of ['tool', 'target', 'placement', 'success']) if (!stage.feedback?.[key]) problems.push(`${where}: missing ${key} feedback`);
    for (const id of stage.action_point_ids) if (points.get(id)?.path_only) problems.push(`${where}: ${id} is a path point, not a place to start`);
    if (stage.effect && !['hold', 'clip', 'cut', 'detach', 'extract'].includes(stage.effect.type)) problems.push(`${where}: unknown effect ${stage.effect.type}`);
    // Hard-mode rules: each needs its feedback, and every reference must resolve.
    const hard = stage.hard ?? {};
    if (hard.jaw_tolerance_deg != null) {
      if (!(hard.jaw_tolerance_deg > 0 && hard.jaw_tolerance_deg < 90)) problems.push(`${where}: jaw tolerance`);
      if (!stage.feedback.angle) problems.push(`${where}: missing angle feedback`);
      if (!stage.action_point_ids.every(id => points.get(id)?.axis)) problems.push(`${where}: jaw angle needs an action point with an axis`);
    }
    if (hard.path) {
      if (hard.path.length < 2 || hard.path[0] !== stage.action_point_ids[0]) problems.push(`${where}: the path must start at the stage's action point`);
      for (const id of hard.path) if (!points.has(id)) problems.push(`${where}: unknown path point ${id}`);
      if (!(hard.path_tolerance_cm > 0)) problems.push(`${where}: path tolerance`);
      if (!stage.feedback.path) problems.push(`${where}: missing path feedback`);
    }
    if (hard.deliver_to) {
      if (!ports.has(hard.deliver_to)) problems.push(`${where}: unknown delivery port`);
      for (const key of ['carry', 'port']) if (!stage.feedback[key]) problems.push(`${where}: missing ${key} feedback`);
    }
    if (!(stage.reference_end_sec > stage.reference_start_sec)) problems.push(`${where}: reference interval`);
    if (stage.reference_end_sec > exercise.eligible_video.duration_sec) problems.push(`${where}: reference past the end of the video`);
  }
  return problems;
}
