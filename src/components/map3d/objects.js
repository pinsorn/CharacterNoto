// Object / Prop system for the voxel 3D map: a small built-in library of low-poly props, an
// InstancedMesh-based render layer (one InstancedMesh per propId), and a deterministic scatter
// helper. Props are baked-colour geometry (a `color` vertex attribute) so a single
// MeshStandardMaterial({ vertexColors:true }) draws every prop type via instancing.
//
// Design contract (imported verbatim by the overseer in Map3DTab.svelte):
//   PROPS                                               // [{ id, name, build(THREE)->BufferGeometry }]
//   createObjectLayer(scene, THREE) -> THREE.Group      // name 'objects', added to scene
//   syncObjectLayer(layer, objects, THREE)              // reconcile InstancedMeshes to objects[]
//   scatterInstances(propId, cx, cz, params, heightAt, seed) -> instance[]
//   disposeObjectLayer(layer)
//
// IMPORTANT — every three.js class comes from the injected `THREE` param (the overseer passes the
// live namespace; the test passes a forgiving fake). There is NO `import * as THREE from 'three'`
// and NO BufferGeometryUtils import, so this module imports cleanly under node (no WebGL) and the
// fake-THREE test can actually drive build(). All object creation is lazy (inside functions).
//
// PONYTAIL: we merge prop parts with a tiny in-house merge (mergeColored) instead of
// three/addons BufferGeometryUtils.mergeGeometries. Reason: mergeGeometries consumes the geometry
// objects the *injected* THREE produced, so a fully-fake test stub can't feed it — keeping the
// merge in-house preserves both the zero-import module and the fully-fake-THREE test convention.

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// geometry helpers (all THREE classes injected)
// ---------------------------------------------------------------------------

