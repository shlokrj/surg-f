// Practice interaction layer for the 3D viewer: a 3D tool tray, constrained tool placement with a
// snap preview, authored gestures and discrete action props (clips, a held grasper, a cut).
//
// The viewer installs this with its internals. The practice workspace talks to it only through
// the returned interface and the events it emits; it never sees a three.js object. This layer
// does not decide whether an action is right: it reports what the resident did, and the practice
// controller (src/practice/controller.js) evaluates it.

import { createTool, clipMesh } from './tools.js';

const TRAY_DEPTH = 10;
const HOLD_MS = 520; // press-and-hold time for a gesture
const SETTLE_MS = 220;
const RETURN_MS = 320;
const GESTURE_MS = 380;
const TAP_PX = 6;
const TEAL = '#1aa58a';
const NEUTRAL = '#ffffff';
const GOLD = '#f2b705';
const RED = '#d0442c';

export function installPractice(ctx, { exercise, onEvent = () => {} }) {
  const { THREE, scene, camera, controls, canvas, element, root, organs, manifest, requestDraw } = ctx;
  const vec = array => new THREE.Vector3(...array);
  const anchorAt = name => name.startsWith('part:') ? vec(organs.get(name.slice(5)).part.center) : vec(manifest.anchors[name]);
  const ease = t => 1 - (1 - t) ** 3;
  const disposers = [];
  const listen = (target, name, handler, options) => { target.addEventListener(name, handler, options); disposers.push(() => target.removeEventListener(name, handler, options)); };
  root.updateMatrixWorld(true);

  // --- action points: authored positions resolved on the model --------------------------

  const worldVertices = organ => {
    const mesh = organs.get(organ).meshes[0];
    const attribute = mesh.geometry.getAttribute('position');
    const out = [];
    for (let i = 0; i < attribute.count; i += 1) out.push(new THREE.Vector3().fromBufferAttribute(attribute, i).applyMatrix4(mesh.matrixWorld));
    return out;
  };
  // Move a point onto the centre line of a tube-shaped organ: average the nearby vertices in a
  // thin slice across its axis.
  function centreOn(organ, point, axis) {
    const near = worldVertices(organ).filter(v => {
      const offset = v.clone().sub(point);
      return axis ? Math.abs(offset.dot(axis)) < 0.1 && offset.length() < 1.2 : offset.length() < 0.5;
    });
    if (near.length < 3) return point;
    return near.reduce((sum, v) => sum.add(v), new THREE.Vector3()).divideScalar(near.length);
  }
  // Move a point onto the visible surface of an organ, as seen from the exercise's camera.
  const view = exercise.scene.view;
  const viewEye = vec(view.target).addScaledVector(vec(view.from).normalize(), view.distance);
  function onSurface(organ, point) {
    const direction = point.clone().sub(viewEye).normalize();
    const hit = new THREE.Raycaster(viewEye, direction).intersectObject(organs.get(organ).meshes[0], false)[0];
    return hit ? hit.point.clone().addScaledVector(direction, -0.04) : point;
  }
  const points = new Map();
  for (const authored of exercise.action_points) {
    let position = authored.at.anchor ? anchorAt(authored.at.anchor) : anchorAt(authored.at.between[0]).lerp(anchorAt(authored.at.between[1]), authored.at.t);
    const axis = authored.axis ? anchorAt(authored.axis[1]).sub(anchorAt(authored.axis[0])).normalize() : null;
    if (authored.center_on) position = centreOn(authored.center_on, position, axis);
    if (authored.surface_of) position = onSurface(authored.surface_of, position);
    points.set(authored.id, { id: authored.id, label: authored.label, position, axis });
  }
  const pointOrder = [...points.keys()];
  const ports = new Map(manifest.ports.map(port => [port.name, vec(port.at)]));

  // --- halos: faint rings at every action point while a tool is held ---------------------

  const haloGroup = new THREE.Group();
  root.add(haloGroup);
  const halos = new Map();
  for (const point of points.values()) {
    const material = new THREE.MeshBasicMaterial({ color: NEUTRAL, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.27, 32), material);
    ring.position.copy(point.position);
    ring.renderOrder = 8;
    haloGroup.add(ring);
    halos.set(point.id, ring);
  }
  ctx.addBeforeDraw(() => { for (const ring of halos.values()) ring.quaternion.copy(camera.quaternion); });

  // --- tray: a second scene drawn on top, fixed to the screen -------------------------------

  const trayScene = new THREE.Scene();
  const trayCamera = new THREE.PerspectiveCamera(camera.fov, camera.aspect, 0.5, 100);
  trayScene.add(new THREE.HemisphereLight(0xffffff, 0x8fa39d, 1.6));
  const trayLamp = new THREE.DirectionalLight(0xffffff, 1.6);
  trayLamp.position.set(-1, 2, 3);
  trayScene.add(trayLamp);
  const trayBackMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.72, depthWrite: false });
  const trayBack = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), trayBackMaterial);
  trayScene.add(trayBack);
  ctx.addOverlay([trayScene, trayCamera]);

  const tools = new Map(); // id -> { id, label, gesture, tool, ghost, slot }
  for (const authored of exercise.tools) {
    const kind = authored.asset.replace(/^procedural:/, '');
    const tool = createTool(THREE, kind);
    const ghost = createTool(THREE, kind);
    ghost.makeGhost();
    ghost.group.visible = false;
    root.add(ghost.group);
    tools.set(authored.id, { id: authored.id, label: authored.label, gestureLabel: authored.gesture_label, tool, ghost, slot: -1, trayPose: null });
  }
  let trayIds = [];
  let entryPort = ports.values().next().value;

  function layoutTray() {
    trayCamera.aspect = camera.aspect;
    trayCamera.fov = camera.fov;
    trayCamera.updateProjectionMatrix();
    const halfHeight = TRAY_DEPTH * Math.tan((camera.fov * Math.PI) / 360);
    const halfWidth = halfHeight * camera.aspect;
    const count = Math.max(1, trayIds.length);
    const scale = Math.min(0.58, (halfWidth * 1.6) / (count * 1.55));
    const spacing = 1.55 * scale;
    const height = 2.5 * scale;
    const bottom = -halfHeight + halfHeight * 0.05;
    const direction = new THREE.Vector3(-0.42, -1, 0).normalize(); // handle down and a little left
    const jawAxis = new THREE.Vector3(0, 0, 1).cross(direction).normalize();
    const side = jawAxis.clone().cross(direction).normalize();
    const basis = new THREE.Matrix4().makeBasis(side, jawAxis, direction);
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(basis);
    trayIds.forEach((id, index) => {
      const entry = tools.get(id);
      // Left of centre, clear of the view buttons in the bottom-right corner.
      const x = (index - (count - 1) / 2) * spacing - halfWidth * 0.16;
      entry.slot = index;
      entry.trayPose = { position: new THREE.Vector3(x, bottom + height, -TRAY_DEPTH), quaternion: quaternion.clone(), scale };
      if (inTray(entry)) placeInTray(entry);
    });
    // Measure the instruments as laid out, sit them on the bottom margin, and fit the backdrop.
    const bounds = new THREE.Box3();
    for (const id of trayIds) {
      const entry = tools.get(id);
      bounds.union(trayBounds(entry));
    }
    const lift = bottom - bounds.min.y;
    for (const id of trayIds) {
      const entry = tools.get(id);
      entry.trayPose.position.y += lift;
      if (inTray(entry)) placeInTray(entry);
    }
    bounds.translate(new THREE.Vector3(0, lift, 0));
    const pad = 0.22;
    trayBack.position.set((bounds.min.x + bounds.max.x) / 2, (bounds.min.y + bounds.max.y) / 2, -TRAY_DEPTH - 0.6);
    trayBack.scale.set(bounds.max.x - bounds.min.x + pad * 2, bounds.max.y - bounds.min.y + pad * 2, 1);
    trayBack.visible = trayIds.length > 0;
  }
  // Bounds of a tool in its tray pose (camera space), measured without disturbing where it is now.
  function trayBounds(entry) {
    const { group } = entry.tool;
    const saved = { parent: group.parent, position: group.position.clone(), quaternion: group.quaternion.clone(), scale: group.scale.clone(), length: entry.tool.length };
    group.removeFromParent();
    group.position.copy(entry.trayPose.position);
    group.quaternion.copy(entry.trayPose.quaternion);
    group.scale.setScalar(entry.trayPose.scale);
    entry.tool.setLength(1.9);
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
    group.position.copy(saved.position);
    group.quaternion.copy(saved.quaternion);
    group.scale.copy(saved.scale);
    entry.tool.setLength(saved.length);
    saved.parent?.add(group);
    group.updateMatrixWorld(true);
    return box;
  }
  const inTray = entry => entry.tool.group.parent === trayScene;
  function placeInTray(entry) {
    const { group } = entry.tool;
    if (group.parent !== trayScene) trayScene.add(group);
    entry.tool.setLength(1.9);
    entry.tool.setClosed(0);
    entry.tool.setClipLoaded(true);
    group.position.copy(entry.trayPose.position);
    group.quaternion.copy(entry.trayPose.quaternion);
    group.scale.setScalar(entry.trayPose.scale);
    group.visible = true;
  }
  ctx.addBeforeDraw(() => { if (trayCamera.aspect !== camera.aspect) layoutTray(); });

  // --- poses -------------------------------------------------------------------------------

  // The pose of a tool whose working point is at `tip`, entering through the current port.
  // `axis` (a structure's direction) lines the jaws up across it.
  function poseAt(tip, axis = null) {
    const z = entryPort.clone().sub(tip);
    const length = z.length();
    z.normalize();
    // Across the structure if there is one, otherwise level with the screen.
    let x = axis ? axis.clone() : new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    x.addScaledVector(z, -x.dot(z));
    if (x.lengthSq() < 1e-6) x = new THREE.Vector3(0, 1, 0).cross(z);
    x.normalize();
    const y = z.clone().cross(x).normalize();
    return { position: tip.clone(), quaternion: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)), length };
  }
  function setPose(entry, pose) {
    const { group } = entry.tool;
    group.position.copy(pose.position);
    group.quaternion.copy(pose.quaternion);
    entry.tool.setLength(pose.length);
  }

  // --- animation helper ---------------------------------------------------------------------

  let busy = 0; // animations in flight; input is ignored meanwhile
  function animate(duration, step) {
    const ms = ctx.reducedMotion() ? 0 : duration;
    busy += 1;
    return new Promise(resolve => {
      const start = performance.now();
      const frame = now => {
        const t = ms ? Math.min(1, (now - start) / ms) : 1;
        step(ease(t), t);
        requestDraw();
        if (t < 1 && !disposed) requestAnimationFrame(frame);
        else { busy -= 1; resolve(); }
      };
      if (ms) requestAnimationFrame(frame); else frame(performance.now());
    });
  }

  // --- state --------------------------------------------------------------------------------

  let held = null; // tool entry in the resident's hand
  let placed = null; // point id the held tool is settled on
  let near = null; // { id, distance, ready } nearest action point while moving
  let follow = false; // a tapped tool follows the pointer until the next tap
  let drag = null; // { pointerId, x, y, moved }
  let gestureHold = null; // { start, pointerId, progress }
  let guidance = null; // { toolId, pointId }
  let keyboardIndex = -1;
  let disposed = false;
  let stageInfo = { snap: 0.2, preview: 0.6 };

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  function setPointer(event) {
    const box = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1);
  }
  function trayToolAt(event) {
    setPointer(event);
    trayScene.updateMatrixWorld(true);
    raycaster.setFromCamera(pointer, trayCamera);
    const hits = raycaster.intersectObjects(trayIds.map(id => tools.get(id).tool.group).filter(group => group.parent === trayScene && group.visible), true);
    let object = hits[0]?.object;
    while (object && !object.name?.startsWith('tool:')) object = object.parent;
    return object ? [...tools.values()].find(entry => entry.tool.group === object) ?? null : null;
  }
  function heldToolHit(event) {
    if (!held) return false;
    setPointer(event);
    raycaster.setFromCamera(pointer, camera);
    // Generous: the jaws are small, so a hit near the working point also counts.
    if (raycaster.intersectObject(held.tool.group, true).length) return true;
    return raycaster.ray.distanceToPoint(held.tool.group.position) < 0.45;
  }
  // Nearest action point to the pointer ray, in centimetres from the ray.
  function nearestPoint() {
    let best = null;
    for (const point of points.values()) {
      const distance = raycaster.ray.distanceToPoint(point.position);
      if (!best || distance < best.distance) best = { id: point.id, distance };
    }
    return best;
  }

  function showPreview(nextNear) {
    const before = near ? `${near.id}:${near.ready}` : '';
    near = nextNear;
    for (const entry of tools.values()) entry.ghost.group.visible = false;
    for (const [id, ring] of halos) {
      const guided = guidance?.pointId === id;
      const active = near?.id === id;
      ring.material.opacity = held ? (active ? (near.ready ? 0.95 : 0.6) : guided ? 0.8 : 0.32) : guided ? 0.8 : 0;
      ring.material.color.set(active && near.ready ? TEAL : guided ? GOLD : NEUTRAL);
      ring.scale.setScalar(active && near.ready ? 1.35 : 1);
    }
    if (held && near) {
      const point = points.get(near.id);
      const pose = poseAt(point.position, point.axis);
      const ghost = held.ghost;
      ghost.group.position.copy(pose.position);
      ghost.group.quaternion.copy(pose.quaternion);
      ghost.setLength(Math.min(pose.length, 3));
      ghost.setGhostColor(near.ready ? TEAL : NEUTRAL, near.ready ? 0.55 : 0.22);
      ghost.group.visible = true;
    }
    const after = near ? `${near.id}:${near.ready}` : '';
    if (after !== before) onEvent({ type: 'near', pointId: near?.id ?? null, label: near ? points.get(near.id).label : '', ready: Boolean(near?.ready) });
    requestDraw();
  }

  // Move the held tool so its working point follows the pointer ray, drawn toward a nearby
  // action point so it feels like it is settling into place.
  function followPointer(event) {
    setPointer(event);
    raycaster.setFromCamera(pointer, camera);
    const candidate = nearestPoint();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), candidate && candidate.distance < stageInfo.preview ? points.get(candidate.id).position : ctx.viewTarget());
    const tip = raycaster.ray.intersectPlane(plane, new THREE.Vector3()) ?? ctx.viewTarget();
    let preview = null;
    if (candidate && candidate.distance < stageInfo.preview) {
      preview = { id: candidate.id, distance: candidate.distance, ready: candidate.distance <= stageInfo.snap };
      const pull = preview.ready ? 0.65 : 0.25 * (1 - candidate.distance / stageInfo.preview);
      tip.lerp(points.get(candidate.id).position, pull);
    }
    setPose(held, poseAt(tip, preview ? points.get(preview.id).axis : null));
    showPreview(preview);
  }

  function liftFromTray(entry) {
    const { group } = entry.tool;
    group.scale.setScalar(1);
    root.add(group);
    entry.tool.setTint(TEAL, 0.25); // selected outline
    held = entry;
    placed = null;
    keyboardIndex = -1;
    const start = ctx.viewTarget().addScaledVector(entryPort.clone().sub(ctx.viewTarget()).normalize(), 1.6);
    setPose(entry, poseAt(start));
    showPreview(null);
  }

  // --- pointer input ---------------------------------------------------------------------------

  listen(element, 'pointerdown', event => {
    if (busy || event.button > 0) return;
    const fromTray = trayToolAt(event);
    if (placed && heldToolHit(event)) {
      // Press and hold the placed instrument to perform its gesture.
      controls.enabled = false;
      canvas.setPointerCapture?.(event.pointerId);
      gestureHold = { start: performance.now(), pointerId: event.pointerId, progress: 0 };
      requestAnimationFrame(holdFrame);
      event.stopPropagation();
      return;
    }
    if (fromTray) {
      controls.enabled = false;
      canvas.setPointerCapture?.(event.pointerId);
      drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      follow = false;
      onEvent({ type: 'request-pickup', toolId: fromTray.id });
      if (held?.id === fromTray.id) followPointer(event);
      event.stopPropagation();
      return;
    }
    if (held && !placed && (follow || heldToolHit(event))) {
      controls.enabled = false;
      canvas.setPointerCapture?.(event.pointerId);
      drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false, refollow: follow };
      followPointer(event);
      event.stopPropagation();
    }
    // Anything else: the camera orbit handles it.
  }, { capture: true });

  listen(element, 'pointermove', event => {
    if (!held || placed || busy) return;
    if (drag && event.pointerId === drag.pointerId) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > TAP_PX) drag.moved = true;
      followPointer(event);
    } else if (follow && !event.buttons) followPointer(event);
  });

  function endPointer(event, cancelled = false) {
    if (gestureHold && event.pointerId === gestureHold.pointerId) {
      const { progress } = gestureHold;
      gestureHold = null;
      controls.enabled = true;
      if (progress >= 1) return;
      held?.tool.setClosed(0);
      requestDraw();
      if (progress > 0.15 && !cancelled) onEvent({ type: 'gesture', complete: false });
      return;
    }
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { moved, refollow } = drag;
    drag = null;
    controls.enabled = true;
    if (!held || placed) return;
    if (cancelled) { onEvent({ type: 'request-cancel' }); return; }
    if (!moved && !refollow) { follow = true; return; } // a tap: the tool follows the pointer
    if (near?.ready) { follow = false; onEvent({ type: 'request-place', pointId: near.id }); return; }
    if (!moved && refollow) { follow = false; onEvent({ type: 'request-cancel' }); return; } // tapped off-target
    follow = false;
    onEvent({ type: 'request-cancel' }); // released outside a snap zone: back to the tray, no penalty
  }
  listen(element, 'pointerup', event => endPointer(event));
  listen(element, 'pointercancel', event => endPointer(event, true));

  function holdFrame(now) {
    if (!gestureHold || disposed) return;
    const progress = Math.min(1, (now - gestureHold.start) / (ctx.reducedMotion() ? 1 : HOLD_MS));
    gestureHold.progress = progress;
    held?.tool.setClosed(progress);
    onEvent({ type: 'gesture-progress', value: progress });
    requestDraw();
    if (progress < 1) { requestAnimationFrame(holdFrame); return; }
    gestureHold = null;
    controls.enabled = true;
    onEvent({ type: 'gesture', complete: true });
  }

  ctx.setHoverHook(event => {
    if (gestureHold || drag) return { cursor: 'grabbing', label: '' };
    if (placed && heldToolHit(event)) return { cursor: 'pointer', label: `Press and hold: ${held.gestureLabel.toLowerCase()}` };
    const entry = trayToolAt(event);
    if (entry) {
      onEvent({ type: 'focus-tool', toolId: entry.id });
      return { cursor: 'grab', label: entry.label };
    }
    if (held && !placed) return { cursor: 'grabbing', label: near ? points.get(near.id).label : '' };
    return null;
  });

  // --- props from accepted actions ------------------------------------------------------------

  const props = new Map(); // stageId -> { object, dispose }
  let cutAmount = 0;
  function makeProp(effect) {
    const point = points.get(effect.pointId);
    const pose = poseAt(point.position, point.axis);
    if (effect.type === 'clip') {
      const clip = clipMesh(THREE);
      clip.position.copy(pose.position);
      clip.quaternion.copy(pose.quaternion);
      clip.scale.set(1, 0.45, 1);
      root.add(clip);
      return { object: clip, dispose: () => { clip.traverse(o => o.geometry?.dispose()); clip.userData.material.dispose(); clip.removeFromParent(); } };
    }
    if (effect.type === 'hold') {
      const entry = tools.get(effect.toolId);
      const copy = createTool(THREE, entry.tool.kind);
      copy.group.position.copy(pose.position);
      copy.group.quaternion.copy(pose.quaternion);
      copy.setLength(pose.length);
      copy.setClosed(1);
      root.add(copy.group);
      return { object: copy.group, dispose: () => { copy.dispose(); copy.group.removeFromParent(); } };
    }
    return { object: null, dispose: () => {} };
  }
  // Make the scene show exactly these accepted effects (used after accept, reset and restart).
  async function syncEffects(effects, { animate: animated = true } = {}) {
    const wanted = new Map(effects.map(effect => [effect.stageId, effect]));
    for (const [stageId, prop] of props) if (!wanted.has(stageId)) { prop.dispose(); props.delete(stageId); }
    for (const effect of effects) if (!props.has(effect.stageId) && effect.type !== 'cut') props.set(effect.stageId, makeProp(effect));
    const cut = effects.find(effect => effect.type === 'cut');
    const goal = cut ? 1 : 0;
    if (goal !== cutAmount) {
      const from = cutAmount;
      cutAmount = goal;
      if (animated) await animate(500, k => ctx.setCut(cut?.organ ?? 'cystic_duct', from + (goal - from) * k));
      else ctx.setCut(cut?.organ ?? 'cystic_duct', goal);
    }
    requestDraw();
  }

  // --- the interface the workspace uses -----------------------------------------------------------

  async function returnToTray({ reject = false } = {}) {
    const entry = held;
    if (!entry) return;
    held = null; placed = null; follow = false; drag = null; gestureHold = null;
    controls.enabled = true;
    showPreview(null);
    if (reject) {
      await animate(260, (k, t) => { entry.tool.setTint(RED, 0.7 * Math.sin(Math.PI * t)); entry.tool.group.position.addScaledVector(new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion), Math.sin(t * Math.PI * 6) * 0.01); });
    }
    const from = { position: entry.tool.group.position.clone(), quaternion: entry.tool.group.quaternion.clone() };
    // Draw the instrument back out toward its port, jaws open, then put it in the tray.
    entry.tool.setClosed(0);
    await animate(RETURN_MS, k => entry.tool.group.position.lerpVectors(from.position, entryPort, k * 0.6));
    entry.tool.setTint(NEUTRAL, 0);
    if (!disposed && entry.trayPose) placeInTray(entry);
    requestDraw();
  }

  const api = {
    // Configure the tray and constraints for one stage.
    setStage(stage) {
      trayIds = [...stage.tool_tray_ids];
      entryPort = ports.get(stage.interaction.entry_port) ?? entryPort;
      stageInfo = { snap: stage.interaction.snap_distance_cm, preview: stage.interaction.preview_distance_cm };
      for (const entry of tools.values()) {
        if (!trayIds.includes(entry.id)) { entry.tool.group.removeFromParent(); entry.ghost.group.visible = false; }
      }
      layoutTray();
      for (const id of trayIds) { const entry = tools.get(id); if (entry !== held) placeInTray(entry); }
      requestDraw();
    },
    // Take a tool from the tray (pointer or keyboard).
    hold(toolId) {
      const entry = tools.get(toolId);
      if (!entry || busy) return false;
      if (held && held !== entry) { const previous = held; held = null; placed = null; previous.tool.setTint(NEUTRAL, 0); placeInTray(previous); }
      if (held !== entry) liftFromTray(entry);
      requestDraw();
      return true;
    },
    // Keyboard: move the held tool to the next (+1) or previous (-1) authored position.
    stepPosition(direction) {
      if (!held || placed || busy) return null;
      keyboardIndex = (keyboardIndex + direction + pointOrder.length) % pointOrder.length;
      const point = points.get(pointOrder[keyboardIndex]);
      setPose(held, poseAt(point.position.clone().lerp(entryPort, 0.04), point.axis));
      showPreview({ id: point.id, distance: 0, ready: true });
      return { pointId: point.id, label: point.label };
    },
    get nearPoint() { return near?.ready ? near.id : null; },
    // Ease the held tool into the exact pose at an action point.
    async settle(pointId) {
      const point = points.get(pointId);
      if (!held || !point) return;
      placed = pointId;
      follow = false;
      const goal = poseAt(point.position, point.axis);
      const from = { position: held.tool.group.position.clone(), quaternion: held.tool.group.quaternion.clone(), length: held.tool.length };
      for (const entry of tools.values()) entry.ghost.group.visible = false;
      const entry = held;
      await animate(SETTLE_MS, k => {
        entry.tool.group.position.lerpVectors(from.position, goal.position, k);
        entry.tool.group.quaternion.slerpQuaternions(from.quaternion, goal.quaternion, k);
        entry.tool.setLength(from.length + (goal.length - from.length) * k);
      });
      showPreview({ id: pointId, distance: 0, ready: true });
    },
    // Button or keyboard: animate the gesture, then report it as complete.
    async runGesture() {
      if (!held || !placed || busy) return;
      const entry = held;
      await animate(GESTURE_MS, k => entry.tool.setClosed(k));
      onEvent({ type: 'gesture', complete: true });
    },
    // After an accepted action: keep the result on the model and put the instrument back.
    async accept(effects) {
      const entry = held;
      if (entry?.tool.kind === 'clipper') entry.tool.setClipLoaded(false);
      await syncEffects(effects);
      if (entry && effects.at(-1)?.type === 'hold') {
        // A copy of the grasper now holds the tissue; the tray gets its own grasper back.
        held = null; placed = null;
        entry.tool.setTint(NEUTRAL, 0);
        placeInTray(entry);
        showPreview(null);
        return;
      }
      await returnToTray();
    },
    // After a rejected action: a short shake, then back to the tray. The scene is unchanged.
    reject() { return returnToTray({ reject: true }); },
    reopen() { held?.tool.setClosed(0); requestDraw(); },
    cancel() { return returnToTray(); },
    syncEffects,
    setGuidance(next) {
      guidance = next;
      for (const entry of tools.values()) if (entry !== held) entry.tool.setTint(GOLD, guidance?.toolId === entry.id ? 0.55 : 0);
      showPreview(near);
    },
    // Reset everything to a stage's start with these effects already applied, without animation.
    async resetTo(effects) {
      if (held) { const entry = held; held = null; placed = null; entry.tool.setTint(NEUTRAL, 0); if (entry.trayPose) placeInTray(entry); }
      follow = false; drag = null; gestureHold = null; controls.enabled = true;
      guidance = null;
      for (const entry of tools.values()) entry.tool.setTint(NEUTRAL, 0);
      showPreview(null);
      await syncEffects(effects, { animate: false });
    },
    resetCamera() { ctx.resetCamera(); },
    get busy() { return busy > 0; },
    // For browser tests: where an action point or tray tool is on screen, in client pixels.
    screenPosition(kind, id) {
      const box = canvas.getBoundingClientRect();
      const toClient = (v, cam) => { const p = v.clone().project(cam); return { x: box.left + (p.x + 1) / 2 * box.width, y: box.top + (1 - p.y) / 2 * box.height }; };
      camera.updateMatrixWorld(true);
      if (kind === 'point') return points.has(id) ? toClient(points.get(id).position, camera) : null;
      const entry = tools.get(id);
      if (!entry?.trayPose) return null;
      trayScene.updateMatrixWorld(true);
      // Aim a little up the shaft from the working point, where the tool is easy to hit.
      const along = new THREE.Vector3(0, 0, 0.9).applyQuaternion(entry.trayPose.quaternion).multiplyScalar(entry.trayPose.scale);
      return toClient(entry.trayPose.position.clone().add(along), trayCamera);
    },
    snapshot: () => ({
      held: held?.id ?? null, placed, near: near?.id ?? null, tray: [...trayIds],
      props: [...props.keys()], cut: cutAmount,
      points: Object.fromEntries([...points].map(([id, point]) => [id, point.position.toArray().map(n => Math.round(n * 100) / 100)])),
    }),
    dispose() {
      disposed = true;
      disposers.forEach(fn => fn());
      for (const prop of props.values()) prop.dispose();
      for (const entry of tools.values()) { entry.tool.dispose(); entry.ghost.dispose(); entry.tool.group.removeFromParent(); entry.ghost.group.removeFromParent(); }
      haloGroup.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
      haloGroup.removeFromParent();
      trayBack.geometry.dispose(); trayBackMaterial.dispose();
    },
  };

  canvas.setAttribute('aria-label', 'Practice model: a generic 3D model of the gallbladder region with a tray of instruments along the bottom. Use the controls next to the model to take an instrument, move it between positions and perform its gesture.');
  canvas.tabIndex = -1;
  return api;
}
