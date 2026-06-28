// Runnable check for the environment system: node src/components/map3d/environment.test.mjs
// Injects a forgiving fake THREE (every class is a no-op returning objects with the props the
// module sets). NOTE: `Sky` is a REAL three addon (it instantiates fine in node, no WebGL needed),
// so the apply() smoke test below actually exercises the Sky uniform paths and would catch a
// misspelled uniform — the most likely real-app failure.
import assert from 'node:assert';
import { createEnvironment } from './environment.js';

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
class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  setScalar(s) { this.x = this.y = this.z = s; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  normalize() { return this; }
  setFromSphericalCoords() { return this; } // no-op; real Sky reads x/y/z (0s) without throwing
}
class Color {
  constructor() { this.r = 1; this.g = 1; this.b = 1; }
  set() { return this; }
  setHSL() { return this; }
  copy() { return this; }
  clone() { return new Color(); }
  lerp() { return this; }
  multiply() { return this; }
}
class Object3D {
  constructor() { this.position = new Vector3(); this.scale = new Vector3(); this.children = []; this.visible = true; this.frustumCulled = true; }
  add(o) { this.children.push(o); }
  remove(o) { const i = this.children.indexOf(o); if (i >= 0) this.children.splice(i, 1); }
}
class DirectionalLight extends Object3D { constructor() { super(); this.color = new Color(); this.intensity = 1; this.target = new Object3D(); } }
class AmbientLight extends Object3D { constructor() { super(); this.color = new Color(); this.intensity = 1; } }
class HemisphereLight extends Object3D { constructor() { super(); this.color = new Color(); this.groundColor = new Color(); this.intensity = 1; } }
class BufferAttribute { constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.needsUpdate = false; } }
class BufferGeometry { constructor() { this.attributes = {}; } setAttribute(n, a) { this.attributes[n] = a; } dispose() {} }
class PointsMaterial { constructor(o = {}) { Object.assign(this, o); this.color = new Color(); this.needsUpdate = false; } dispose() {} }
class Points extends Object3D { constructor(geo, mat) { super(); this.geometry = geo; this.material = mat; } }
class FogExp2 { constructor(color, density) { this.color = color; this.density = density; } }

const THREE = {
  Vector3, Color, DirectionalLight, AmbientLight, HemisphereLight,
  BufferAttribute, BufferGeometry, PointsMaterial, Points, FogExp2,
  AdditiveBlending: 2,
};

const makeScene = () => ({ fog: null, _kids: [], add(o) { this._kids.push(o); }, remove(o) { const i = this._kids.indexOf(o); if (i >= 0) this._kids.splice(i, 1); } });

const fullEnv = {
  mode: 'static', timeScale: 60, minuteOfDay: 720, day: 1,
  season: 'autumn', moonPhase: 5, weather: 'rain', weatherIntensity: 0.7, fogRadiusFt: 60,
};

// 1) API surface: apply / update / dispose are all functions.
t('createEnvironment exposes apply/update/dispose', () => {
  const env = createEnvironment(makeScene(), THREE);
  for (const k of ['apply', 'update', 'dispose']) {
    assert.strictEqual(typeof env[k], 'function', `missing ${k}`);
  }
});

// 2) static update keeps the clock pinned to env.minuteOfDay.
t('update(static, minuteOfDay:720) returns {minuteOfDay:720}', () => {
  const env = createEnvironment(makeScene(), THREE);
  const r = env.update(0.016, { mode: 'static', minuteOfDay: 720, weather: 'clear' });
  assert.deepStrictEqual(r, { minuteOfDay: 720 });
});

// 3) apply() smoke: a full env (incl. weather/fog) must not throw — exercises Sky uniforms via the
//    REAL Sky addon, plus fog + particle rebuild paths.
t('apply(fullEnv) does not throw', () => {
  const env = createEnvironment(makeScene(), THREE);
  assert.doesNotThrow(() => env.apply(fullEnv));
});

// 4) animated update advances the clock and does not throw (recompute + particle motion).
t('animated update advances clock without throwing', () => {
  const env = createEnvironment(makeScene(), THREE);
  env.apply({ ...fullEnv, mode: 'animated', minuteOfDay: 600, weather: 'snow' });
  let out;
  assert.doesNotThrow(() => { out = env.update(1, { mode: 'animated', timeScale: 60, season: 'winter', moonPhase: 4 }); });
  assert.strictEqual(out.minuteOfDay, 660); // 600 + 1s * 60 min/s
});

// 5) dispose() clears fog and removes objects without throwing.
t('dispose clears fog and does not throw', () => {
  const scene = makeScene();
  const env = createEnvironment(scene, THREE);
  env.apply(fullEnv);
  assert.doesNotThrow(() => env.dispose());
  assert.strictEqual(scene.fog, null);
});

console.log(`\nenvironment: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
