// Runnable check for the brush engine: node src/components/map3d/brushes.test.mjs
import assert from 'node:assert';
import { createChunk, getHeight, getBiome, setColumnHeight } from '../../lib/voxel/world.js';
import { CHUNK } from '../../lib/voxel/types.js';
import { PAINTER_TOOLS, applyBrush } from './brushes.js';

let pass = 0;
let fail = 0;
function t(name, fn) {
  try {
    fn();
    pass++;
    console.log('ok   -', name);
  } catch (e) {
    fail++;
    console.error('FAIL -', name, '\n      ', e.message);
  }
}

function variance(ch, cx, cz, r) {
  const v = [];
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) v.push(getHeight(ch, cx + dx, cz + dz));
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length;
}

// 0) Tool registry contract: ids + order + per-tool params.
t('PAINTER_TOOLS ids/order/params', () => {
  assert.deepStrictEqual(
    PAINTER_TOOLS.map((x) => x.id),
    ['raise', 'lower', 'flatten', 'smooth', 'roughen', 'setHeight', 'carve', 'paintBiome'],
  );
  const p = Object.fromEntries(PAINTER_TOOLS.map((x) => [x.id, x.params]));
  assert.deepStrictEqual(p.raise, ['radius', 'strength', 'shape', 'falloff']);
  assert.deepStrictEqual(p.lower, ['radius', 'strength', 'shape', 'falloff']);
  assert.deepStrictEqual(p.flatten, ['radius', 'shape', 'falloff']);
  assert.deepStrictEqual(p.smooth, ['radius', 'strength', 'shape']);
  assert.deepStrictEqual(p.roughen, ['radius', 'strength', 'shape']);
  assert.deepStrictEqual(p.setHeight, ['radius', 'target', 'shape']);
  assert.deepStrictEqual(p.carve, ['radius', 'strength', 'shape']);
  assert.deepStrictEqual(p.paintBiome, ['radius', 'shape', 'biome']);
});

// 1) raise radius 0 strength 1 -> only the center column becomes 7.
t('raise r0 s1 -> center only', () => {
  const ch = createChunk(0, 0, 6, 0);
  applyBrush(ch, 10, 10, { tool: 'raise', radius: 0, strength: 1 });
  assert.strictEqual(getHeight(ch, 10, 10), 7);
  assert.strictEqual(getHeight(ch, 11, 10), 6);
  assert.strictEqual(getHeight(ch, 9, 10), 6);
  assert.strictEqual(getHeight(ch, 10, 11), 6);
  assert.strictEqual(getHeight(ch, 10, 9), 6);
});

// 2) raise radius 2 circle -> symmetric disc, corners excluded, center is a maximum.
t('raise r2 circle -> symmetric disc, center highest', () => {
  const ch = createChunk(0, 0, 6, 0);
  const cx = 16, cz = 16, r = 2;
  applyBrush(ch, cx, cz, { tool: 'raise', radius: r, strength: 3, shape: 'circle', falloff: true });
  const center = getHeight(ch, cx, cz);
  // symmetry across both axes
  assert.strictEqual(getHeight(ch, cx + 1, cz), getHeight(ch, cx - 1, cz));
  assert.strictEqual(getHeight(ch, cx + 2, cz), getHeight(ch, cx - 2, cz));
  assert.strictEqual(getHeight(ch, cx, cz + 1), getHeight(ch, cx, cz - 1));
  // disc: corner (dx=2,dz=2) -> 8 > 4+2 excluded -> untouched
  assert.strictEqual(getHeight(ch, cx + 2, cz + 2), 6);
  // inside disc edge (dx=2,dz=0) raised
  assert.ok(getHeight(ch, cx + 2, cz) > 6);
  // center is the maximum of the footprint
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) assert.ok(center >= getHeight(ch, cx + dx, cz + dz));
  assert.ok(center > getHeight(ch, cx + 2, cz)); // strictly highest under falloff
});

// 3) flatten baseline=4 -> every footprint column == 4.
t('flatten baseline 4', () => {
  const ch = createChunk(0, 0, 6, 0);
  const cx = 16, cz = 16, r = 2;
  applyBrush(ch, cx, cz, { tool: 'flatten', radius: r, shape: 'square', baseline: 4 });
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) assert.strictEqual(getHeight(ch, cx + dx, cz + dz), 4);
});

