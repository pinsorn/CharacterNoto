// Runnable check for the seam-correct per-chunk mesher: node src/lib/voxel/tileMesher.test.mjs
// No framework — counts passes and prints `tileMesher: N passed, 0 failed`.
// THE SEAM TEST IS THE GATE.
import { meshChunk } from './tileMesher.js';
import { surfaceKey, blockKey, colorOf } from './types.js';

let passed = 0;
let failed = 0;

/** @param {boolean} cond @param {string} msg */
function check(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${msg}`);
  }
}

/** @param {any} a @param {any} b @param {string} msg */
function eq(a, b, msg) {
  check(a === b, `${msg} (got ${a}, want ${b})`);
}

/** Colours are stored in a Float32Array; compare against Float64 colorOf() with a tolerance. */
function rgbApprox(colors, rgb, msg) {
  const ok = Math.abs(colors[0] - rgb[0]) < 1e-5 && Math.abs(colors[1] - rgb[1]) < 1e-5 && Math.abs(colors[2] - rgb[2]) < 1e-5;
  check(ok, `${msg} (got ${colors[0]},${colors[1]},${colors[2]}, want ${rgb[0]},${rgb[1]},${rgb[2]})`);
}

/** Flat chunk of side `dim`, every column height `h`, biome 0. */
function flatChunk(dim, h) {
  const n = dim * dim;
  const height = new Int16Array(n);
  height.fill(h);
  const biome = new Uint8Array(n);
  return { height, biome, dim };
}

/**
 * Count emitted faces whose outward normal is +x and whose quad sits on the
 * x === `plane` plane (i.e. +x boundary/interior faces at that x). Each face is
 * 4 consecutive vertices.
 */
function countPlusXFacesAt(mesh, plane) {
  const { positions, normals, faces } = mesh;
  let count = 0;
  for (let f = 0; f < faces; f++) {
    const v = f * 4; // first vertex of this quad
    const ni = v * 3;
    const isPlusX = normals[ni] === 1 && normals[ni + 1] === 0 && normals[ni + 2] === 0;
    if (!isPlusX) continue;
    let onPlane = true;
    for (let k = 0; k < 4; k++) if (positions[(v + k) * 3] !== plane) onPlane = false;
    if (onPlane) count++;
  }
  return count;
}

// --- 1. single solid voxel → exposed faces sane ----------------------------
{
  const mesh = meshChunk({ height: Int16Array.of(1), biome: Uint8Array.of(0), dim: 1 });
  eq(mesh.faces, 6, 'single voxel emits 6 faces');
  eq(mesh.positions.length, 6 * 4 * 3, 'single voxel positions length = faces*4*3');
  eq(mesh.indices.length, 6 * 6, 'single voxel indices length = faces*6');
}

// --- 2. SEAM TEST (THE GATE): dim=4 flat height 4 --------------------------
const DIM = 4;
const H = 4;

// 2a. neighbour same height (apron filled) → +x boundary wall fully culled.
{
  const c = flatChunk(DIM, H);
  const mesh = meshChunk({ ...c, aprons: { px: new Int16Array(DIM).fill(H), nx: null, pz: null, nz: null } });
  eq(countPlusXFacesAt(mesh, DIM), 0, 'seam: apron px=fill(4) → +x wall at x==dim ABSENT (culled)');
}

// 2b. no neighbour (apron null) → +x boundary wall fully present (cliff).
{
  const c = flatChunk(DIM, H);
  const mesh = meshChunk({ ...c, aprons: { px: null, nx: null, pz: null, nz: null } });
  eq(countPlusXFacesAt(mesh, DIM), DIM * H, 'seam: apron px=null → +x wall at x==dim PRESENT (dim*height)');
}

// 2c. partial-height neighbour → proves the `y < apron[lz]` threshold itself.
//     A broken "apron present ⇒ fully solid" culler would give 0 here, not 8.
{
  const c = flatChunk(DIM, H);
  const mesh = meshChunk({ ...c, aprons: { px: new Int16Array(DIM).fill(2), nx: null, pz: null, nz: null } });
  eq(countPlusXFacesAt(mesh, DIM), DIM * (H - 2), 'seam: apron px=fill(2), self h=4 → dim*(4-2)=8 exposed +x faces');
}

// 2c-axis. non-uniform apron → proves px is indexed by local z (not x).
//     A wrong `apx[lx]` read at the boundary would read the same value for every z
//     and give 4, not 10.
{
  const c = flatChunk(DIM, H);
  const mesh = meshChunk({ ...c, aprons: { px: Int16Array.of(0, 1, 2, 3), nx: null, pz: null, nz: null } });
  // exposed +x faces per local z = max(0, H - apx[z]) = 4 + 3 + 2 + 1 = 10.
  eq(countPlusXFacesAt(mesh, DIM), (H - 0) + (H - 1) + (H - 2) + (H - 3), 'seam: non-uniform px → apron indexed by local z (10 faces)');
}

// 2d. apron also absent entirely (no aprons key) → cliffs on every side.
{
  const c = flatChunk(DIM, H);
  const mesh = meshChunk(c);
  eq(countPlusXFacesAt(mesh, DIM), DIM * H, 'seam: no aprons object → +x wall PRESENT');
}

// --- 3a. carve changes composition (removes a voxel) -----------------------
{
  // 1x1 pillar, height 2 → faces: 4 sides * 2 + top + bottom = 10.
  const base = { height: Int16Array.of(2), biome: Uint8Array.of(0), dim: 1 };
  const before = meshChunk(base);
  eq(before.faces, 10, 'carve: uncarved 1x1x2 pillar = 10 faces');
  // Carve the top voxel (local 0,0; absolute y=1) → single voxel left = 6 faces.
  const after = meshChunk({ ...base, carves: new Set(['0,1,0']) });
  eq(after.faces, 6, 'carve: carving top voxel → 6 faces');
  // carves also accepts the Worker-transferred array shape.
  const afterArr = meshChunk({ ...base, carves: [['0,1,0']] });
  eq(afterArr.faces, 6, 'carve: array-of-[key] carves shape accepted');
  const afterBare = meshChunk({ ...base, carves: ['0,1,0'] });
  eq(afterBare.faces, 6, 'carve: array-of-bare-key carves shape accepted');
}

// --- 3b. override recolors a terrain voxel ---------------------------------
{
  const base = { height: Int16Array.of(1), biome: Uint8Array.of(0), dim: 1 };
  const plain = meshChunk(base);
  const grass = colorOf(surfaceKey(0));
  rgbApprox(plain.colors, grass, 'override: terrain voxel uses surface (grass) colour by default');
  // Override (0,0,0) → Stone (blockId 1). Map shape.
  const ov = meshChunk({ ...base, overrides: new Map([['0,0,0', 1]]) });
  const stone = colorOf(blockKey(1));
  eq(ov.faces, 6, 'override: still a single solid voxel = 6 faces');
  rgbApprox(ov.colors, stone, 'override: voxel recoloured to block (stone) colour');
  // overrides also accepts the Worker-transferred array-of-entries shape.
  const ovArr = meshChunk({ ...base, overrides: [['0,0,0', 1]] });
  rgbApprox(ovArr.colors, stone, 'override: array-of-[key,val] overrides shape accepted');
}

// --- 3c. override ADDS a voxel above empty terrain -------------------------
{
  // Empty column (height 0); override places a floating voxel at y=5.
  const mesh = meshChunk({ height: Int16Array.of(0), biome: Uint8Array.of(0), dim: 1, overrides: new Map([['0,5,0', 2]]) });
  eq(mesh.faces, 6, 'override: adds a floating voxel where terrain is empty → 6 faces');
}

console.log(`tileMesher: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
