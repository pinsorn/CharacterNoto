// Runnable check for the custom voxel-prop builder:  node src/lib/voxel/voxelProp.test.mjs
// Injects a forgiving fake THREE (Color[numeric hex] + BufferAttribute + BufferGeometry) — enough
// for buildPropGeometry to run. No WebGL, no real three import. greedyMesh (mesher.js) is pure JS.
import assert from 'node:assert';
import {
  buildPropGeometry, setVoxel, eraseVoxel, emptyProp, DEFAULT_RES, PROP_RES_OPTIONS,
} from './voxelProp.js';

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('ok   -', name); }
  catch (e) { fail++; console.error('FAIL -', name, '\n      ', e.message); }
}

// --- forgiving fake THREE -------------------------------------------------
class Color {
  constructor(hex = 0xffffff) {
    this.r = ((hex >> 16) & 255) / 255;
    this.g = ((hex >> 8) & 255) / 255;
    this.b = (hex & 255) / 255;
  }
}
class BufferAttribute {
  constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.count = array.length / itemSize; }
}
class BufferGeometry {
  constructor() { this.attributes = {}; this.index = null; }
  setAttribute(n, a) { this.attributes[n] = a; return this; }
  setIndex(a) { this.index = a; return this; }
}
const THREE = { Color, BufferAttribute, BufferGeometry };

// numeric hex so the fake Color parses cleanly (real THREE.Color also takes '#rrggbb' in the app).
const RED = 0xff0000, GREEN = 0x00ff00;

// 1) lone voxel -> 6 exposed faces = 24 verts (no neighbour to cull/merge).
t('single voxel -> 24 verts (6 faces)', () => {
  const g = buildPropGeometry({ res: 8, voxels: [[0, 0, 0, RED]] }, THREE);
  assert.strictEqual(g.attributes.position.count, 24, `got ${g.attributes.position.count}`);
});

// 2) two ADJACENT same-colour voxels cull the shared face (+greedy-merge coplanar faces), so they
//    have FEWER verts than two NON-adjacent voxels in the same grid (which can't merge/cull -> 48).
t('adjacent voxels cull shared faces (< non-adjacent)', () => {
  const adj = buildPropGeometry({ res: 8, voxels: [[0, 0, 0, RED], [1, 0, 0, RED]] }, THREE);
  const apart = buildPropGeometry({ res: 8, voxels: [[0, 0, 0, RED], [4, 0, 0, RED]] }, THREE);
  assert.strictEqual(apart.attributes.position.count, 48, `non-adjacent ${apart.attributes.position.count}`);
  assert.ok(
    adj.attributes.position.count < apart.attributes.position.count,
    `adjacent ${adj.attributes.position.count} not < ${apart.attributes.position.count}`,
  );
});

// 3) geometry carries baked colour + normals + an index (same shape as built-in props).
t('geometry has color, normal, index', () => {
  const g = buildPropGeometry({ res: 8, voxels: [[0, 0, 0, GREEN]] }, THREE);
  assert.ok(g.attributes.color && g.attributes.color.count === 24, 'color');
  assert.ok(g.attributes.normal && g.attributes.normal.count === 24, 'normal');
  assert.ok(g.index && g.index.count === 36, `index ${g.index && g.index.count}`); // 6 faces * 2 tris * 3
});

// 4) empty prop -> empty geometry, no crash.
t('empty prop -> 0 verts', () => {
  const g = buildPropGeometry(emptyProp(8), THREE);
  assert.strictEqual(g.attributes.position.count, 0);
});

// 5) setVoxel / eraseVoxel are immutable list edits.
t('setVoxel / eraseVoxel modify the list', () => {
  const p = emptyProp(8);
  const v1 = setVoxel(p, 1, 2, 3, RED);
  assert.strictEqual(v1.length, 1, 'added');
  assert.strictEqual(p.voxels.length, 0, 'original untouched');
  const v2 = setVoxel({ ...p, voxels: v1 }, 1, 2, 3, GREEN); // same cell -> replace, not duplicate
  assert.strictEqual(v2.length, 1, 'replaced (no dup)');
  assert.strictEqual(v2[0][3], GREEN, 'colour replaced');
  const v3 = eraseVoxel({ ...p, voxels: v2 }, 1, 2, 3);
  assert.strictEqual(v3.length, 0, 'erased');
});

// 6) constants.
t('constants', () => {
  assert.strictEqual(DEFAULT_RES, 8);
  assert.ok(Array.isArray(PROP_RES_OPTIONS) && PROP_RES_OPTIONS.includes(8), 'PROP_RES_OPTIONS includes 8');
});

console.log(`\nvoxelProp: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
