// Runnable check for the token mesh builder: node src/components/map3d/tokens.test.mjs
// Uses a minimal fake THREE (no real three import) — the module under test takes THREE injected,
// and skips the label Sprite when `document` is undefined (node), so only meshes are created.
import assert from 'node:assert';
import { SIZES, createTokenGroup, syncTokenGroup, disposeTokenGroup } from './tokens.js';

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

// --- fake THREE -----------------------------------------------------------
const vec = () => ({ x: 0, y: 0, z: 0, set() { return this; }, copy() { return this; } });
class Object3D {
  constructor() {
    this.children = [];
    this.position = vec();
    this.rotation = vec(); // has .set(x,y,z) for 3-axis token rotation
    this.scale = vec();
    this.userData = {};
  }
  add(o) { this.children.push(o); }
  remove(o) { const i = this.children.indexOf(o); if (i >= 0) this.children.splice(i, 1); }
  traverse(fn) { fn(this); for (const c of this.children) c.traverse(fn); }
}
class Group extends Object3D {}
class Color { set() { return this; } copy() { return this; } lerp() { return this; } }
class Material { constructor(o = {}) { this.color = new Color(); this.map = o.map ?? null; } dispose() {} }
class MeshStandardMaterial extends Material {}
class SpriteMaterial extends Material {}
class Geometry { dispose() {} }
class CylinderGeometry extends Geometry {}
class ConeGeometry extends Geometry {}
class BoxGeometry extends Geometry {}
class Mesh extends Object3D { constructor(geo, mat) { super(); this.geometry = geo; this.material = mat; } }
class Sprite extends Object3D { constructor(mat) { super(); this.material = mat; } }
class CanvasTexture { dispose() {} }
const THREE = {
  Group, Mesh, Sprite, Color,
  MeshStandardMaterial, SpriteMaterial, CanvasTexture,
  CylinderGeometry, ConeGeometry, BoxGeometry,
};

const heightAt = () => 0;
const charLookup = () => null;
const mk = (id, extra = {}) => ({
  id, kind: 'marker', label: 'Tok' + id, color: '#7c3aed',
  size: 'medium', cell: { gx: 5, gz: 5 }, facing: 0, ...extra,
});

// 1) one child group per token, tagged with userData.tokenId.
t('sync adds one child per token', () => {
  const g = createTokenGroup(THREE);
  syncTokenGroup(g, [mk('a'), mk('b')], charLookup, heightAt, THREE);
  assert.strictEqual(g.children.length, 2);
  assert.deepStrictEqual(g.children.map((c) => c.userData.tokenId).sort(), ['a', 'b']);
});

// 2) removing a token from the array and re-syncing removes its child.
t('removing a token removes its child', () => {
  const g = createTokenGroup(THREE);
  syncTokenGroup(g, [mk('a'), mk('b')], charLookup, heightAt, THREE);
  syncTokenGroup(g, [mk('a')], charLookup, heightAt, THREE);
  assert.strictEqual(g.children.length, 1);
  assert.strictEqual(g.children[0].userData.tokenId, 'a');
  assert.doesNotThrow(() => disposeTokenGroup(g));
});

// 3) SIZES contract: large foot == 2 and all six size keys present.
t('SIZES contract (large.foot===2, all six keys)', () => {
  assert.strictEqual(SIZES.large.foot, 2);
  for (const k of ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan']) {
    assert.ok(SIZES[k] && typeof SIZES[k].foot === 'number' && typeof SIZES[k].scale === 'number', `missing ${k}`);
  }
});

console.log(`\ntokens: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
