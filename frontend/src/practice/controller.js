// Practice rule engine: a pure, deterministic state machine for one exercise session.
// It knows nothing about three.js, the DOM or the video. The workspace feeds it events from the
// 3D tool interaction and draws whatever state it returns. Every transition returns a new object;
// completed-stage records are frozen so later actions cannot alter them.
//
// Two modes:
// - easy: place a tool and press and hold. A wrong action is explained and can be retried.
// - hard: strict. Touching the wrong tissue, a slanted jaw, leaving the dissection line or the
//   wrong port all fail the stage; the stage resets and the failure is counted.

export const PHASES = ['ready', 'holding', 'placed', 'carrying', 'accepted', 'complete'];
export const MODES = ['easy', 'hard'];

export function createSession(exercise, { mode = 'easy' } = {}) {
  return freezeTop({
    exerciseId: exercise.exercise_id,
    contentRevision: exercise.content_revision,
    modelRevision: exercise.model_revision,
    mode: MODES.includes(mode) ? mode : 'easy',
    stageIndex: 0,
    phase: 'ready',
    heldToolId: null,
    pointId: null,
    attempts: 0,
    failures: 0, // hard mode: failed attempts at the current stage
    guided: false,
    feedback: { kind: 'intro', tone: 'info', message: exercise.stages[0].instruction },
    outcome: null, // the last evaluated action: { type: 'accepted' | 'rejected' | 'failed' | 'carrying', kind, stageId }
    records: [], // frozen snapshots of completed stages
    effects: [], // scene changes from accepted actions, in order
  });
}

const freezeTop = state => Object.freeze(state);
export const currentStage = (exercise, state) => exercise.stages[state.stageIndex];
const toolById = (exercise, id) => exercise.tools.find(tool => tool.id === id);
const pointById = (exercise, id) => exercise.action_points.find(point => point.id === id);
// The hard-mode settings of a stage, or {} in easy mode.
export const hardRules = (state, stage) => (state.mode === 'hard' && stage.hard) || {};

// Which check an attempt failed, in the order a resident should fix them. null means accepted.
// `angleDeg` is how far the jaws are from crossing the structure; `pathDone` whether the
// dissection line was traced. Both are only checked in hard mode, when the stage asks for them.
export function evaluate(exercise, stage, { toolId, pointId, gestureComplete = true, angleDeg = 0, pathDone = true }, rules = {}) {
  const tool = toolById(exercise, toolId);
  const point = pointById(exercise, pointId);
  if (!tool || tool.id !== stage.expected_tool_id) return 'tool';
  if (!point || !stage.target_ids.includes(point.target_id)) return 'target';
  if (!stage.action_point_ids.includes(point.id)) return 'placement';
  if (!gestureComplete || tool.gesture !== stage.expected_gesture) return 'gesture';
  if (rules.jaw_tolerance_deg != null && Math.abs(angleDeg) > rules.jaw_tolerance_deg) return 'angle';
  if (rules.path && !pathDone) return 'path';
  return null;
}

const GESTURE_HINT = 'The gesture stopped before it finished. Press and hold the instrument until the ring fills.';
const PAST = { engage_jaws: 'grasped', apply_clip: 'clipped', cut: 'cut', activate: 'burned' };

