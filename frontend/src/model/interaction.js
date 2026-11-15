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
    points.set(authored.id, { id: authored.id, label: authored.label, position, axis, pathOnly: Boolean(authored.path_only) });
  }
  // Path points (the dissection line) are not places a tool can be put down on their own.
  const snapPoints = () => [...points.values()].filter(point => !point.pathOnly);
  const pointOrder = snapPoints().map(point => point.id);
  const ports = new Map(manifest.ports.map(port => [port.name, vec(port.at)]));
  // A gallbladder-side prop (the grasper on the neck, the clip on the gallbladder side of the duct)
  // travels with the gallbladder when it is freed and removed.
  const gbEnd = anchorAt('cysticDuctAtGallbladder'), bdEnd = anchorAt('cysticDuctAtBileDuct');
  const onGallbladderSide = point => point.position.distanceTo(gbEnd) < point.position.distanceTo(bdEnd) || point.id.startsWith('gb_');

  // --- mode and the current stage's hard-mode rules ---------------------------------------
  let mode = 'easy';
  let rules = {}; // the stage's `hard` block in hard mode, {} otherwise
  let roll = 0; // hard mode: jaw roll (degrees) of the placed tool, 0 = crossing the structure
  let trace = null; // hard mode dissection: { progress, pointerId|null }
  let carrying = false; // hard mode removal: dragging the grasped gallbladder to a port
  let introSkip = false;

  // A faint gold line along the structure while the jaws are being aimed (hard mode).
  const guideMaterial = new THREE.LineBasicMaterial({ color: '#f2b705', transparent: true, opacity: 0.85, depthTest: false });
  const guide = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), guideMaterial);
  guide.renderOrder = 9;
  guide.visible = false;
  root.add(guide);
  // The dissection line (hard mode): faint, with the traced part drawn darker as it is burned through.
  const pathLineMaterial = new THREE.LineDashedMaterial({ color: '#fff3c4', dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: 0.8, depthTest: false });
  const pathLine = new THREE.Line(new THREE.BufferGeometry(), pathLineMaterial);
  const burnMaterial = new THREE.LineBasicMaterial({ color: '#3a1d12', transparent: true, opacity: 0.95, depthTest: false });
  const burnLine = new THREE.Line(new THREE.BufferGeometry(), burnMaterial);
  pathLine.renderOrder = 9; burnLine.renderOrder = 10;
  pathLine.visible = false; burnLine.visible = false;
  root.add(pathLine, burnLine);
  let path = null; // { points: [Vector3], lengths: [cumulative], total }
  function buildPath(ids) {
    const list = ids.map(id => points.get(id).position.clone());
    const lengths = [0];
    for (let i = 1; i < list.length; i += 1) lengths.push(lengths[i - 1] + list[i].distanceTo(list[i - 1]));
    return { points: list, lengths, total: lengths.at(-1) };
  }
  const pathAt = s => {
    const target = Math.max(0, Math.min(1, s)) * path.total;
    let i = 1;
    while (i < path.lengths.length - 1 && path.lengths[i] < target) i += 1;
    const span = path.lengths[i] - path.lengths[i - 1] || 1;
    return path.points[i - 1].clone().lerp(path.points[i], (target - path.lengths[i - 1]) / span);
  };
  function drawBurn() {
    if (!path || !trace) { burnLine.visible = false; return; }
    const samples = [];
    for (let k = 0; k <= 40; k += 1) { const s = (k / 40) * trace.progress; samples.push(pathAt(s)); }
    burnLine.geometry.setFromPoints(samples);
    burnLine.visible = trace.progress > 0;
  }

  // Ports glow while the gallbladder is being carried out (hard mode).
  const portRings = new Map();
  for (const [name, at] of ports) {
    const material = new THREE.MeshBasicMaterial({ color: NEUTRAL, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.6, 40), material);
    ring.position.copy(at);
    ring.renderOrder = 9;
    ring.visible = false;
    root.add(ring);
    portRings.set(name, ring);
  }

  // --- the operating room (hard mode opening shot) --------------------------------------------
  // Built in the anatomy's own coordinates: the patient lies face up, so "up" in the room is +z
  // (the front of the body) and the table is under the back. The anatomy never moves.
  const room = new THREE.Group();
  room.visible = false;
  {
    const body = organs.get('body_outline').part;
    const back = body.center[2] - body.size[2] / 2; // z of the patient's back
    const headY = body.center[1] + body.size[1] / 2, feetY = body.center[1] - body.size[1] / 2;
    const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, ...extra });
    const table = new THREE.Mesh(new THREE.BoxGeometry(58, headY - feetY + 24, 5), mat('#3b4a4f', { metalness: 0.35, roughness: 0.4 }));
    table.position.set(body.center[0], (headY + feetY) / 2, back - 2.6);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(54, headY - feetY + 18, 3), mat('#1f2c33'));
    pad.position.set(body.center[0], (headY + feetY) / 2, back - 0.6);
    const base = new THREE.Mesh(new THREE.BoxGeometry(22, 40, 72), mat('#56656a', { metalness: 0.4, roughness: 0.45 }));
    base.position.set(body.center[0], (headY + feetY) / 2, back - 41);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), mat('#c9d4d2'));
    floor.position.set(body.center[0], body.center[1], back - 77);
    // Drapes over the chest and the legs, leaving the abdomen open around the ports. Each lies just
    // above the highest point of the body in its region (measured from the body model itself).
    const bodyVertices = worldVertices('body_outline');
    const drape = (fromY, toY) => {
      const low = Math.min(fromY, toY), high = Math.max(fromY, toY);
      const top = bodyVertices.reduce((max, v) => (v.y >= low && v.y <= high && Math.abs(v.x - body.center[0]) < 22 ? Math.max(max, v.z) : max), back + 10);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(66, high - low, 1.2), mat('#2c7f8c', { roughness: 0.9 }));
      mesh.position.set(body.center[0], (low + high) / 2, top + 0.8);
      return mesh;
    };
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(22, 26, 6, 40), mat('#eef3f2', { emissive: '#ffffff', emissiveIntensity: 0.6 }));
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(body.center[0] + 10, -2, 150);
    room.add(table, pad, base, floor, drape(10, headY + 4), drape(feetY - 4, -22), lamp);
  }
  root.add(room);

  // --- halos: faint rings at every action point while a tool is held ---------------------

  const haloGroup = new THREE.Group();
  root.add(haloGroup);
  const halos = new Map();
  for (const point of snapPoints()) {
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
  // The pose turned by the current jaw roll around the tool's own axis.
  const ROLL_AXIS = new THREE.Vector3(0, 0, 1);
  function rolled(pose) {
    if (!roll) return pose;
    return { ...pose, quaternion: pose.quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(ROLL_AXIS, (roll * Math.PI) / 180)) };
  }
  // How far the jaws are from crossing the structure at a right angle, 0 to 90 degrees.
  // The jaws are symmetric, so 180 degrees of roll looks the same.
  const angleError = () => { const r = ((roll % 180) + 180) % 180; return Math.min(r, 180 - r); };
  const aiming = () => Boolean(placed && rules.jaw_tolerance_deg != null && points.get(placed)?.axis);
  function applyRoll() {
    if (!held || !placed) return;
    const point = points.get(placed);
    setPose(held, rolled(poseAt(point.position, point.axis)));
    requestDraw();
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
  // The solid structure under the pointer, if any. Organs faded to see through (the liver in this
  // view) do not count: what looks solid is what a tool can touch.
  function tissueAt(event) {
    setPointer(event);
    raycaster.setFromCamera(pointer, camera);
    const meshes = [...organs.values()]
      .filter(entry => entry.part.group !== 'outline')
      .flatMap(entry => entry.meshes.filter(mesh => mesh.material.visible && mesh.material.opacity > 0.3));
    const name = raycaster.intersectObjects(meshes, false)[0]?.object.userData.organ;
    return name ? { organ: name, label: organs.get(name).part.label } : null;
  }
  // A tool let go away from any target: on the tray or in empty space it simply goes back; on
  // tissue it is reported as a contact (the workspace decides: easy returns it, hard fails).
  function releaseAway(event) {
    const tissue = trayToolAt(event) ? null : tissueAt(event);
    if (tissue) onEvent({ type: 'contact', ...tissue });
    else onEvent({ type: 'request-cancel' });
  }

  // Nearest action point to the pointer ray, in centimetres from the ray.
  function nearestPoint() {
    let best = null;
    for (const point of snapPoints()) {
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
    // Hard mode, removal: drag the grasped gallbladder toward a port.
    if (carrying && !fromTray) {
      controls.enabled = false;
      canvas.setPointerCapture?.(event.pointerId);
      drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false, carry: true };
      carryMove(event);
      event.stopPropagation();
      return;
    }
    // Hard mode, dissection: press on the hook to switch it on, then drag along the line.
    if (placed && trace && heldToolHit(event)) {
      controls.enabled = false;
      canvas.setPointerCapture?.(event.pointerId);
      trace.pointerId = event.pointerId;
      held.tool.setClosed(1); // the hook's tip glows while it is on
      requestDraw();
      event.stopPropagation();
      return;
    }
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
    if (trace?.pointerId === event.pointerId) { traceMove(event); return; }
    if (drag?.carry && event.pointerId === drag.pointerId) { carryMove(event); return; }
    if (!held || placed || busy) return;
    if (drag && event.pointerId === drag.pointerId) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > TAP_PX) drag.moved = true;
      followPointer(event);
    } else if (follow && !event.buttons) followPointer(event);
  });

  function endPointer(event, cancelled = false) {
    if (trace?.pointerId === event.pointerId) {
      // Letting go switches the hook off; the traced part stays and the next press continues it.
      trace.pointerId = null;
      controls.enabled = true;
      held?.tool.setClosed(0);
      requestDraw();
      return;
    }
    if (drag?.carry && event.pointerId === drag.pointerId) {
      drag = null;
      controls.enabled = true;
      const port = carryPort;
      carryPort = null;
      if (port && !cancelled) { onEvent({ type: 'deliver', port }); return; }
      // Let go away from a port: nothing happens; the grasper goes back to the gallbladder.
      settleCarry();
      return;
    }
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
    // Tapped or released off-target: back to the tray, or a contact if it landed on tissue.
    follow = false;
    releaseAway(event);
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
    onEvent({ type: 'gesture', complete: true, angleDeg: angleError() });
  }

  // --- hard mode: dissection trace -------------------------------------------------------------

  // Where along the dissection line the pointer is (0 to 1), and how far from it in centimetres.
  function nearestOnPath() {
    let best = { distance: Infinity, s: 0 };
    for (let k = 0; k <= 120; k += 1) {
      const s = k / 120;
      const distance = raycaster.ray.distanceToPoint(pathAt(s));
      if (distance < best.distance) best = { distance, s };
    }
    return best;
  }
  function traceMove(event) {
    if (!held || !trace || !path) return;
    setPointer(event);
    raycaster.setFromCamera(pointer, camera);
    const { distance, s } = nearestOnPath();
    if (distance > rules.path_tolerance_cm) { endTrace(); onEvent({ type: 'stray' }); return; }
    if (s > trace.progress + 0.2) return; // no jumping ahead: work along the line
    advanceTrace(s);
  }
  function advanceTrace(s) {
    trace.progress = Math.max(trace.progress, Math.min(1, s));
    setPose(held, poseAt(pathAt(trace.progress)));
    drawBurn();
    onEvent({ type: 'gesture-progress', value: trace.progress });
    requestDraw();
    if (trace.progress >= 0.97) { endTrace(); onEvent({ type: 'gesture', complete: true, pathDone: true }); }
  }
  function endTrace() {
    if (trace) trace.pointerId = null;
    controls.enabled = true;
    held?.tool.setClosed(0);
  }

  // --- hard mode: carrying the gallbladder to a port -----------------------------------------------

  let carryPort = null; // the port the pointer is over while carrying
  function carryMove(event) {
    if (!held) return;
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > TAP_PX) drag.moved = true;
    setPointer(event);
    raycaster.setFromCamera(pointer, camera);
    // The grasper's tip follows the pointer across the abdomen.
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), ctx.viewTarget());
    const tip = raycaster.ray.intersectPlane(plane, new THREE.Vector3()) ?? ctx.viewTarget();
    setPose(held, poseAt(tip));
    // A port within 60 px of the pointer is ready to take it.
    const box = canvas.getBoundingClientRect();
    carryPort = null;
    let best = 60;
    for (const [name, at] of ports) {
      const p = at.clone().project(camera);
      const d = Math.hypot(box.left + (p.x + 1) / 2 * box.width - event.clientX, box.top + (1 - p.y) / 2 * box.height - event.clientY);
      if (d < best) { best = d; carryPort = name; }
    }
    for (const [name, ring] of portRings) {
      ring.material.color.set(name === carryPort ? TEAL : NEUTRAL);
      ring.material.opacity = name === carryPort ? 0.95 : 0.55;
      ring.scale.setScalar(name === carryPort ? 1.25 : 1);
    }
    onEvent({ type: 'near', pointId: null, label: carryPort ?? '', ready: Boolean(carryPort) });
    requestDraw();
  }
  function settleCarry() {
    if (!held || !placed) return;
    const point = points.get(placed);
    setPose(held, poseAt(point.position, point.axis));
    for (const ring of portRings.values()) { ring.material.color.set(NEUTRAL); ring.material.opacity = 0.55; ring.scale.setScalar(1); }
    requestDraw();
  }

  // Hard mode, aiming: the scroll wheel turns the placed jaws (instead of zooming).
  listen(element, 'wheel', event => {
    if (!aiming() || busy) return;
    event.preventDefault();
    event.stopPropagation();
    roll += Math.sign(event.deltaY) * 6;
    applyRoll();
  }, { capture: true, passive: false });

  ctx.setHoverHook(event => {
    if (gestureHold || drag || trace?.pointerId != null) return { cursor: 'grabbing', label: '' };
    if (carrying) return { cursor: 'grab', label: 'Drag it out through a port' };
    if (placed && heldToolHit(event)) {
      const hint = trace ? 'Press and hold to switch the hook on, then drag along the line' : aiming() ? 'Scroll to turn the jaws, then press and hold' : `Press and hold: ${held.gestureLabel.toLowerCase()}`;
      return { cursor: 'pointer', label: hint };
    }
    const entry = trayToolAt(event);
    if (entry) {
      onEvent({ type: 'focus-tool', toolId: entry.id });
      return { cursor: 'grab', label: entry.label };
    }
    // Hard mode names no structures: identifying the anatomy is part of the test.
    if (held && !placed) return { cursor: 'grabbing', label: mode === 'hard' ? '' : near ? points.get(near.id).label : '' };
    if (mode === 'hard') return { cursor: 'grab', label: '' };
    return null;
  });

  // --- props from accepted actions ------------------------------------------------------------

  const props = new Map(); // stageId -> { object, type, dispose }
  let cutAmount = 0;
  // Props on the gallbladder's side ride in the viewer's specimen group, which carries the freed
  // gallbladder away. The group is at rest (no lift) whenever props are made, so its local
  // coordinates are the model's.
  const holder = point => (onGallbladderSide(point) && ctx.specimen) || root;
  function makeProp(effect) {
    const point = points.get(effect.pointId);
    const pose = poseAt(point.position, point.axis);
    if (effect.type === 'clip') {
      const clip = clipMesh(THREE);
      clip.position.copy(pose.position);
      clip.quaternion.copy(pose.quaternion);
      clip.scale.set(1, 0.45, 1);
      holder(point).add(clip);
      return { object: clip, type: 'clip', dispose: () => { clip.traverse(o => o.geometry?.dispose()); clip.userData.material.dispose(); clip.removeFromParent(); } };
    }
    if (effect.type === 'hold') {
      const entry = tools.get(effect.toolId);
      const copy = createTool(THREE, entry.tool.kind);
      copy.group.position.copy(pose.position);
      copy.group.quaternion.copy(pose.quaternion);
      copy.setLength(pose.length);
      copy.setClosed(1);
      holder(point).add(copy.group);
      return { object: copy.group, type: 'hold', dispose: () => { copy.dispose(); copy.group.removeFromParent(); } };
    }
    return { object: null, type: effect.type, dispose: () => {} };
  }
  // Scene values for freeing and removing the gallbladder; the viewer already animates these
  // (they are the study model's dissection, packaging and removal pictures).
  // (The study's orange "attachment" ring is left off: it is sized for the study's far camera.)
  function removalScene(effects) {
    if (effects.some(effect => effect.type === 'extract')) return { bed: 0, bag: 1, lift: 3.4, toPort: 0.92, specimen: 0.8 };
    if (effects.some(effect => effect.type === 'detach')) return { bed: 0, bag: 0, lift: 2.2, toPort: 0, specimen: 1 };
    return { bed: 0, bag: 0, lift: 0, toPort: 0, specimen: 1 };
  }
  let removal = removalScene([]);
  // Make the scene show exactly these accepted effects (used after accept, reset and restart).
  async function syncEffects(effects, { animate: animated = true } = {}) {
    const wanted = new Map(effects.map(effect => [effect.stageId, effect]));
    for (const [stageId, prop] of props) if (!wanted.has(stageId)) { prop.dispose(); props.delete(stageId); }
    // Props are made at rest, before the gallbladder moves.
    const nextRemoval = removalScene(effects);
    if (JSON.stringify(nextRemoval) !== JSON.stringify(removal) && nextRemoval.lift < removal.lift) { removal = nextRemoval; ctx.setScene(removal, { animate: false }); }
    for (const effect of effects) if (!props.has(effect.stageId) && !['cut', 'detach', 'extract'].includes(effect.type)) props.set(effect.stageId, makeProp(effect));
    // Once it is out, the grasper that held the neck has let go.
    const out = effects.some(effect => effect.type === 'extract');
    for (const prop of props.values()) if (prop.type === 'hold' && prop.object) prop.object.visible = !out;
    if (JSON.stringify(nextRemoval) !== JSON.stringify(removal)) {
      removal = nextRemoval;
      ctx.setScene(removal, { animate: animated });
      if (animated && !ctx.reducedMotion()) await new Promise(resolve => setTimeout(resolve, 750));
    }
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

  // Hard-mode helpers for the current attempt: the aim guide, the dissection line, the port halos.
  function clearAttempt() {
    roll = 0;
    trace = null;
    carrying = false;
    carryPort = null;
    guide.visible = false;
    pathLine.visible = false;
    burnLine.visible = false;
    for (const ring of portRings.values()) ring.visible = false;
  }

  async function returnToTray({ reject = false } = {}) {
    if (carrying) trayScene.visible = true;
    clearAttempt();
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

  // The inside (camera) view for this mode, and a wide view that shows all four ports.
  const easyView = exercise.scene.view;
  const hardView = exercise.scene.hard_view ?? exercise.scene.view;
  const PORTS_VIEW = { target: [0.5, -2, 0], from: [0.12, -0.1, 1], distance: 46 };
  let insideView = easyView;

  const api = {
    // Easy keeps the original look; hard uses the laparoscope view and a darker instrument stand.
    setMode(next) {
      mode = next === 'hard' ? 'hard' : 'easy';
      insideView = mode === 'hard' ? hardView : easyView;
      trayBackMaterial.color.set(mode === 'hard' ? '#26302f' : '#ffffff');
      trayBackMaterial.opacity = mode === 'hard' ? 0.55 : 0.72;
      ctx.setScene({ view: insideView, outline: mode === 'hard' ? 0 : 0.1 }, { animate: false, camera: true });
      requestDraw();
    },
    get mode() { return mode; },
    // Configure the tray and constraints for one stage.
    setStage(stage) {
      rules = mode === 'hard' ? stage.hard ?? {} : {};
      clearAttempt();
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
      // Hard mode, aiming: the jaws start turned away, so the resident must line them up.
      if (aiming()) roll = 55;
      const goal = rolled(poseAt(point.position, point.axis));
      const from = { position: held.tool.group.position.clone(), quaternion: held.tool.group.quaternion.clone(), length: held.tool.length };
      for (const entry of tools.values()) entry.ghost.group.visible = false;
      const entry = held;
      await animate(SETTLE_MS, k => {
        entry.tool.group.position.lerpVectors(from.position, goal.position, k);
        entry.tool.group.quaternion.slerpQuaternions(from.quaternion, goal.quaternion, k);
        entry.tool.setLength(from.length + (goal.length - from.length) * k);
      });
      if (aiming()) {
        // A gold line along the structure shows which way it runs.
        guide.geometry.setFromPoints([point.position.clone().addScaledVector(point.axis, -0.8), point.position.clone().addScaledVector(point.axis, 0.8)]);
        guide.visible = true;
      }
      if (rules.path && pointId === rules.path[0]) {
        // Hard mode, dissection: show the line to follow; the hook burns along it as it moves.
        path = buildPath(rules.path);
        const samples = [];
        for (let k = 0; k <= 60; k += 1) samples.push(pathAt(k / 60));
        pathLine.geometry.setFromPoints(samples);
        pathLine.computeLineDistances();
        pathLine.visible = true;
        trace = { progress: 0, pointerId: null };
        drawBurn();
      }
      showPreview({ id: pointId, distance: 0, ready: true });
      requestDraw();
    },
    // Hard mode, aiming from the keyboard (Q / E).
    rotateJaws(degrees) {
      if (!aiming() || busy) return null;
      roll += degrees;
      applyRoll();
      return angleError();
    },
    // Hard mode, dissection from the keyboard: each press burns a little further along the line.
    traceStep() {
      if (!placed || !trace || busy) return null;
      advanceTrace(trace.progress + 0.2);
      return trace?.progress ?? 1;
    },
    get tracing() { return Boolean(trace); },
    get portNames() { return [...ports.keys()]; },
    get aiming() { return aiming(); },
    // Button or keyboard: animate the gesture, then report it as complete.
    async runGesture() {
      if (!held || !placed || busy) return;
      if (trace) { api.traceStep(); return; }
      const entry = held;
      await animate(GESTURE_MS, k => entry.tool.setClosed(k));
      onEvent({ type: 'gesture', complete: true, angleDeg: angleError() });
    },
    // Hard mode, removal: the gallbladder is grasped; pull back so all four ports are on view.
    startCarry() {
      carrying = true;
      guide.visible = false;
      trayScene.visible = false; // no instruments are needed; one port sits where the tray would be
      for (const ring of portRings.values()) { ring.visible = true; ring.material.opacity = 0.55; ring.material.color.set(NEUTRAL); ring.scale.setScalar(1); }
      ctx.setScene({ view: PORTS_VIEW, outline: 0.22 }, { animate: true, camera: true });
      requestDraw();
    },
    // Back to the inside view (after a removal attempt, or when a stage starts again).
    endCarry() {
      carrying = false;
      trayScene.visible = true;
      for (const ring of portRings.values()) ring.visible = false;
      ctx.setScene({ view: insideView, outline: mode === 'hard' ? 0 : 0.1 }, { animate: true, camera: true });
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
      clearAttempt();
      if (held) { const entry = held; held = null; placed = null; entry.tool.setTint(NEUTRAL, 0); if (entry.trayPose) placeInTray(entry); }
      follow = false; drag = null; gestureHold = null; controls.enabled = true;
      guidance = null;
      for (const entry of tools.values()) entry.tool.setTint(NEUTRAL, 0);
      showPreview(null);
      await syncEffects(effects, { animate: false });
    },
    // Hard mode opening shot: the patient on the table seen from the surgeon's side, then the camera
    // goes in through the navel port to the inside view. Skippable; instant with reduced motion.
    async playIntro() {
      if (mode !== 'hard') return;
      introSkip = false;
      busy += 1;
      room.visible = true;
      trayScene.visible = false;
      haloGroup.visible = false;
      controls.enabled = false;
      // The body outline drawn as the patient, with the four ports in place.
      ctx.setScene({ outline: 0.62, ports: 1 }, { animate: false, camera: false });
      const navel = ports.get('Camera port (navel)') ?? ctx.viewTarget();
      const inside = { target: vec(hardView.target), up: new THREE.Vector3(0, 1, 0) };
      inside.position = inside.target.clone().addScaledVector(vec(hardView.from).normalize(), hardView.distance);
      const shots = [
        // Standing at the patient's left (patient's right is -x), at eye height, looking down at the
        // draped patient on the table: the abdomen and its ports in the middle of the picture.
        { position: new THREE.Vector3(128, -30, 118), target: new THREE.Vector3(2, -12, -2), up: new THREE.Vector3(0, 0, 1) },
        // Just outside the navel port.
        { position: navel.clone().add(new THREE.Vector3(0, -6, 20)), target: navel.clone(), up: new THREE.Vector3(0, 1, 0) },
        inside,
      ];
      const put = shot => { camera.up.copy(shot.up); camera.position.copy(shot.position); camera.lookAt(shot.target); controls.target.copy(shot.target); requestDraw(); };
      const tween = (from, to, ms) => new Promise(resolve => {
        const start = performance.now();
        const step = now => {
          const t = introSkip || ctx.reducedMotion() ? 1 : Math.min(1, (now - start) / ms);
          const k = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
          put({ position: from.position.clone().lerp(to.position, k), target: from.target.clone().lerp(to.target, k), up: from.up.clone().lerp(to.up, k).normalize() });
          if (t < 1 && !disposed) requestAnimationFrame(step); else resolve();
        };
        requestAnimationFrame(step);
      });
      const pause = ms => new Promise(resolve => { const end = performance.now() + ms; const tick = () => (introSkip || ctx.reducedMotion() || performance.now() >= end || disposed ? resolve() : requestAnimationFrame(tick)); tick(); });
      put(shots[0]);
      onEvent({ type: 'intro', phase: 'room' });
      await pause(1300);
      await tween(shots[0], shots[1], 1100);
      // Through the port: the room and the body wall drop away.
      room.visible = false;
      ctx.setScene({ outline: 0, ports: 0 }, { animate: false, camera: false });
      onEvent({ type: 'intro', phase: 'inside' });
      await tween(shots[1], shots[2], 900);
      camera.up.set(0, 1, 0);
      ctx.setScene({ view: hardView, outline: 0 }, { animate: false, camera: true });
      trayScene.visible = true;
      haloGroup.visible = true;
      controls.enabled = true;
      busy -= 1;
      onEvent({ type: 'intro', phase: 'done' });
      requestDraw();
    },
    skipIntro() { introSkip = true; },
    resetCamera() { ctx.resetCamera(); },
    get busy() { return busy > 0; },
    // For browser tests: where an action point or tray tool is on screen, in client pixels.
    screenPosition(kind, id) {
      const box = canvas.getBoundingClientRect();
      const toClient = (v, cam) => { const p = v.clone().project(cam); return { x: box.left + (p.x + 1) / 2 * box.width, y: box.top + (1 - p.y) / 2 * box.height }; };
      camera.updateMatrixWorld(true);
      if (kind === 'point') return points.has(id) ? toClient(points.get(id).position, camera) : null;
      if (kind === 'port') return ports.has(id) ? toClient(ports.get(id), camera) : null;
      // A point along the hard-mode dissection line (id = 0 to 1), or along a given path of point ids.
      if (kind === 'path') return path ? toClient(pathAt(Number(id)), camera) : null;
      const entry = tools.get(id);
      if (!entry?.trayPose) return null;
      trayScene.updateMatrixWorld(true);
      // Aim a little up the shaft from the working point, where the tool is easy to hit.
      const along = new THREE.Vector3(0, 0, 0.9).applyQuaternion(entry.trayPose.quaternion).multiplyScalar(entry.trayPose.scale);
      return toClient(entry.trayPose.position.clone().add(along), trayCamera);
    },
    // For browser tests: the structure under a client point, and its distance (cm) to the nearest target.
    probe(clientX, clientY) {
      const tissue = tissueAt({ clientX, clientY });
      return { organ: tissue?.organ ?? null, nearest: nearestPoint()?.distance ?? null };
    },
    snapshot: () => ({
      held: held?.id ?? null, placed, near: near?.id ?? null, tray: [...trayIds],
      props: [...props.keys()], cut: cutAmount,
      mode, roll, angle: angleError(), aiming: aiming(), trace: trace ? trace.progress : null, carrying,
      room: room.visible, removal: { ...removal }, cameraUp: camera.up.toArray(),
      points: Object.fromEntries([...points].map(([id, point]) => [id, point.position.toArray().map(n => Math.round(n * 100) / 100)])),
    }),
    dispose() {
      disposed = true;
      disposers.forEach(fn => fn());
      for (const prop of props.values()) prop.dispose();
      for (const entry of tools.values()) { entry.tool.dispose(); entry.ghost.dispose(); entry.tool.group.removeFromParent(); entry.ghost.group.removeFromParent(); }
      haloGroup.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
      haloGroup.removeFromParent();
      for (const object of [guide, pathLine, burnLine, room, ...portRings.values()]) {
        object.traverse(child => { child.geometry?.dispose(); [].concat(child.material ?? []).forEach(material => material.dispose()); });
        object.removeFromParent();
      }
      camera.up.set(0, 1, 0);
      trayBack.geometry.dispose(); trayBackMaterial.dispose();
    },
  };

  canvas.setAttribute('aria-label', 'Practice model: a generic 3D model of the gallbladder region with a tray of instruments along the bottom. Drag an instrument onto the model, release it on a spot and press and hold it to use it. With the model focused, keys 1 to 4 pick up an instrument.');
  canvas.tabIndex = -1;
  return api;
}
