// The 3D anatomy view: loads the model, lets the user look around, and draws each step.
// This file pulls in three.js, so it is only loaded (by panel.js) when the panel opens.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import manifest from './manifest.json';
import { STEP_SCENES, FREE_SCENE, VIEWS } from './steps.js';

const MODEL_URL = `${import.meta.env.BASE_URL}${manifest.file}`;
const GHOST = 0.1; // opacity of an organ the user made see-through
const MOVE_MS = 700;
const MIN_DISTANCE = 5;
const MAX_DISTANCE = 150;
// The freed gallbladder is drawn pulled toward the viewer and slightly down (schematic).
const LIFT_DIRECTION = new THREE.Vector3(0.15, -0.55, 0.82).normalize();
const vec = array => new THREE.Vector3(...array);
const anchor = name => vec(manifest.anchors[name]);
const ease = t => 1 - (1 - t) ** 3;

function setOpacity(material, opacity) {
  const transparent = opacity < 0.999;
  // three.js compiles solid and see-through materials differently, so say when it switches.
  if (material.transparent !== transparent) { material.transparent = transparent; material.needsUpdate = true; }
  material.opacity = opacity;
  material.depthWrite = !transparent;
  material.visible = opacity > 0.01;
}

export async function createViewer({ onChange = () => {}, onHover = () => {} } = {}) {
  const element = document.createElement('div');
  element.className = 'anat-canvas';
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); // throws without WebGL
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.localClippingEnabled = true;
  const canvas = renderer.domElement;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', '3D model of the gallbladder and nearby organs. Drag to rotate, scroll to zoom, select an organ to see through it.');
  element.append(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.5, 800);
  scene.add(camera);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x93a8a3, 1.5));
  const lamp = new THREE.DirectionalLight(0xffffff, 1.7);
  lamp.position.set(-0.6, 0.8, 1);
  lamp.target.position.set(0, 0, -1);
  camera.add(lamp, lamp.target); // the light travels with the camera, so the facing side is always lit

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false;
  controls.enableZoom = false; // zoom is handled below so the page can still scroll at the limits
  controls.minDistance = MIN_DISTANCE;
  controls.maxDistance = MAX_DISTANCE;

  let frame = 0;
  let disposed = false;
  let facing = null; // a marker kept turned toward the viewer
  const draw = () => { frame = 0; if (disposed) return; facing?.quaternion.copy(camera.quaternion); renderer.render(scene, camera); };
  const requestDraw = () => { if (!frame && !disposed) frame = requestAnimationFrame(draw); };
  controls.addEventListener('change', requestDraw);

  // --- model ------------------------------------------------------------------

  const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
  const root = gltf.scene;
  scene.add(root);
  const organs = new Map(); // name -> { part, meshes: [Mesh], material }
  const specimen = new THREE.Group(); // the gallbladder and what leaves the body with it
  specimen.name = 'specimen';
  root.add(specimen);

  // A cut is drawn with two copies of the mesh, each clipped on one side of the cut point.
  // `stay` remains in the body; `leave` moves with the gallbladder.
  function cutPlanes(pointOnCut, towardGallbladder) {
    return {
      point: pointOnCut.clone(), normal: towardGallbladder.clone().normalize(),
      stay: new THREE.Plane(), leave: new THREE.Plane(),
    };
  }
  const ductCut = cutPlanes(
    anchor('cysticDuctAtGallbladder').lerp(anchor('cysticDuctAtBileDuct'), 0.5),
    anchor('cysticDuctAtGallbladder').sub(anchor('cysticDuctAtBileDuct')),
  );
  const arteryCut = cutPlanes(anchor('cysticArteryMid'), anchor('cysticArteryEnd').sub(anchor('cysticArteryStart')));
  const cuts = { cystic_duct: ductCut, cystic_artery: arteryCut };

  for (const part of manifest.parts) {
    const source = root.getObjectByName(part.name);
    if (!source?.isMesh) throw new Error(`Model file is missing ${part.name}`);
    const outline = part.group === 'outline';
    const material = new THREE.MeshStandardMaterial({
      color: part.color, roughness: outline ? 1 : 0.62, metalness: 0,
      // The liver is a hollow shell with fine seams between its segments; drawing its inside
      // too keeps the seams from showing the background.
      side: outline || part.name === 'liver' ? THREE.DoubleSide : THREE.FrontSide,
    });
    const entry = { part, material, meshes: [source], materials: [material] };
    source.material = material;
    source.userData.organ = part.name;
    if (outline) source.renderOrder = 5;
    if (part.name === 'gallbladder') specimen.attach(source);
    const cut = cuts[part.name];
    if (cut) {
      const leaving = source.clone();
      leaving.material = material.clone();
      material.clippingPlanes = [cut.stay];
      leaving.material.clippingPlanes = [cut.leave];
      leaving.userData.organ = part.name;
      specimen.add(leaving);
      entry.meshes.push(leaving);
      entry.materials.push(leaving.material);
    }
    organs.set(part.name, entry);
  }

  // --- schematic props ----------------------------------------------------------

  const props = {};
  const propMaterial = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0, transparent: true, ...options });

  // Ports: short cylinders on the front of the body outline.
  props.ports = new THREE.Group();
  const portMaterial = propMaterial('#176f62');
  const bodyAxis = new THREE.Vector3(organs.get('body_outline').part.center[0], 0, organs.get('body_outline').part.center[2]);
  for (const port of manifest.ports) {
    const at = vec(port.at);
    // Ports point mostly forward, leaning a little away from the body's centre line.
    const outward = new THREE.Vector3(at.x - bodyAxis.x, 0, 0).normalize().multiplyScalar(0.35).add(new THREE.Vector3(0, 0, 1)).normalize();
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 4, 20), portMaterial);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), outward);
    mesh.position.copy(at).addScaledVector(outward, 1.2);
    mesh.userData.label = port.name;
    props.ports.add(mesh);
  }
  props.ports.userData.materials = [portMaterial];
  root.add(props.ports);

  // The triangle cleared during dissection: between the cystic duct, the common hepatic
  // duct, and the liver edge above them.
  const ductGeometry = organs.get('hepatic_ducts').meshes[0].geometry.getAttribute('position');
  const junction = anchor('cysticDuctAtBileDuct');
  const upper = new THREE.Vector3();
  const aboveJunction = junction.clone().add(new THREE.Vector3(0, 2.6, 0)); // toward the liver edge
  let nearest = Infinity;
  for (let i = 0; i < ductGeometry.count; i += 1) {
    const candidate = new THREE.Vector3().fromBufferAttribute(ductGeometry, i);
    const d = candidate.distanceTo(aboveJunction);
    if (d < nearest) { nearest = d; upper.copy(candidate); }
  }
  const triangleGeometry = new THREE.BufferGeometry().setFromPoints([anchor('cysticDuctAtGallbladder'), junction, upper]);
  triangleGeometry.computeVertexNormals();
  const triangleMaterial = new THREE.MeshBasicMaterial({ color: '#f4c93a', transparent: true, side: THREE.DoubleSide, depthWrite: false, depthTest: false });
  props.triangle = new THREE.Mesh(triangleGeometry, triangleMaterial);
  props.triangle.renderOrder = 3;
  props.triangle.userData.materials = [triangleMaterial];
  root.add(props.triangle);

  // Clips: thin plates across the duct and the artery, two on the side that stays and one
  // on the side that leaves with the gallbladder.
  const clipMaterial = propMaterial('#f4f7f8', { metalness: 0.1, roughness: 0.35 });
  const clipGeometry = new THREE.BoxGeometry(1, 0.13, 1);
  props.clips = { userData: { materials: [clipMaterial] } };
  const addClips = (cut, width) => {
    for (const offset of [-0.42, -0.24, 0.26]) {
      const clip = new THREE.Mesh(clipGeometry, clipMaterial);
      clip.scale.set(width, 1, width);
      clip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), cut.normal);
      clip.position.copy(cut.point).addScaledVector(cut.normal, offset);
      (offset > 0 ? specimen : root).add(clip);
    }
  };
  addClips(ductCut, 0.85);
  addClips(arteryCut, 0.5);

  // Where the gallbladder was attached to the liver.
  // A flat marker that always faces the viewer (see draw()).
  const bedMaterial = new THREE.MeshBasicMaterial({ color: '#e8873a', transparent: true, depthWrite: false, depthTest: false });
  props.bed = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.6, 40), bedMaterial);
  props.bed.position.copy(anchor('liverBed').lerp(anchor('gallbladderCentre'), 0.45));
  props.bed.renderOrder = 6;
  props.bed.userData.materials = [bedMaterial];
  facing = props.bed;
  root.add(props.bed);

  // Retrieval bag around the gallbladder.
  const bagMaterial = propMaterial('#a9d4ee', { depthWrite: false, roughness: 0.2 });
  props.bag = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), bagMaterial);
  const gallbladderPart = organs.get('gallbladder').part;
  props.bag.position.copy(vec(gallbladderPart.center));
  props.bag.scale.set(...gallbladderPart.size.map(size => size * 0.66));
  props.bag.renderOrder = 4;
  props.bag.userData.materials = [bagMaterial];
  specimen.add(props.bag);

  const navelPort = vec(manifest.ports[0].at);

  // --- drawing a state -------------------------------------------------------------

  const userGhost = new Set();
  let sceneKey = null; // the step being shown, or null for the free view
  let state = null; // numbers currently on screen
  let move = null; // { from, to, start, duration }

  function target(key) {
    const step = STEP_SCENES[key] ?? FREE_SCENE;
    const view = VIEWS[step.view];
    const position = vec(view.target).addScaledVector(vec(view.from).normalize(), view.distance);
    const numbers = {
      outline: step.outline, ports: step.ports, triangle: step.triangle, clips: step.clips, cut: step.cut,
      bed: step.bed, bag: step.bag, lift: step.lift, toPort: step.toPort, specimen: step.specimen,
      cameraX: position.x, cameraY: position.y, cameraZ: position.z,
      targetX: view.target[0], targetY: view.target[1], targetZ: view.target[2],
    };
    for (const [name, { part }] of organs) {
      if (part.group === 'outline') continue;
      numbers[`opacity:${name}`] = userGhost.has(name) ? GHOST : (step.ghost[name] ?? 1);
      numbers[`glow:${name}`] = step.highlight.includes(name) ? 1 : 0;
    }
    return numbers;
  }

  function apply(numbers, { camera: moveCamera = true } = {}) {
    for (const [name, entry] of organs) {
      if (entry.part.group === 'outline') {
        setOpacity(entry.material, numbers.outline);
        entry.material.depthWrite = false;
        continue;
      }
      const inSpecimen = name === 'gallbladder';
      const opacity = numbers[`opacity:${name}`] * (inSpecimen ? numbers.specimen : 1);
      entry.materials.forEach((material, index) => {
        setOpacity(material, opacity * (index === 1 ? numbers.specimen : 1));
        material.emissive.set(entry.part.color).multiplyScalar(0.55 * numbers[`glow:${name}`]);
      });
    }
    // Freed gallbladder: pulled away, then carried toward the navel port.
    const lifted = LIFT_DIRECTION.clone().multiplyScalar(numbers.lift);
    specimen.position.copy(lifted).lerp(navelPort, numbers.toPort);
    specimen.updateMatrixWorld(true);
    // The cut opens a small gap in the duct and the artery.
    for (const cut of Object.values(cuts)) {
      const gap = 0.2 * numbers.cut;
      cut.stay.setFromNormalAndCoplanarPoint(cut.normal.clone().negate(), cut.point.clone().addScaledVector(cut.normal, -gap));
      cut.leave.setFromNormalAndCoplanarPoint(cut.normal, cut.point.clone().addScaledVector(cut.normal, gap)).applyMatrix4(specimen.matrixWorld);
    }
    const fade = (prop, opacity) => prop.userData.materials.forEach(material => setOpacity(material, opacity));
    fade(props.ports, numbers.ports);
    fade(props.triangle, 0.6 * numbers.triangle);
    fade(props.clips, numbers.clips);
    fade(props.bed, 0.9 * numbers.bed);
    fade(props.bag, 0.34 * numbers.bag * numbers.specimen);
    if (moveCamera) {
      camera.position.set(numbers.cameraX, numbers.cameraY, numbers.cameraZ);
      controls.target.set(numbers.targetX, numbers.targetY, numbers.targetZ);
      controls.update();
    }
    requestDraw();
  }

  function tick(now) {
    if (!move || disposed) return;
    const t = Math.min(1, (now - move.start) / move.duration);
    const k = ease(t);
    const mixed = {};
    for (const key of Object.keys(move.to)) mixed[key] = move.from[key] + (move.to[key] - move.from[key]) * k;
    state = mixed;
    apply(state, { camera: move.camera });
    if (t < 1) requestAnimationFrame(tick); else move = null;
  }

  // Go to the picture for `key`. `camera: false` keeps the user's current viewpoint.
  function show(key, { animate = true, camera: moveCamera = true } = {}) {
    sceneKey = key ?? null;
    const to = target(sceneKey);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!state || !animate || reduced) {
      if (state && !moveCamera) for (const key of Object.keys(to)) if (/^(camera|target)[XYZ]$/.test(key)) to[key] = state[key];
      move = null; state = to; apply(state, { camera: moveCamera });
      return;
    }
    // Start from what is on screen, including wherever the user has moved the camera.
    const from = { ...state, cameraX: camera.position.x, cameraY: camera.position.y, cameraZ: camera.position.z, targetX: controls.target.x, targetY: controls.target.y, targetZ: controls.target.z };
    move = { from, to, start: performance.now(), duration: MOVE_MS, camera: moveCamera };
    requestAnimationFrame(tick);
  }

  // --- pointer: select an organ to see through it ------------------------------------

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const solidOrgans = () => [...organs.values()]
    .filter(entry => entry.part.group !== 'outline')
    .flatMap(entry => entry.meshes.filter(mesh => mesh.material.opacity > 0.6));
  function organAt(event) {
    const box = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(solidOrgans(), false)[0]?.object.userData.organ ?? null;
  }
  let pressed = null;
  canvas.addEventListener('pointerdown', event => { pressed = { x: event.clientX, y: event.clientY }; });
  canvas.addEventListener('pointerup', event => {
    if (!pressed || Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 5) { pressed = null; return; }
    pressed = null;
    const name = organAt(event);
    if (name) api.toggleGhost(name);
  });
  let hoverFrame = 0;
  canvas.addEventListener('pointermove', event => {
    if (hoverFrame || event.buttons) return;
    hoverFrame = requestAnimationFrame(() => {
      hoverFrame = 0;
      const name = organAt(event);
      canvas.style.cursor = name ? 'pointer' : 'grab';
      onHover(name ? organs.get(name).part.label : '');
    });
  });
  canvas.addEventListener('pointerleave', () => onHover(''));

  function zoom(factor) {
    const offset = camera.position.clone().sub(controls.target);
    const distance = offset.length();
    const next = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, distance * factor));
    if (Math.abs(next - distance) < 1e-3) return false;
    camera.position.copy(controls.target).addScaledVector(offset.normalize(), next);
    controls.update();
    return true;
  }
  // Scrolling over the model zooms. At either limit the page scrolls as usual.
  canvas.addEventListener('wheel', event => {
    if (zoom(Math.exp(event.deltaY * 0.0013))) event.preventDefault();
  }, { passive: false });

  const observer = new ResizeObserver(() => {
    const width = element.clientWidth, height = element.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    requestDraw();
  });
  observer.observe(element);

  const api = {
    element,
    parts: manifest.parts.filter(part => part.group !== 'outline').map(({ name, label, group, color }) => ({ name, label, group, color })),
    get step() { return sceneKey; },
    setStep(key, options) { if (key !== sceneKey || !state) show(key, options); },
    ghosted: () => [...userGhost],
    toggleGhost(name) {
      if (!organs.has(name)) return;
      if (userGhost.has(name)) userGhost.delete(name); else userGhost.add(name);
      show(sceneKey, { camera: false });
      onChange();
    },
    showAll() { userGhost.clear(); show(sceneKey, { camera: false }); onChange(); },
    resetView() { show(sceneKey); },
    zoom(factor) { zoom(factor); },
    // For tests and debugging: what is on screen right now.
    snapshot: () => ({ step: sceneKey, ghosted: [...userGhost], state: { ...state }, camera: camera.position.toArray(), specimen: specimen.position.toArray() }),
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      scene.traverse(object => { object.geometry?.dispose(); [].concat(object.material ?? []).forEach(material => material.dispose()); });
      renderer.dispose();
      element.remove();
    },
  };
  show(null, { animate: false });
  return api;
}
