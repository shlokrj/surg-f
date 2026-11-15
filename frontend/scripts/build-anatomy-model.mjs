// Builds the 3D anatomy file for the /model view from BodyParts3D meshes.
//
// Source: BodyParts3D, (c) The Database Center for Life Science, licensed under CC Attribution
// 4.0 International (README dated 2025-02-25). Download and unzip, outside the repository:
//   https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/isa_BP3D_4.0_obj_99.zip
//
// Usage (from frontend/):
//   node scripts/build-anatomy-model.mjs <folder containing FJ####.obj files>
//
// Output: public/models/gallbladder-region.glb and src/model/manifest.json.
// Coordinates: BodyParts3D is in millimetres with z up and the front of the body at negative y.
// The output is in centimetres, y up, front of the body toward +z, with the gallbladder's
// centre at the origin. The patient's right is at negative x.

import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { MeshoptSimplifier } from 'meshoptimizer';

const here = dirname(fileURLToPath(import.meta.url));
const sourceDir = process.argv[2];
if (!sourceDir) {
  console.error('Usage: node scripts/build-anatomy-model.mjs <folder containing FJ####.obj files>');
  process.exit(1);
}
const OUT_GLB = resolve(here, '../public/models/gallbladder-region.glb');
const OUT_MANIFEST = resolve(here, '../src/model/manifest.json');

// One entry per structure in the model. `files` are BodyParts3D element file IDs.
// `triangles` is the target after simplifying; null keeps the source mesh.
// group "surgery": the structures the operation works on. "nearby": neighbouring organs.
// "outline": the simple see-through body shape, for orientation only.
const PARTS = [
  { name: 'gallbladder', label: 'Gallbladder', group: 'surgery', color: '#5c9a63', files: ['FJ2817'], triangles: null },
  { name: 'cystic_duct', label: 'Cystic duct', group: 'surgery', color: '#8fbf6a', files: ['FJ3080'], triangles: null },
  { name: 'bile_duct', label: 'Common hepatic and bile duct', group: 'surgery', color: '#7fae58', files: ['FJ3079'], triangles: null },
  { name: 'hepatic_ducts', label: 'Right and left hepatic ducts', group: 'surgery', color: '#7fae58', files: ['FJ3123', 'FJ3096'], triangles: null },
  { name: 'hepatic_artery', label: 'Hepatic arteries', group: 'surgery', color: '#c2453a', files: ['FJ3078', 'FJ3081', 'FJ3117', 'FJ3095'], triangles: null },
  { name: 'portal_vein', label: 'Portal vein', group: 'surgery', color: '#4a74b8', files: ['FJ1853'], triangles: null },
  // The liver is nine separate segment meshes in the source (segments II to VIII and the caudate lobe).
  { name: 'liver', label: 'Liver', group: 'surgery', color: '#93503f', files: ['FJ2409', 'FJ2816', 'FJ2818', 'FJ2819', 'FJ2820', 'FJ2821', 'FJ2822', 'FJ2823', 'FJ2824'], triangles: 16000, hollow: true },
  { name: 'stomach', label: 'Stomach', group: 'nearby', color: '#d7a08c', files: ['FJ2564'], triangles: null },
  { name: 'duodenum', label: 'Duodenum', group: 'nearby', color: '#dcb591', files: ['FJ2573'], triangles: null },
  { name: 'pancreas', label: 'Pancreas', group: 'nearby', color: '#dcc37a', files: ['FJ1895'], triangles: 3000 },
  { name: 'body_outline', label: 'Body outline', group: 'outline', color: '#9fb8b3', files: ['FJ2810'], triangles: 9000 },
];

// --- reading and cleaning meshes ----------------------------------------------

function readObj(id) {
  const positions = [];
  const indices = [];
  for (const line of readFileSync(join(sourceDir, `${id}.obj`), 'utf8').split('\n')) {
    if (line.startsWith('v ')) {
      const [x, y, z] = line.slice(2).trim().split(/\s+/).map(Number);
      positions.push(x, y, z);
    } else if (line.startsWith('f ')) {
      const corners = line.slice(2).trim().split(/\s+/).map(token => Number(token.split('/')[0]) - 1);
      for (let i = 1; i + 1 < corners.length; i += 1) indices.push(corners[0], corners[i], corners[i + 1]);
    }
  }
  return { positions, indices };
}

