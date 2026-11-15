// Procedural 3D laparoscopic instruments for Practice: grasper, hook, clip applier and scissors.
// Built from three.js primitives so no external asset is needed. Units are centimetres.
//
// Local frame of every tool: the working point (where tissue sits between the jaws, or the hook's
// bend) is at the origin, and the shaft runs along +Z toward the handle. Jaws open in ±Y.

const JAW_LENGTH = 1.1;
const HINGE_Z = JAW_LENGTH / 2;
const SHAFT_RADIUS = 0.22;

const steel = (THREE, color = '#c9d1d3') => new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.32 });

// One jaw: a pivot at the hinge with the blade hanging forward (toward -Z) from it.
function jaw(THREE, { material, width, thickness, taper = 1, ridges = false, side }) {
  const pivot = new THREE.Group();
  pivot.position.set(0, 0, HINGE_Z);
  const shape = new THREE.BoxGeometry(width, thickness, JAW_LENGTH);
  if (taper !== 1) {
    // Narrow the far end so blades read as pointed.
    const position = shape.getAttribute('position');
    for (let i = 0; i < position.count; i += 1) {
      if (position.getZ(i) < 0) { position.setX(i, position.getX(i) * taper); position.setY(i, position.getY(i) * (0.5 + taper / 2)); }
    }
    shape.computeVertexNormals();
  }
  const blade = new THREE.Mesh(shape, material);
  blade.position.set(0, side * thickness / 2, -JAW_LENGTH / 2);
  pivot.add(blade);
  if (ridges) {
    const ridge = new THREE.BoxGeometry(width * 1.04, thickness * 0.5, 0.05);
    for (let i = 0; i < 6; i += 1) {
      const bump = new THREE.Mesh(ridge, material);
      bump.position.set(0, side * -0.01, -0.12 - i * 0.16);
      pivot.add(bump);
    }
  }
  return pivot;
}

// A small titanium clip: a narrow U whose legs run along the jaws.
export function clipMesh(THREE, material = steel(THREE, '#e8ecef')) {
  const group = new THREE.Group();
  const leg = new THREE.BoxGeometry(0.12, 0.05, 0.62);
  const top = new THREE.Mesh(leg, material); top.position.set(0, 0.06, -0.05);
  const bottom = new THREE.Mesh(leg, material); bottom.position.set(0, -0.06, -0.05);
  const bend = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.17, 0.05), material); bend.position.set(0, 0, 0.26);
  group.add(top, bottom, bend);
  group.userData.material = material;
  return group;
}

export function createTool(THREE, kind) {
  const group = new THREE.Group();
  group.name = `tool:${kind}`;
  const metal = steel(THREE);
  const dark = steel(THREE, '#4f5b5e');
  const insulation = new THREE.MeshStandardMaterial({ color: '#1f2a2c', metalness: 0.1, roughness: 0.6 });
  const accent = new THREE.MeshStandardMaterial({ color: { grasper: '#2f6fb3', hook: '#c4532f', clipper: '#5d8f3a', scissors: '#8a5fb8' }[kind] ?? '#777', roughness: 0.5 });
  const materials = [metal, dark, insulation, accent];
  const jaws = [];
  let clip = null;
  let tipGlow = null;

  if (kind === 'hook') {
    // Insulated rod ending in a bare L-shaped wire.
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 12), metal);
    stem.rotation.x = Math.PI / 2; stem.position.z = 0.45;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.42, 12), metal);
    foot.position.set(0, 0.18, 0);
    const bend = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), metal);
    const glowMaterial = new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0 });
    tipGlow = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), glowMaterial);
    tipGlow.position.set(0, 0.2, 0);
    materials.push(glowMaterial);
    group.add(stem, foot, bend, tipGlow);
  } else {
    const spec = {
      grasper: { material: dark, width: 0.2, thickness: 0.09, ridges: true },
      clipper: { material: metal, width: 0.26, thickness: 0.11 },
      scissors: { material: metal, width: 0.12, thickness: 0.05, taper: 0.25 },
    }[kind];
    jaws.push(jaw(THREE, { ...spec, side: 1 }), jaw(THREE, { ...spec, side: -1 }));
    group.add(...jaws);
    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, spec.width + 0.08, 14), metal);
    hinge.rotation.z = Math.PI / 2; hinge.position.z = HINGE_Z;
    group.add(hinge);
    if (kind === 'clipper') { clip = clipMesh(THREE); group.add(clip); materials.push(clip.userData.material); }
  }

  // Shaft: a unit cylinder scaled to the current length.
  const shaftStart = kind === 'hook' ? 0.9 : HINGE_Z + 0.05;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(SHAFT_RADIUS, SHAFT_RADIUS, 1, 18), insulation);
  shaft.rotation.x = Math.PI / 2;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(SHAFT_RADIUS * 1.05, SHAFT_RADIUS * 1.05, 0.12, 18), accent);
  collar.rotation.x = Math.PI / 2;
  collar.position.z = shaftStart + 0.1;
  // Handle: a coloured grip with a finger ring (no ring on the hook, which uses a pencil grip).
  const handle = new THREE.Group();
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.9, 0.36), accent);
  grip.position.set(0, -0.3, 0.1);
  handle.add(grip);
  if (kind !== 'hook') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.07, 10, 24), accent);
    ring.position.set(0, -0.95, 0.15);
    handle.add(ring);
  }
  group.add(shaft, collar, handle);

  let length = 2;
  const api = {
    kind,
    group,
    materials,
    // Shaft length from the working point to the handle.
    setLength(next) {
      length = Math.max(shaftStart + 0.4, next);
      shaft.scale.set(1, length - shaftStart, 1);
      shaft.position.z = (shaftStart + length) / 2;
      handle.position.z = length;
    },
    get length() { return length; },
    // 0 = open, 1 = closed. The hook "activates" instead: its tip glows.
    setClosed(amount) {
      const open = (1 - amount) * (kind === 'scissors' ? 0.42 : 0.32);
      if (jaws.length) { jaws[0].rotation.x = open; jaws[1].rotation.x = -open; }
      if (clip) clip.scale.set(1, 1 - amount * 0.55, 1);
      if (tipGlow) tipGlow.material.opacity = 0.75 * amount;
    },
    setClipLoaded(loaded) { if (clip) clip.visible = loaded; },
    // Emissive tint for "selected" and "rejected" states.
    setTint(color, strength = 0) {
      for (const material of materials) if (material.emissive) material.emissive.set(color).multiplyScalar(strength);
    },
    // Turn the tool into a see-through placement preview.
    makeGhost() {
      for (const material of materials) { material.transparent = true; material.opacity = 0.32; material.depthWrite = false; }
      handle.visible = false; collar.visible = false;
    },
    setGhostColor(color, opacity) {
      for (const material of materials) { if (material.emissive) material.emissive.set(color).multiplyScalar(0.8); material.opacity = opacity; }
    },
    dispose() {
      group.traverse(object => { object.geometry?.dispose(); });
      materials.forEach(material => material.dispose());
    },
  };
  api.setLength(2);
  api.setClosed(0);
  return api;
}

export const TOOL_KINDS = ['grasper', 'hook', 'clipper', 'scissors'];
