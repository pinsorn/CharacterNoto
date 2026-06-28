// Node check for ChunkManager._apronFor — the seam footgun: each neighbour's shared
// edge column must land in the right px/nx/pz/nz slot with the right index orientation
// (px/nx indexed by local z, pz/nz by local x). Visual Gate B confirms the render; this
// pins the index math so a regression fails fast in node. No THREE/Worker/IDB needed:
// the constructor's worker init throws in node and is caught (worker=null), and we
// populate `loaded` directly instead of going through setView/loadChunk.
import assert from 'node:assert';
import { ChunkManager } from './chunkManager.js';
import { CHUNK_DIM } from '../../lib/voxel/chunkGrid.js';
import { applyBrush } from './brushes.js';

const D = CHUNK_DIM;
let pass = 0;
const ok = (c, m) => { assert.ok(c, m); pass++; };

// Distinguishable, int16-safe height per cell: lx*100 + lz (max 63*100+63 = 6363 < 32767).
function fakeChunk(cx, cz) {
  const height = new Int16Array(D * D);
  for (let lz = 0; lz < D; lz++) for (let lx = 0; lx < D; lx++) height[lz * D + lx] = lx * 100 + lz;
  return { cx, cz, height, biome: new Uint8Array(D * D), overrides: new Map(), carves: new Set() };
}

const noopScene = { add() {}, remove() {} };
const m = new ChunkManager(noopScene, {}, 'map', { wChunks: 3, hChunks: 3, dim: D });
for (const [cx, cz] of [[1, 1], [2, 1], [0, 1], [1, 2], [1, 0]]) {
  m.loaded.set(`${cx},${cz}`, { chunk: fakeChunk(cx, cz), mesh: null, jobId: 0 });
}

const ap = m._apronFor(1, 1);
let okPx = true, okNx = true, okPz = true, okNz = true;
for (let lz = 0; lz < D; lz++) {
  if (ap.px[lz] !== 0 * 100 + lz) okPx = false;        // +x neighbour (2,1): its lx=0 column, by z
  if (ap.nx[lz] !== (D - 1) * 100 + lz) okNx = false;  // -x neighbour (0,1): its lx=D-1 column, by z
}
for (let lx = 0; lx < D; lx++) {
  if (ap.pz[lx] !== lx * 100 + 0) okPz = false;        // +z neighbour (1,2): its lz=0 row, by x
  if (ap.nz[lx] !== lx * 100 + (D - 1)) okNz = false;  // -z neighbour (1,0): its lz=D-1 row, by x
}
ok(okPx, 'px = +x neighbour lx=0 column, indexed by local z');
ok(okNx, 'nx = -x neighbour lx=D-1 column, indexed by local z');
ok(okPz, 'pz = +z neighbour lz=0 row, indexed by local x');
ok(okNz, 'nz = -z neighbour lz=D-1 row, indexed by local x');

// Missing neighbour → null apron (map edge shows a cliff).
const edge = m._apronFor(0, 0); // (0,0): +x=(1,0) loaded, -x=(-1,0) absent, +z=(0,1) loaded, -z absent
ok(edge.nx === null, 'absent -x neighbour → null');
ok(edge.nz === null, 'absent -z neighbour → null');
ok(edge.px !== null && edge.pz !== null, 'present neighbours still resolve');

// heightAt reads the loaded chunk's column; unloaded → default.
ok(m.heightAt(64, 64) === 0 * 100 + 0, 'heightAt routes global → chunk(1,1) local(0,0)');
ok(m.heightAt(64 + 5, 64 + 7) === 5 * 100 + 7, 'heightAt local offset within chunk');
ok(m.heightAt(64 * 9, 0) === 6, 'heightAt unloaded chunk → fallback 6');

// --- cross-chunk brush writeback: a raise stroke straddling the (0,0)|(1,0) seam updates BOTH
//     chunks and marks both dirty (the footgun a single-chunk path silently clips). ---
const flat = (cx, cz) => ({ cx, cz, size: D, height: new Int16Array(D * D).fill(6), biome: new Uint8Array(D * D), overrides: new Map(), carves: new Set() });
const m2 = new ChunkManager(noopScene, {}, 'm2', { wChunks: 2, hChunks: 1, dim: D });
m2.loaded.set('0,0', { chunk: flat(0, 0), mesh: null, jobId: 0 });
m2.loaded.set('1,0', { chunk: flat(1, 0), mesh: null, jobId: 0 });
// radius-2 raise centred on global x=63,z=10 (last column of chunk 0) → footprint spans into chunk 1
const touched = m2.brushAtWorld(63, 10, 2, (sc, lcx, lcz) =>
  applyBrush(sc, lcx, lcz, { tool: 'raise', radius: 2, strength: 1, shape: 'circle', falloff: false }));
const h0 = m2.loaded.get('0,0').chunk.height;
const h1 = m2.loaded.get('1,0').chunk.height;
ok(h0[10 * D + 63] === 7, 'chunk(0,0) seam column raised');
ok(h1[10 * D + 0] === 7, 'chunk(1,0) seam column raised (cross-boundary)');
ok(h1[10 * D + 1] === 7, 'chunk(1,0) +1 column raised');
ok(h0[10 * D + 30] === 6, 'far column in chunk(0,0) untouched');
ok(touched.has('0,0') && touched.has('1,0'), 'both chunks returned as touched');
ok(m2.dirty.has('0,0') && m2.dirty.has('1,0'), 'both chunks marked dirty (re-mesh)');
ok(m2.unsaved.has('0,0') && m2.unsaved.has('1,0'), 'both chunks queued for save');

console.log(`chunkManager: ${pass} passed, 0 failed`);