// Join several source meshes and merge vertices that sit at the same point.
function mergeAndWeld(meshes) {
  const seen = new Map();
  const positions = [];
  const indices = [];
  for (const mesh of meshes) {
    const remap = new Uint32Array(mesh.positions.length / 3);
    for (let i = 0; i < remap.length; i += 1) {
      const x = mesh.positions[i * 3], y = mesh.positions[i * 3 + 1], z = mesh.positions[i * 3 + 2];
      const key = `${Math.round(x * 100)},${Math.round(y * 100)},${Math.round(z * 100)}`;
      let index = seen.get(key);
      if (index === undefined) { index = positions.length / 3; seen.set(key, index); positions.push(x, y, z); }
      remap[i] = index;
    }
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const a = remap[mesh.indices[i]], b = remap[mesh.indices[i + 1]], c = remap[mesh.indices[i + 2]];
      if (a !== b && b !== c && a !== c) indices.push(a, b, c);
    }
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

// The liver comes as nine closed segment meshes pressed against each other, so the walls
// between segments sit inside the organ and show through when it is faded. A triangle is an
// inner wall if another liver surface lies directly in front of it, within `gap` millimetres.
// Removing those leaves one hollow shape.
function dropInnerWalls(mesh, gap = 3) {
  const { positions, indices } = mesh;
  const cell = 6;
  const grid = new Map();
  const triangleCount = indices.length / 3;
  const corner = (t, k) => point(positions, indices[t * 3 + k]);
  const cellsOf = (lo, hi, visit) => {
    for (let x = Math.floor(lo[0] / cell); x <= Math.floor(hi[0] / cell); x += 1) {
      for (let y = Math.floor(lo[1] / cell); y <= Math.floor(hi[1] / cell); y += 1) {
        for (let z = Math.floor(lo[2] / cell); z <= Math.floor(hi[2] / cell); z += 1) visit(`${x},${y},${z}`);
      }
    }
  };
  const bounds = points => [0, 1, 2].map(k => Math.min(...points.map(p => p[k]))).concat([0, 1, 2].map(k => Math.max(...points.map(p => p[k]))));
  for (let t = 0; t < triangleCount; t += 1) {
    const b = bounds([corner(t, 0), corner(t, 1), corner(t, 2)]);
    cellsOf(b.slice(0, 3), b.slice(3), key => { if (!grid.has(key)) grid.set(key, []); grid.get(key).push(t); });
  }
  // Does the segment from `origin` along `direction` (unit) hit triangle t within `gap`?
  const hits = (origin, direction, t) => {
    const a = corner(t, 0), e1 = sub(corner(t, 1), a), e2 = sub(corner(t, 2), a);
    const h = cross(direction, e2), det = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2];
    if (Math.abs(det) < 1e-9) return false;
    const s0 = sub(origin, a), u = (s0[0] * h[0] + s0[1] * h[1] + s0[2] * h[2]) / det;
    if (u < 0 || u > 1) return false;
    const q = cross(s0, e1), v = (direction[0] * q[0] + direction[1] * q[1] + direction[2] * q[2]) / det;
    if (v < 0 || u + v > 1) return false;
    const distanceAlong = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det;
    return distanceAlong > 0 && distanceAlong <= gap;
  };
  const kept = [];
  for (let t = 0; t < triangleCount; t += 1) {
    const [a, b, c] = [corner(t, 0), corner(t, 1), corner(t, 2)];
    const normal = normalize(cross(sub(b, a), sub(c, a)));
    const origin = add(scale(add(add(a, b), c), 1 / 3), scale(normal, 0.02));
    const tip = add(origin, scale(normal, gap));
    const own = new Set([indices[t * 3], indices[t * 3 + 1], indices[t * 3 + 2]]);
    let inner = false;
    const seen = new Set();
    cellsOf([0, 1, 2].map(k => Math.min(origin[k], tip[k])), [0, 1, 2].map(k => Math.max(origin[k], tip[k])), key => {
      if (inner) return;
      for (const other of grid.get(key) ?? []) {
        if (other === t || seen.has(other)) continue;
        seen.add(other);
        if (own.has(indices[other * 3]) || own.has(indices[other * 3 + 1]) || own.has(indices[other * 3 + 2])) continue;
        if (hits(origin, normal, other)) { inner = true; return; }
      }
    });
    if (!inner) kept.push(indices[t * 3], indices[t * 3 + 1], indices[t * 3 + 2]);
  }
  return compact({ positions, indices: new Uint32Array(kept) });
}

function simplify(mesh, triangles) {
  if (!triangles || mesh.indices.length / 3 <= triangles) return mesh;
  const [indices] = MeshoptSimplifier.simplify(mesh.indices, mesh.positions, 3, triangles * 3, 0.05);
  return compact({ positions: mesh.positions, indices });
}

