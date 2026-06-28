// Custom voxel PROP authoring (pure; uses ONLY the injected THREE). A prop is plain data:
//   { id, name, res /* voxels per side: 6/8/12/16 */, voxels: [ [x,y,z,colorHex], ... ] }
// (sparse list; coords 0..res-1, y up). buildPropGeometry() turns it into the SAME kind of merged,
// baked-vertex-colour BufferGeometry the built-in props (objects.js) produce, so the overseer's
// InstancedMesh + MeshStandardMaterial({vertexColors:true}) renderer draws custom props unchanged.
//
// PONYTAIL: face-culling is REUSED, not reinvented — we feed a dense colour-key grid to the
// existing greedyMesh (mesher.js): it emits a face only where a solid voxel meets empty (internal
// faces between two solids are dropped) AND greedily merges coplanar same-colour faces, so the
// output is strictly lighter than naive per-cube culling. mesher.js is pure / zero-import, so this
// module stays node-importable and the fake-THREE test can drive buildPropGeometry().
//
// COLOUR SPACE: colours bake through the INJECTED THREE.Color exactly like objects.js paint(), so
// under three's default ColorManagement (linear, r152+) custom props match the built-ins with no
// sRGB brightness mismatch. THREE.Color accepts both '#rrggbb' strings (the editor) and numeric
// 0xRRGGBB (the test stub).

import { greedyMesh } from './mesher.js';

export const DEFAULT_RES = 8;
export const PROP_RES_OPTIONS = [6, 8, 12, 16];

/**
 * Build a merged, baked-colour BufferGeometry from prop data. Each solid voxel is a 1/res cube; the
 * prop occupies a unit footprint centred on X/Z (x,z in [-0.5,0.5]) with its base at y=0
 * (y in [0,1]) — the same placement convention as the built-in props (the renderer scales
 * per-instance). Internal faces are culled. Carries position/normal/color attributes + an index.
 * @param {{res?:number, voxels?:Array<[number,number,number,(string|number)]>}} prop
 * @param {object} THREE  injected three namespace (real, or a forgiving stub)
 * @returns {object} a THREE.BufferGeometry
 */
export function buildPropGeometry(prop, THREE) {
  const res = (prop && prop.res) || DEFAULT_RES;
  const voxels = (prop && prop.voxels) || [];

  // Dense colour-key grid: 0 = empty, else a 1-based index into `palette`. `palette` holds the
  // linear rgb (via THREE.Color) per distinct hex so greedyMesh merges by key and bakes the colour.
  const grid = new Int32Array(res * res * res);
  const palette = []; // [ [r,g,b], ... ] aligned to (key - 1)
  const keyByHex = new Map();
  const at = (x, y, z) => x + res * (y + res * z);

  for (const v of voxels) {
    if (!v) continue;
    const x = v[0] | 0, y = v[1] | 0, z = v[2] | 0;
    if (x < 0 || y < 0 || z < 0 || x >= res || y >= res || z >= res) continue;
    const hex = v[3];
    let key = keyByHex.get(hex);
    if (key === undefined) {
      const c = new THREE.Color(hex);
      palette.push([c.r, c.g, c.b]);
      key = palette.length; // 1-based
      keyByHex.set(hex, key);
    }
    grid[at(x, y, z)] = key;
  }

  const get = (x, y, z) => grid[at(x, y, z)];
  const colorOf = (k) => palette[k - 1] || [1, 1, 1];
  const m = greedyMesh([res, res, res], get, colorOf);

  // Voxel space (0..res ints) -> unit footprint, centred on X/Z, base at y=0. Uniform 1/res scale
  // keeps greedyMesh's axis-aligned normals valid (the X/Z translate doesn't affect normals).
  const s = 1 / res;
  const pos = m.positions;
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] = pos[i] * s - 0.5;
    pos[i + 1] = pos[i + 1] * s;
    pos[i + 2] = pos[i + 2] * s - 0.5;
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
  g.setAttribute('color', new THREE.BufferAttribute(m.colors, 3));
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  return g;
}

/** A fresh empty prop at `res`. crypto.randomUUID when available, else a timestamp id. */
export function emptyProp(res = DEFAULT_RES) {
  const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('p' + Date.now());
  return { id, name: 'Custom', res, voxels: [] };
}

/**
 * Immutable: return a NEW voxels array with (x,y,z) set to colorHex (replacing any voxel already at
 * that cell). Does NOT mutate `prop`. Caller reassigns, e.g.
 *   prop = { ...prop, voxels: setVoxel(prop, x, y, z, hex) };
 */
export function setVoxel(prop, x, y, z, colorHex) {
  const voxels = (prop.voxels || []).filter((v) => !(v[0] === x && v[1] === y && v[2] === z));
  voxels.push([x, y, z, colorHex]);
  return voxels;
}

/** Immutable: return a NEW voxels array with any voxel at (x,y,z) removed (does not mutate prop). */
export function eraseVoxel(prop, x, y, z) {
  return (prop.voxels || []).filter((v) => !(v[0] === x && v[1] === y && v[2] === z));
}