/** Bake one flat colour into a `color` vertex attribute on `g` (in place). */
function paint(g, hex, THREE) {
  const c = new THREE.Color(hex);
  const count = g.attributes.position.count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/**
 * Merge already-positioned, already-painted parts into ONE indexed BufferGeometry carrying
 * position / normal / color (uv is dropped — these props are untextured, so MeshStandardMaterial
 * needs no uv; ponytail simplification). Source parts are disposed. Works on real three geometries
 * and on the test's fake geometries alike.
 */
function mergeColored(parts, THREE) {
  let vCount = 0;
  let iCount = 0;
  for (const g of parts) {
    const vc = g.attributes.position.count;
    vCount += vc;
    iCount += g.index ? g.index.count : vc;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const col = new Float32Array(vCount * 3);
  const idx = new Uint32Array(iCount);

  let vo = 0; // vertex offset
  let io = 0; // index offset
  for (const g of parts) {
    const p = g.attributes.position.array;
    const n = g.attributes.normal ? g.attributes.normal.array : null;
    const c = g.attributes.color.array;
    const vc = g.attributes.position.count;
    pos.set(p, vo * 3);
    if (n) nor.set(n, vo * 3);
    col.set(c, vo * 3);
    if (g.index) {
      const gi = g.index.array;
      for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
      io += gi.length;
    } else {
      for (let i = 0; i < vc; i++) idx[io + i] = vo + i;
      io += vc;
    }
    vo += vc;
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));

  for (const g of parts) if (g.dispose) g.dispose();
  return out;
}

/** Make a part: build geo, optionally transform, paint it. `xform(g)` runs before painting. */
function part(THREE, geo, hex, xform) {
  if (xform) xform(geo);
  return paint(geo, hex, THREE);
}

// Palette (baked into vertices).
const C = {
  trunk: 0x6b4a2b,
  stump: 0x7a5836,
  pineLeaf: 0x2f6d3a,
  treeLeaf: 0x4a8c3f,
  bush: 0x3f7a35,
  rock: 0x808080,
  boulder: 0x6f6f6f,
  crystal: 0x66ffff, // bright cyan, reads as faintly emissive under the scene lights
};

// ---------------------------------------------------------------------------
// PROPS — built-in library. Each build() returns one merged, baked-colour geometry,
// base at y=0, growing +Y, centred on x/z. Roughly 1–3 voxels tall, low poly.
// ---------------------------------------------------------------------------

export const PROPS = [
  {
    id: 'pine',
    name: 'Pine',
    build(THREE) {
      return mergeColored([
        part(THREE, new THREE.CylinderGeometry(0.1, 0.15, 0.6, 6), C.trunk, (g) => g.translate(0, 0.3, 0)),
        part(THREE, new THREE.ConeGeometry(0.6, 1.0, 7), C.pineLeaf, (g) => g.translate(0, 1.1, 0)),
        part(THREE, new THREE.ConeGeometry(0.42, 0.9, 7), C.pineLeaf, (g) => g.translate(0, 1.7, 0)),
      ], THREE);
    },
  },
  {
    id: 'tree',
    name: 'Tree',
    build(THREE) {
      return mergeColored([
        part(THREE, new THREE.CylinderGeometry(0.13, 0.18, 0.8, 6), C.trunk, (g) => g.translate(0, 0.4, 0)),
        part(THREE, new THREE.IcosahedronGeometry(0.7, 0), C.treeLeaf, (g) => g.translate(0, 1.4, 0)),
      ], THREE);
    },
  },
  {
    id: 'bush',
    name: 'Bush',
    build(THREE) {
      // squashed sphere; non-uniform scale carries normals correctly via applyMatrix4.
      return mergeColored([
        part(THREE, new THREE.SphereGeometry(0.5, 8, 6), C.bush, (g) => { g.scale(1, 0.6, 1); g.translate(0, 0.3, 0); }),
      ], THREE);
    },
  },
  {
    id: 'rock',
    name: 'Rock',
    build(THREE) {
      return mergeColored([
        part(THREE, new THREE.IcosahedronGeometry(0.45, 0), C.rock, (g) => { g.scale(1, 0.8, 1); g.translate(0, 0.36, 0); }),
      ], THREE);
    },
  },
  {
    id: 'boulder',
    name: 'Boulder',
    build(THREE) {
      return mergeColored([
        part(THREE, new THREE.DodecahedronGeometry(0.8, 0), C.boulder, (g) => { g.scale(1, 0.85, 1); g.translate(0, 0.68, 0); }),
      ], THREE);
    },
  },
  {
    id: 'stump',
    name: 'Stump',
    build(THREE) {
      return mergeColored([
        part(THREE, new THREE.CylinderGeometry(0.35, 0.4, 0.4, 8), C.stump, (g) => g.translate(0, 0.2, 0)),
      ], THREE);
    },
  },
  {
    id: 'crystal',
    name: 'Crystal',
    build(THREE) {
      // tall thin octahedron; scale y to elongate, then sit its base on y=0.
      return mergeColored([
        part(THREE, new THREE.OctahedronGeometry(0.4, 0), C.crystal, (g) => { g.scale(0.6, 3, 0.6); g.translate(0, 1.2, 0); }),
      ], THREE);
    },
  },
];

const PROP_BY_ID = new Map(PROPS.map((p) => [p.id, p]));

// ---------------------------------------------------------------------------
// render layer
// ---------------------------------------------------------------------------

/**
 * Create the object layer: a THREE.Group named 'objects', added to scene, that will hold one
 * InstancedMesh per propId. Caches (built geometries, shared material, live meshes) live in
 * `layer.userData`.
 * @returns {object} the group
 */
export function createObjectLayer(scene, THREE) {
  const layer = new THREE.Group();
  layer.name = 'objects';
  layer.userData.geoCache = new Map(); // propId -> BufferGeometry (built once, reused)
  layer.userData.meshes = new Map(); // propId -> InstancedMesh
  layer.userData.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  scene.add(layer);
  return layer;
}

/**
 * Reconcile the InstancedMeshes in `layer` to the `objects` array. Groups by propId, builds (or
 * reuses cached) geometry per propId, and writes one instance matrix per object from
 * pos (translate) + yaw (rotate about Y) + uniform scale.
 * @param {object} layer  - group from createObjectLayer
 * @param {Array<{propId:string,pos:{x:number,y:number,z:number},yaw:number,scale:number,seed:number}>} objects
 * @param {object} THREE
 */
export function syncObjectLayer(layer, objects, THREE) {
  const geoCache = layer.userData.geoCache;
  const meshes = layer.userData.meshes;
  const mat = layer.userData.material;

  // group by propId
  const byProp = new Map();
  for (const o of objects || []) {
    if (!o || !o.propId) continue;
    let list = byProp.get(o.propId);
    if (!list) { list = []; byProp.set(o.propId, list); }
    list.push(o);
  }

  // remove meshes whose propId no longer appears (keep cached geometry for possible reuse)
  for (const [pid, mesh] of meshes) {
    if (!byProp.has(pid)) {
      layer.remove(mesh);
      if (mesh.dispose) mesh.dispose(); // frees instanceMatrix; geometry stays cached
      meshes.delete(pid);
    }
  }

  const dummy = new THREE.Object3D();

  for (const [pid, list] of byProp) {
    const prop = PROP_BY_ID.get(pid);
    if (!prop) continue; // unknown propId — skip silently

    // build geometry once, cache per propId
    let geo = geoCache.get(pid);
    if (!geo) { geo = prop.build(THREE); geoCache.set(pid, geo); }

    const count = list.length;
    let mesh = meshes.get(pid);
    // InstancedMesh capacity is fixed at construction — recreate when the count changes.
    // PONYTAIL: recreate-on-change is simpler than buffer pooling and the prop counts are small.
    if (!mesh || mesh.userData.capacity !== count) {
      if (mesh) { layer.remove(mesh); if (mesh.dispose) mesh.dispose(); }
      mesh = new THREE.InstancedMesh(geo, mat, count);
      mesh.name = 'objects:' + pid;
      mesh.frustumCulled = false; // bounding sphere is the single origin geo; instances spread far
      mesh.userData.propId = pid;
      mesh.userData.capacity = count;
      layer.add(mesh);
      meshes.set(pid, mesh);
    }

    for (let i = 0; i < count; i++) {
      const o = list[i];
      dummy.position.set(o.pos.x, o.pos.y, o.pos.z);
      dummy.rotation.set(0, o.yaw || 0, 0);
      const s = o.scale || 1;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Dispose all built geometries + the shared material (and free each InstancedMesh's buffers). */
export function disposeObjectLayer(layer) {
  if (!layer || !layer.userData) return;
  const { geoCache, meshes, material } = layer.userData;
  if (meshes) {
    for (const mesh of meshes.values()) {
      if (layer.remove) layer.remove(mesh);
      if (mesh.dispose) mesh.dispose();
    }
    meshes.clear();
  }
  if (geoCache) {
    for (const g of geoCache.values()) if (g.dispose) g.dispose();
    geoCache.clear();
  }
  if (material && material.dispose) material.dispose();
}

// ---------------------------------------------------------------------------
// scatter
// ---------------------------------------------------------------------------

// mulberry32: tiny, fast, deterministic PRNG. NO Math.random anywhere in scatter so resume/tests
// reproduce byte-for-byte from a seed.
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fold a propId string into the seed so different props at the same seed differ — trivial djb2,
// kept deliberately simple (a clever hash here is a bug the test can't catch).
function seedFor(seed, propId) {
  let h = (seed | 0) >>> 0;
  const s = String(propId || '');
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  return h || 1;
}

/**
 * Scatter prop instances over a disc. Returns ~round(density·π·radius²) new instance objects placed
 * within `radius` of (cx,cz); each snaps to its grid cell centre + jitter, samples surface height
 * via heightAt(gx,gz), and gets optional random yaw + scale variation. Deterministic for a seed.
 * Points whose cell centre falls outside 0..32 are skipped.
 * @param {string} propId
 * @param {number} cx @param {number} cz - disc centre (world == voxel coords)
 * @param {{radius?:number,density?:number,jitter?:number,scaleVar?:number,yawRandom?:boolean}} params
 * @param {(gx:number,gz:number)=>number} heightAt - surface top y at a cell
 * @param {number} seed
 * @returns {Array<{propId:string,pos:{x:number,y:number,z:number},yaw:number,scale:number,seed:number}>}
 */
export function scatterInstances(propId, cx, cz, params, heightAt, seed) {
  const radius = params && params.radius != null ? params.radius : 3;
  const density = params && params.density != null ? params.density : 0.5;
  const jitter = params && params.jitter != null ? params.jitter : 0.4;
  const scaleVar = params && params.scaleVar != null ? params.scaleVar : 0.3;
  const yawRandom = params ? !!params.yawRandom : true;
  const size = params && params.size != null ? params.size : 32; // map side length

  const rng = mulberry32(seedFor(seed, propId));
  const n = Math.round(density * Math.PI * radius * radius);
  const out = [];

  for (let i = 0; i < n; i++) {
    // uniform point in the disc (sqrt for area-uniform radius)
    const ang = rng() * TAU;
    const rr = Math.sqrt(rng()) * radius;
    const px = cx + Math.cos(ang) * rr;
    const pz = cz + Math.sin(ang) * rr;

    const gx = Math.floor(px);
    const gz = Math.floor(pz);
    const jx = (rng() * 2 - 1) * jitter * 0.5;
    const jz = (rng() * 2 - 1) * jitter * 0.5;
    const x = gx + 0.5 + jx;
    const z = gz + 0.5 + jz;
    if (x < 0 || x > size || z < 0 || z > size) continue; // outside the map

    const y = heightAt(gx, gz);
    const yaw = yawRandom ? rng() * TAU : 0;
    let scale = 1 + (rng() * 2 - 1) * scaleVar;
    if (scale < 0.2) scale = 0.2; // clamp > 0.2 so nothing degenerates
    const iseed = Math.floor(rng() * 0xffffffff);

    out.push({ propId, pos: { x, y, z }, yaw, scale, seed: iseed });
  }
  return out;
}