// Drop vertices no triangle uses.
function compact(mesh) {
  const remap = new Int32Array(mesh.positions.length / 3).fill(-1);
  const positions = [];
  const indices = new Uint32Array(mesh.indices.length);
  for (let i = 0; i < mesh.indices.length; i += 1) {
    const old = mesh.indices[i];
    if (remap[old] < 0) {
      remap[old] = positions.length / 3;
      positions.push(mesh.positions[old * 3], mesh.positions[old * 3 + 1], mesh.positions[old * 3 + 2]);
    }
    indices[i] = remap[old];
  }
  return { positions: new Float32Array(positions), indices };
}

function vertexNormals({ positions, indices }) {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i] * 3, indices[i + 1] * 3, indices[i + 2] * 3];
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; // length = 2 x area
    for (const k of [a, b, c]) { normals[k] += nx; normals[k + 1] += ny; normals[k + 2] += nz; }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= length; normals[i + 1] /= length; normals[i + 2] /= length;
  }
  return normals;
}

// --- small vector helpers (points are [x, y, z] in source millimetres) -----------

const point = (positions, i) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const distance = (a, b) => Math.hypot(...sub(a, b));
const normalize = a => scale(a, 1 / (Math.hypot(...a) || 1));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function centroid(positions) {
  const sum = [0, 0, 0];
  for (let i = 0; i < positions.length; i += 3) { sum[0] += positions[i]; sum[1] += positions[i + 1]; sum[2] += positions[i + 2]; }
  return scale(sum, 3 / positions.length);
}
function nearestVertex(positions, target, score = distance) {
  let best = null, bestScore = Infinity;
  for (let i = 0; i < positions.length / 3; i += 1) {
    const candidate = point(positions, i);
    const value = score(candidate, target);
    if (value < bestScore) { bestScore = value; best = candidate; }
  }
  return best;
}
function farthestVertex(positions, target) {
  return nearestVertex(positions, target, (a, b) => -distance(a, b));
}

