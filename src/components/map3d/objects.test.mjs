// Runnable check for the object/prop system: node src/components/map3d/objects.test.mjs
// Injects a forgiving fake THREE (fake geometry primitives expose just enough — position/normal
// attributes + an index — for the in-house mergeColored to run, plus Group/InstancedMesh/material
// stubs for the render layer). No WebGL, no real three import: fully self-contained.
import assert from 'node:assert';
import { PROPS, createObjectLayer, syncObjectLayer, scatterInstances } from './objects.js';

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

// --- forgiving fake THREE -------------------------------------------------
class Color {
  constructor(hex = 0xffffff) {
    this.r = ((hex >> 16) & 255) / 255;
    this.g = ((hex >> 8) & 255) / 255;
    this.b = (hex & 255) / 255;
  }
}
class BufferAttribute {
  constructor(array, itemSize) {
    this.array = array;
    this.itemSize = itemSize;
    this.count = array.length / itemSize;
    this.needsUpdate = false;
  }
}
class BufferGeometry {
  constructor() { this.attributes = {}; this.index = null; }
  setAttribute(n, a) { this.attributes[n] = a; return this; }
  setIndex(a) { this.index = a; return this; }
  translate() { return this; }
  rotateX() { return this; }
  rotateY() { return this; }
  rotateZ() { return this; }
  scale() { return this; }
  dispose() {}
}
// A primitive = a 1-triangle geometry carrying position/normal + an index (enough for mergeColored).
function fillPrim(g) {
  g.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
  g.setIndex(new BufferAttribute(new Uint32Array([0, 1, 2]), 1));
  return g;
}
class CylinderGeometry extends BufferGeometry { constructor() { super(); fillPrim(this); } }
class ConeGeometry extends BufferGeometry { constructor() { super(); fillPrim(this); } }
class SphereGeometry extends BufferGeometry { constructor() { super(); fillPrim(this); } }
class IcosahedronGeometry extends BufferGeometry { constructor() { super(); fillPrim(this); } }
class DodecahedronGeometry extends BufferGeometry { constructor() { super(); fillPrim(this); } }
class OctahedronGeometry extends BufferGeometry { constructor() { super(); fillPrim(this); } }

class Object3D {
  constructor() {
    this.position = { set() {} };
    this.rotation = { set() {} };
    this.scale = { set() {} };
    this.matrix = {};
    this.children = [];
    this.userData = {};
    this.name = '';
    this.frustumCulled = true;
    this.visible = true;
  }
  add(o) { this.children.push(o); }
  remove(o) { const i = this.children.indexOf(o); if (i >= 0) this.children.splice(i, 1); }
  updateMatrix() {}
}
class Group extends Object3D {}
class MeshStandardMaterial { constructor(o = {}) { Object.assign(this, o); } dispose() {} }
class InstancedMesh extends Object3D {
  constructor(geo, mat, count) {
    super();
    this.geometry = geo;
    this.material = mat;
    this.count = count;
    this.instanceMatrix = { needsUpdate: false };
  }
  setMatrixAt() {}
  dispose() {}
}

const THREE = {
  Color, BufferAttribute, BufferGeometry,
  CylinderGeometry, ConeGeometry, SphereGeometry,
  IcosahedronGeometry, DodecahedronGeometry, OctahedronGeometry,
  Object3D, Group, MeshStandardMaterial, InstancedMesh,
};

const makeScene = () => ({ _kids: [], add(o) { this._kids.push(o); }, remove(o) { const i = this._kids.indexOf(o); if (i >= 0) this._kids.splice(i, 1); } });

// 1) PROPS library: >=6 entries, each with id/name/build.
t('PROPS has >=6 entries each with id/name/build', () => {
  assert.ok(Array.isArray(PROPS) && PROPS.length >= 6, `PROPS length ${PROPS.length}`);
  for (const p of PROPS) {
    assert.strictEqual(typeof p.id, 'string', 'id');
    assert.strictEqual(typeof p.name, 'string', 'name');
    assert.strictEqual(typeof p.build, 'function', 'build');
  }
});

// 2) scatterInstances: non-empty, well-shaped, in-bounds, near the disc centre.
t('scatterInstances returns valid in-bounds instances', () => {
  const arr = scatterInstances('pine', 16, 16, { radius: 3, density: 0.5, jitter: 0.4, scaleVar: 0.3, yawRandom: true }, () => 8, 1);
  assert.ok(Array.isArray(arr) && arr.length > 0, `empty (${arr.length})`);
  for (const it of arr) {
    assert.strictEqual(it.propId, 'pine');
    assert.ok(it.pos && typeof it.pos.x === 'number' && typeof it.pos.y === 'number' && typeof it.pos.z === 'number', 'pos');
    assert.strictEqual(typeof it.yaw, 'number', 'yaw');
    assert.strictEqual(typeof it.scale, 'number', 'scale');
    assert.ok(it.scale >= 0.2, 'scale clamp');
    assert.strictEqual(it.pos.y, 8, 'heightAt');
    assert.ok(it.pos.x >= 0 && it.pos.x <= 32 && it.pos.z >= 0 && it.pos.z <= 32, 'inside 0..32');
    // within ~radius: cell-centre snap + jitter can push a little past radius — allow +1.5.
    const dist = Math.hypot(it.pos.x - 16, it.pos.z - 16);
    assert.ok(dist <= 3 + 1.5, `dist ${dist.toFixed(2)} > radius+1.5`);
  }
});

// 3) determinism: same seed -> byte-identical arrays.
t('scatterInstances is deterministic for a seed', () => {
  const p = { radius: 3, density: 0.5, jitter: 0.4, scaleVar: 0.3, yawRandom: true };
  const a = scatterInstances('pine', 16, 16, p, () => 8, 1);
  const b = scatterInstances('pine', 16, 16, p, () => 8, 1);
  assert.deepStrictEqual(a, b);
});

// 4) syncObjectLayer adds one InstancedMesh child per distinct propId (and removes vanished ones).
t('syncObjectLayer adds one child per distinct propId', () => {
  const layer = createObjectLayer(makeScene(), THREE);
  const objects = [
    { propId: 'pine', pos: { x: 1, y: 0, z: 1 }, yaw: 0, scale: 1, seed: 1 },
    { propId: 'pine', pos: { x: 2, y: 0, z: 2 }, yaw: 1, scale: 1.2, seed: 2 },
    { propId: 'rock', pos: { x: 3, y: 0, z: 3 }, yaw: 0, scale: 1, seed: 3 },
  ];
  syncObjectLayer(layer, objects, THREE);
  assert.strictEqual(layer.children.length, 2, `distinct propIds -> ${layer.children.length} children`);

  // re-sync without 'rock' -> its mesh is removed.
  syncObjectLayer(layer, objects.filter((o) => o.propId === 'pine'), THREE);
  assert.strictEqual(layer.children.length, 1, `after removal -> ${layer.children.length} children`);
});

console.log(`\nobjects: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
