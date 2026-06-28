// Runnable check for the chunk-grid math: node src/lib/voxel/chunkGrid.test.mjs
// No framework — counts passes and prints `chunkGrid: N passed, 0 failed`.
import {
  CHUNK_DIM,
  chunkKey,
  worldToChunk,
  chunkOrigin,
  lidx,
  createChunk,
  chunksInRadius,
  allChunks,
  mapSizeToChunks,
} from './chunkGrid.js';

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
  check(JSON.stringify(a) === JSON.stringify(b), `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
}

// CHUNK_DIM re-exported.
eq(CHUNK_DIM, 64, 'CHUNK_DIM re-export = 64');

// chunkKey.
eq(chunkKey(2, -3), '2,-3', 'chunkKey');

// worldToChunk: origin, cross-boundary, and negative floors.
eq(worldToChunk(0, 0), { cx: 0, cz: 0, lx: 0, lz: 0 }, 'worldToChunk(0,0)');
eq(worldToChunk(64, 1), { cx: 1, cz: 0, lx: 0, lz: 1 }, 'worldToChunk(64,1)');
eq(worldToChunk(-1, -1), { cx: -1, cz: -1, lx: 63, lz: 63 }, 'worldToChunk(-1,-1) negative floors');

// chunkOrigin.
eq(chunkOrigin(2, 3), { x0: 128, z0: 192 }, 'chunkOrigin(2,3)');

// lidx roundtrips for a sample of local coords.
{
  let ok = true;
  for (const [lx, lz] of [[0, 0], [63, 0], [0, 63], [63, 63], [10, 25]]) {
    const i = lidx(lx, lz);
    if (i !== lz * CHUNK_DIM + lx) ok = false;
    if (i % CHUNK_DIM !== lx || Math.floor(i / CHUNK_DIM) !== lz) ok = false;
  }
  check(ok, 'lidx roundtrips');
}

// createChunk: shape + filled arrays + fresh empty collections + dirty.
{
  const ch = createChunk(1, 2, 6, 3);
  check(ch.cx === 1 && ch.cz === 2, 'createChunk cx/cz');
  check(ch.height instanceof Int16Array && ch.height.length === CHUNK_DIM * CHUNK_DIM, 'createChunk height array');
  check(ch.biome instanceof Uint8Array && ch.biome.length === CHUNK_DIM * CHUNK_DIM, 'createChunk biome array');
  check(ch.height[0] === 6 && ch.height[ch.height.length - 1] === 6, 'createChunk height filled with base');
  check(ch.biome[0] === 3 && ch.biome[ch.biome.length - 1] === 3, 'createChunk biome filled with biomeId');
  check(ch.overrides instanceof Map && ch.overrides.size === 0, 'createChunk overrides empty Map');
  check(ch.carves instanceof Set && ch.carves.size === 0, 'createChunk carves empty Set');
  check(ch.dirty === true, 'createChunk dirty true');
  const def = createChunk(0, 0);
  check(def.height[0] === 6 && def.biome[0] === 0, 'createChunk defaults base=6 biome=0');
}

// chunksInRadius: center (chunk 2,2 in 5x5) radius 1 → 9, nearest-first (center first).
{
  const r = chunksInRadius(2 * CHUNK_DIM, 2 * CHUNK_DIM, 1, 5, 5);
  check(r.length === 9, 'chunksInRadius center r=1 → 9 chunks');
  eq(r[0], { cx: 2, cz: 2 }, 'chunksInRadius center first (nearest)');
  // distances must be non-decreasing from center chunk.
  let mono = true;
  let prev = -1;
  for (const c of r) {
    const d = (c.cx - 2) ** 2 + (c.cz - 2) ** 2;
    if (d < prev) mono = false;
    prev = d;
  }
  check(mono, 'chunksInRadius sorted nearest-first');
}

// chunksInRadius: corner clamps (chunk 0,0 in 5x5) radius 1 → 4.
{
  const r = chunksInRadius(0, 0, 1, 5, 5);
  check(r.length === 4, 'chunksInRadius corner clamps to 4');
  eq(r[0], { cx: 0, cz: 0 }, 'chunksInRadius corner center first');
}

// allChunks.
{
  const a = allChunks(3, 2);
  check(a.length === 6, 'allChunks 3x2 → 6');
  eq(a[0], { cx: 0, cz: 0 }, 'allChunks first');
  eq(a[a.length - 1], { cx: 2, cz: 1 }, 'allChunks last');
}

// mapSizeToChunks.
eq(mapSizeToChunks(96), 2, 'mapSizeToChunks(96) = 2');
eq(mapSizeToChunks(128), 2, 'mapSizeToChunks(128) = 2');
eq(mapSizeToChunks(129), 3, 'mapSizeToChunks(129) = 3');

console.log(`chunkGrid: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