// A round tube along a quadratic curve from `start` through `control` to `end`.
function tube(start, control, end, radius, segments = 24, sides = 10) {
  const positions = [];
  const indices = [];
  const at = t => add(add(scale(start, (1 - t) ** 2), scale(control, 2 * t * (1 - t))), scale(end, t ** 2));
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const centre = at(t);
    const tangent = normalize(sub(at(Math.min(1, t + 0.01)), at(Math.max(0, t - 0.01))));
    const side = normalize(cross(tangent, Math.abs(tangent[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
    const up = cross(tangent, side);
    for (let j = 0; j < sides; j += 1) {
      const angle = (j / sides) * Math.PI * 2;
      positions.push(...add(centre, add(scale(side, Math.cos(angle) * radius), scale(up, Math.sin(angle) * radius))));
    }
  }
  for (let i = 0; i < segments; i += 1) {
    for (let j = 0; j < sides; j += 1) {
      const a = i * sides + j, b = i * sides + ((j + 1) % sides), c = a + sides, d = b + sides;
      indices.push(a, c, b, b, c, d);
    }
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

// --- build -------------------------------------------------------------------

await MeshoptSimplifier.ready;
const built = PARTS.map(part => {
  const welded = mergeAndWeld(part.files.map(readObj));
  const merged = part.hollow ? dropInnerWalls(welded) : welded;
  const mesh = simplify(merged, part.triangles);
  return { ...part, mesh, sourceTriangles: merged.indices.length / 3 };
});
const meshOf = name => built.find(part => part.name === name).mesh;

// Landmarks, found from the meshes themselves so they stay correct if the source changes.
const gallbladder = meshOf('gallbladder').positions;
const cysticDuct = meshOf('cystic_duct').positions;
const gbCentre = centroid(gallbladder);
const ductCentre = centroid(cysticDuct);
const gbNeck = nearestVertex(gallbladder, ductCentre);
const gbFundus = farthestVertex(gallbladder, gbNeck);
const ductAtGallbladder = nearestVertex(cysticDuct, gbNeck);
const ductAtBileDuct = farthestVertex(cysticDuct, ductAtGallbladder);
const liverCentre = centroid(meshOf('liver').positions);
const liverBed = nearestVertex(meshOf('liver').positions, gbCentre);

// The source has no cystic artery, so a schematic one is drawn: from the nearest point on the
// hepatic arteries to the gallbladder, a third of the way from the neck to the body.
const arteryEnd = nearestVertex(gallbladder, add(gbNeck, scale(sub(gbCentre, gbNeck), 0.35)), (a, b) => distance(a, b) - a[2] * 0.02);
const arteryStart = nearestVertex(meshOf('hepatic_artery').positions, arteryEnd);
const arteryMid = add(scale(add(arteryStart, arteryEnd), 0.5), [0, 0, 4]);
built.splice(2, 0, {
  name: 'cystic_artery', label: 'Cystic artery', group: 'surgery', color: '#d9534a', drawn: true,
  mesh: tube(arteryStart, arteryMid, arteryEnd, 0.9), sourceTriangles: 0, files: [],
});

// Where the four ports usually go, placed on the front of the body outline (schematic).
const skin = meshOf('body_outline').positions;
const onFrontSkin = (x, z) => nearestVertex(skin, [x, 0, z], (a, b) => (a[1] > -120 ? Infinity : Math.hypot(a[0] - b[0], a[2] - b[2])));
const ports = [
  { name: 'Camera port (navel)', at: onFrontSkin(0, gbCentre[2] - 95) },
  { name: 'Upper middle port', at: onFrontSkin(-10, gbCentre[2] + 55) },
  { name: 'Right upper port', at: onFrontSkin(gbCentre[0] - 45, gbCentre[2] + 5) },
  { name: 'Right side port', at: onFrontSkin(gbCentre[0] - 95, gbCentre[2] - 35) },
];

// Source millimetres -> output centimetres, y up, front toward +z, gallbladder centre at origin.
const convert = ([x, y, z]) => [(x - gbCentre[0]) / 10, (z - gbCentre[2]) / 10, -(y - gbCentre[1]) / 10];
const round = values => values.map(value => Math.round(value * 100) / 100);

const document = new Document();
const buffer = document.createBuffer();
const scene = document.createScene('anatomy');
const hexToRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
const manifestParts = [];
for (const part of built) {
  const count = part.mesh.positions.length / 3;
  const positions = new Float32Array(count * 3);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count; i += 1) {
    const converted = convert(point(part.mesh.positions, i));
    positions.set(converted, i * 3);
    for (let k = 0; k < 3; k += 1) { lo[k] = Math.min(lo[k], converted[k]); hi[k] = Math.max(hi[k], converted[k]); }
  }
  const mesh = { positions, indices: part.mesh.indices };
  const indexArray = count > 65535 ? mesh.indices : new Uint16Array(mesh.indices);
  const primitive = document.createPrimitive()
    .setAttribute('POSITION', document.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer))
    .setAttribute('NORMAL', document.createAccessor().setType('VEC3').setArray(vertexNormals(mesh)).setBuffer(buffer))
    .setIndices(document.createAccessor().setType('SCALAR').setArray(indexArray).setBuffer(buffer))
    .setMaterial(document.createMaterial(part.name).setBaseColorFactor([...hexToRgb(part.color), 1]).setRoughnessFactor(0.75).setMetallicFactor(0));
  scene.addChild(document.createNode(part.name).setMesh(document.createMesh(part.name).addPrimitive(primitive)));
  manifestParts.push({
    name: part.name, label: part.label, group: part.group, color: part.color, ...(part.drawn ? { drawn: true } : {}),
    triangles: mesh.indices.length / 3, center: round(lo.map((value, k) => (value + hi[k]) / 2)), size: round(hi.map((value, k) => value - lo[k])),
  });
  console.log(`${part.name.padEnd(16)} ${String(part.sourceTriangles).padStart(7)} -> ${String(mesh.indices.length / 3).padStart(6)} triangles`);
}

mkdirSync(dirname(OUT_GLB), { recursive: true });
mkdirSync(dirname(OUT_MANIFEST), { recursive: true });
await new NodeIO().write(OUT_GLB, document);

const manifest = {
  file: 'models/gallbladder-region.glb',
  units: 'centimetres; y up; front of the body toward +z; patient right at -x; gallbladder centre at the origin',
  source: 'BodyParts3D, (c) The Database Center for Life Science, licensed under CC Attribution 4.0 International',
  note: 'A generic adult body, not any patient. The cystic artery and the port positions are schematic drawings added by Surg+F.',
  parts: manifestParts,
  anchors: {
    gallbladderCentre: round(convert(gbCentre)),
    gallbladderFundus: round(convert(gbFundus)),
    gallbladderNeck: round(convert(gbNeck)),
    cysticDuctAtGallbladder: round(convert(ductAtGallbladder)),
    cysticDuctAtBileDuct: round(convert(ductAtBileDuct)),
    cysticArteryStart: round(convert(arteryStart)),
    cysticArteryMid: round(convert(arteryMid)),
    cysticArteryEnd: round(convert(arteryEnd)),
    liverBed: round(convert(liverBed)),
    liverCentre: round(convert(liverCentre)),
  },
  ports: ports.map(port => ({ name: port.name, at: round(convert(port.at)) })),
};
writeFileSync(OUT_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote ${OUT_GLB} (${(statSync(OUT_GLB).size / 1024).toFixed(0)} kB) and ${OUT_MANIFEST}`);