// 4) smooth reduces a +5 spike (variance drops) and is order-independent.
t('smooth reduces spike, variance drops, deterministic', () => {
  const mk = () => { const c = createChunk(0, 0, 6, 0); setColumnHeight(c, 16, 16, 11); return c; };
  const spike = mk();
  const vBefore = variance(spike, 16, 16, 1);
  const a = mk();
  applyBrush(a, 16, 16, { tool: 'smooth', radius: 1, strength: 4, shape: 'square' });
  assert.ok(getHeight(a, 16, 16) < 11, 'spike center reduced');
  assert.ok(variance(a, 16, 16, 1) < vBefore, 'variance drops');
  // fresh identical spike -> identical full-chunk result (order-independent / snapshot based)
  const b = mk();
  applyBrush(b, 16, 16, { tool: 'smooth', radius: 1, strength: 4, shape: 'square' });
  assert.deepStrictEqual(Array.from(a.height), Array.from(b.height));
});

// 5) falloff true: center column changes more than an edge column.
t('falloff: center changes more than edge', () => {
  const ch = createChunk(0, 0, 6, 0);
  const cx = 16, cz = 16, r = 2;
  applyBrush(ch, cx, cz, { tool: 'raise', radius: r, strength: 4, shape: 'circle', falloff: true });
  const centerDelta = getHeight(ch, cx, cz) - 6;
  const edgeDelta = getHeight(ch, cx + 2, cz) - 6;
  assert.ok(centerDelta > edgeDelta, `center ${centerDelta} > edge ${edgeDelta}`);
});

// 6) roughen is deterministic for the same chunk + seed, and actually perturbs.
t('roughen deterministic from seed', () => {
  const a = createChunk(0, 0, 6, 0);
  const b = createChunk(0, 0, 6, 0);
  applyBrush(a, 16, 16, { tool: 'roughen', radius: 3, strength: 2, shape: 'square', seed: 7 });
  applyBrush(b, 16, 16, { tool: 'roughen', radius: 3, strength: 2, shape: 'square', seed: 7 });
  assert.deepStrictEqual(Array.from(a.height), Array.from(b.height));
  const flat = createChunk(0, 0, 6, 0);
  assert.notDeepStrictEqual(Array.from(a.height), Array.from(flat.height), 'roughen changed something');
  // different seed -> generally different result
  const c = createChunk(0, 0, 6, 0);
  applyBrush(c, 16, 16, { tool: 'roughen', radius: 3, strength: 2, shape: 'square', seed: 99 });
  assert.notDeepStrictEqual(Array.from(a.height), Array.from(c.height), 'seed varies output');
});

// 7) setHeight sets footprint to target (clamped); falloff lerps toward target.
t('setHeight to target', () => {
  const ch = createChunk(0, 0, 6, 0);
  applyBrush(ch, 16, 16, { tool: 'setHeight', radius: 2, target: 20, shape: 'square' });
  assert.strictEqual(getHeight(ch, 16, 16), 20);
  assert.strictEqual(getHeight(ch, 18, 16), 20);
});

// 8) carve lowers the center and adds rounded-hollow cells to chunk.carves.
t('carve lowers surface and adds carves', () => {
  const ch = createChunk(0, 0, 12, 0);
  const before = ch.carves.size;
  applyBrush(ch, 16, 16, { tool: 'carve', radius: 2, strength: 2, shape: 'circle' });
  assert.ok(getHeight(ch, 16, 16) < 12, 'center lowered');
  assert.ok(ch.carves.size > before, 'carve hollow cells added');
});

// 9) paintBiome sets biome across footprint with no height change.
t('paintBiome no height change', () => {
  const ch = createChunk(0, 0, 6, 0);
  applyBrush(ch, 16, 16, { tool: 'paintBiome', radius: 1, shape: 'square', biomeId: 3 });
  assert.strictEqual(getBiome(ch, 16, 16), 3);
  assert.strictEqual(getBiome(ch, 17, 16), 3);
  assert.strictEqual(getHeight(ch, 16, 16), 6);
});

// 10) out-of-bounds footprint columns are skipped (no throw, near-corner stamp).
t('out-of-bounds columns skipped', () => {
  const ch = createChunk(0, 0, 6, 0);
  assert.doesNotThrow(() => applyBrush(ch, 1, 1, { tool: 'raise', radius: 3, strength: 1, shape: 'square' }));
  assert.doesNotThrow(() => applyBrush(ch, CHUNK - 1, CHUNK - 1, { tool: 'smooth', radius: 2, strength: 2, shape: 'square' }));
});

console.log(`\nbrushes: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
