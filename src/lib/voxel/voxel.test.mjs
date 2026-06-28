// Runnable check for the voxel core: node src/lib/voxel/voxel.test.mjs
import assert from 'node:assert';
import { greedyMesh } from './mesher.js';
import { composeDense, createChunk, surfaceY, columnIndex } from './world.js';
import { CHUNK, surfaceKey, colorOf } from './types.js';

const WHITE = () => [1, 1, 1];

// 1) Single cube → 6 quads, 24 verts, 36 indices, all normals outward.
{
  const solid = new Set(['0,0,0']);
  const get = (x, y, z) => (solid.has(`${x},${y},${z}`) ? 1 : 0);
  const m = greedyMesh([1, 1, 1], get, WHITE);
  assert.strictEqual(m.quads, 6, 'cube quads');
  assert.strictEqual(m.positions.length, 24 * 3, 'cube verts');
  assert.strictEqual(m.indices.length, 36, 'cube indices');
  const c = [0.5, 0.5, 0.5];
  for (let q = 0; q < m.quads; q++) {
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < 4; i++) { cx += m.positions[(q * 4 + i) * 3]; cy += m.positions[(q * 4 + i) * 3 + 1]; cz += m.positions[(q * 4 + i) * 3 + 2]; }
    const cen = [cx / 4, cy / 4, cz / 4];
    const n = [m.normals[q * 4 * 3], m.normals[q * 4 * 3 + 1], m.normals[q * 4 * 3 + 2]];
    const dot = n[0] * (cen[0] - c[0]) + n[1] * (cen[1] - c[1]) + n[2] * (cen[2] - c[2]);
    assert.ok(dot > 0, `face ${q} normal points outward (dot=${dot})`);
  }
}

// 2) Greedy merge: a 2×2×1 slab is 6 quads (not 16 culled faces).
{
  const solid = new Set();
  for (let x = 0; x < 2; x++) for (let z = 0; z < 2; z++) solid.add(`${x},0,${z}`);
  const get = (x, y, z) => (solid.has(`${x},${y},${z}`) ? 1 : 0);
  const m = greedyMesh([2, 1, 2], get, WHITE);
  assert.strictEqual(m.quads, 6, '2x2x1 slab merges to 6 quads');
}

// 3) Composition: flat chunk base=6 → surface key on top, surfaceY = 6.
{
  const ch = createChunk(0, 0, 6, 0);
  const dense = composeDense(ch);
  assert.strictEqual(surfaceY(dense, 3, 3, CHUNK), 6, 'surfaceY of flat base 6');
  const topIdx = (5 * CHUNK + 3) * CHUNK + 3; // y=5,z=3,x=3
  assert.strictEqual(dense[topIdx], surfaceKey(0), 'top layer is surface biome');
  assert.ok(columnIndex(3, 3) >= 0);
  assert.deepStrictEqual(colorOf(surfaceKey(0)).length, 3, 'colorOf returns rgb');
}

// 4) Empty grid → no geometry.
assert.strictEqual(greedyMesh([4, 4, 4], () => 0, WHITE).quads, 0, 'empty → 0 quads');

console.log('voxel core OK');