export function reduce(exercise, state, action) {
  const stage = currentStage(exercise, state);
  const rules = hardRules(state, stage);
  const next = patch => freezeTop({ ...state, outcome: null, ...patch });
  // Hard mode: the stage fails. Only this stage's changes are undone and it starts again.
  const fail = (kind, message) => next({
    phase: 'ready', heldToolId: null, pointId: null,
    attempts: state.attempts + 1, failures: state.failures + 1,
    effects: Object.freeze(state.effects.filter(effect => effect.stageId !== stage.id)),
    feedback: { kind, tone: 'error', message: `Stage failed. ${message}` },
    outcome: { type: 'failed', kind, stageId: stage.id },
  });
  const accept = () => {
    const effect = Object.freeze({ stageId: stage.id, toolId: state.heldToolId, pointId: state.pointId, ...stage.effect });
    const record = Object.freeze({
      stageId: stage.id, title: stage.title, toolId: state.heldToolId, pointId: state.pointId,
      attempts: state.attempts + 1, failures: state.failures, guided: state.guided,
      reference: Object.freeze({ start_sec: stage.reference_start_sec, end_sec: stage.reference_end_sec }),
      explanation: `${stage.feedback.success} ${stage.rationale}`,
    });
    return next({
      phase: 'accepted', heldToolId: null, attempts: state.attempts + 1,
      effects: Object.freeze([...state.effects, effect]), records: Object.freeze([...state.records, record]),
      feedback: { kind: 'success', tone: 'success', message: stage.feedback.success },
      outcome: { type: 'accepted', kind: null, stageId: stage.id },
    });
  };
  switch (action.type) {
    case 'pickup': {
      if (!['ready', 'holding', 'placed'].includes(state.phase)) return state;
      if (!stage.tool_tray_ids.includes(action.toolId)) return state;
      return next({ phase: 'holding', heldToolId: action.toolId, pointId: null, feedback: { kind: 'holding', tone: 'info', message: 'Move the instrument onto the model. The preview turns solid and says Ready when it can be placed there.' } });
    }
    case 'place': {
      if (state.phase !== 'holding' || !pointById(exercise, action.pointId)) return state;
      const tool = toolById(exercise, state.heldToolId);
      const how = rules.path && tool.id === stage.expected_tool_id ? 'press and hold the hook to switch it on, then drag it along the line' : 'press and hold the instrument';
      const aim = rules.jaw_tolerance_deg != null ? ' First turn the jaws so they cross the structure (scroll, or Q and E).' : '';
      return next({ phase: 'placed', pointId: action.pointId, feedback: { kind: 'placed', tone: 'info', message: `Placed.${aim} Now ${tool.gesture_label.toLowerCase()}: ${how}.` } });
    }
    case 'cancel': {
      if (!['holding', 'placed', 'carrying'].includes(state.phase)) return state;
      // Quietly back to the stage's starting state: no message, no penalty.
      return next({ phase: 'ready', heldToolId: null, pointId: null, feedback: { kind: 'intro', tone: 'info', message: stage.instruction } });
    }
    case 'contact': {
      // A tool released on tissue that is not a target of this stage.
      if (state.phase !== 'holding') return state;
      if (state.mode !== 'hard') return reduce(exercise, state, { type: 'cancel' });
      // The right structure but not the spot: a placement error, not "wrong tissue".
      const target = exercise.targets.find(item => item.organ === action.organ);
      if (target && stage.target_ids.includes(target.id)) return fail('placement', stage.feedback.placement);
      const tool = toolById(exercise, state.heldToolId);
      return fail('contact', `You ${PAST[tool?.gesture] ?? 'touched'} the ${String(action.label ?? 'wrong tissue').toLowerCase()}. That is not part of this stage.`);
    }
    case 'stray': {
      // Hard mode: the energised hook left the dissection line.
      if (state.phase !== 'placed' || !rules.path) return state;
      return fail('path', stage.feedback.path ?? 'The hook left the dissection line.');
    }
    case 'gesture': {
      if (state.phase !== 'placed') return state;
      const failed = evaluate(exercise, stage, {
        toolId: state.heldToolId, pointId: state.pointId, gestureComplete: action.complete !== false,
        angleDeg: action.angleDeg ?? 0, pathDone: action.pathDone !== false,
      }, rules);
      if (failed === 'gesture') {
        return next({ feedback: { kind: 'gesture', tone: 'error', message: GESTURE_HINT }, outcome: { type: 'rejected', kind: 'gesture', stageId: stage.id } });
      }
      if (failed && state.mode === 'hard') return fail(failed, stage.feedback[failed] ?? 'That was not the right action.');
      if (failed) {
        return next({
          phase: 'ready', heldToolId: null, pointId: null, attempts: state.attempts + 1,
          feedback: { kind: failed, tone: 'error', message: stage.feedback[failed] },
          outcome: { type: 'rejected', kind: failed, stageId: stage.id },
        });
      }
      // Hard mode, removal: the grasp is right; now carry the gallbladder to a port.
      if (rules.deliver_to) {
        return next({ phase: 'carrying', feedback: { kind: 'carrying', tone: 'info', message: stage.feedback.carry ?? 'Now drag it out through a port.' }, outcome: { type: 'carrying', kind: null, stageId: stage.id } });
      }
      return accept();
    }
    case 'deliver': {
      if (state.phase !== 'carrying') return state;
      if (action.port !== rules.deliver_to) return fail('port', stage.feedback.port ?? 'That is not the right port.');
      return accept();
    }
    case 'continue': {
      if (state.phase !== 'accepted') return state;
      if (state.stageIndex >= exercise.stages.length - 1) {
        return next({ phase: 'complete', pointId: null, feedback: { kind: 'complete', tone: 'success', message: 'Exercise complete. Review each stage below, then restart or exit.' } });
      }
      const following = exercise.stages[state.stageIndex + 1];
      return next({ stageIndex: state.stageIndex + 1, phase: 'ready', heldToolId: null, pointId: null, attempts: 0, failures: 0, guided: false, feedback: { kind: 'intro', tone: 'info', message: following.instruction } });
    }
    case 'resetStage': {
      if (state.phase === 'complete') return state;
      // Undo only this stage: drop its effect and record if it had been accepted.
      const effects = state.effects.filter(effect => effect.stageId !== stage.id);
      const records = state.records.filter(record => record.stageId !== stage.id);
      return next({ phase: 'ready', heldToolId: null, pointId: null, guided: state.guided, effects: Object.freeze(effects), records: Object.freeze(records), feedback: { kind: 'intro', tone: 'info', message: `Stage reset. ${stage.instruction}` } });
    }
    case 'restart':
      return createSession(exercise, { mode: state.mode });
    case 'guidance': {
      if (!['ready', 'holding', 'placed'].includes(state.phase)) return state;
      const tool = toolById(exercise, stage.expected_tool_id);
      const point = pointById(exercise, stage.action_point_ids[0]);
      return next({ guided: true, feedback: { kind: 'guidance', tone: 'info', message: `Guidance: use the ${tool.label.toLowerCase()} on the ${point.label.toLowerCase()}, then ${tool.gesture_label.toLowerCase()}.${stage.hard && state.mode === 'hard' && stage.hard.guidance ? ` ${stage.hard.guidance}` : ''} This stage will be marked as guided.` } });
    }
    default:
      return state;
  }
}

// Plain-language checklist for the current stage. The criteria are visible, but nothing is ticked
// until the action is evaluated, so the list never reveals the answer mid-attempt.
export function checklist(state, stage) {
  const done = state.phase === 'accepted' || state.phase === 'complete';
  const rules = stage ? hardRules(state, stage) : {};
  const items = [
    { id: 'tool', label: 'Choose the right instrument', done },
    { id: 'target', label: 'Find the right structure', done },
    { id: 'placement', label: 'Place it at the right spot', done },
  ];
  if (rules.jaw_tolerance_deg != null) items.push({ id: 'angle', label: 'Turn the jaws across the structure', done });
  if (rules.path) items.push({ id: 'path', label: 'Follow the dissection line', done });
  items.push({ id: 'gesture', label: 'Complete the gesture', done });
  if (rules.deliver_to) items.push({ id: 'port', label: 'Take it out through the right port', done });
  return items;
}
