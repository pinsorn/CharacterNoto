// Seam-correct per-chunk voxel mesher for the streaming engine.
// Each chunk meshes ONLY its own solid voxels. A voxel face is emitted iff its
// neighbour is EMPTY. Neighbours INSIDE the chunk use the chunk's own composition;
// neighbours ACROSS a chunk boundary (the 4 side walls ±x/±z) consult the "apron"
// = the adjacent chunk's heightmap along the shared edge. This guarantees the
// neighbour chunk emits its matching face, so there are no double faces / gaps at
// seams. We NEVER emit a face owned by an apron/neighbour cell — the apron is used
// only to cull our own boundary faces.
//
// Pure + dependency-free (imports only ./types.js) so it runs in a Worker and is
// unit-testable in plain node.
import { CHUNK_DIM, WORLD_HEIGHT, surfaceKey, subKey, blockKey, colorOf } from './types.js';

/**
 * Normalise overrides to a Map. Accepts a Map or a Worker-transferred array of
 * `[key, val]` entries.
 * @param {Map<string,number>|Array<[string,number]>|undefined|null} o
 * @returns {Map<string,number>}
 */
function toMap(o) {
  if (!o) return new Map();
  if (o instanceof Map) return o;
  return new Map(o);
}

/**
 * Normalise carves to a Set. Accepts a Set, an array of bare key strings, or an
 * array of `[key]` single-element arrays (the spec's Worker-transfer shape).
 * @param {Set<string>|Array<string|[string]>|undefined|null} c
 * @returns {Set<string>}
 */
function toSet(c) {
  if (!c) return new Set();
  if (c instanceof Set) return c;
  const s = new Set();
  for (const e of c) s.add(Array.isArray(e) ? e[0] : e);
  return s;
}

/**
 * Mesh a single chunk's own solid voxels into indexed BufferGeometry attributes.
 * World coords are LOCAL to the chunk (0..dim on x/z, 0..WORLD_HEIGHT on y) — the
 * caller offsets the mesh by the chunk origin.
 *
 * Composition per column (matches world.js composeDense): fill 0..height-1 with the
 * surface key at the top and the sub key below, then carve (→ empty), then override
 * (→ block key). carve/override keys are `"x,y,z"` with LOCAL x,z and ABSOLUTE y.
 *
 * Seam culling: for the 4 side walls a boundary neighbour cell (edgeIdx, y) is solid
 * iff `y < apron[edgeIdx]`. If the apron side is null/absent (map edge or not loaded)
 * the neighbour is treated as EMPTY so map edges show cliffs. (Apron is neighbour
 * terrain height only — a neighbour's overrides/carves exactly on the shared border
 * are ignored for culling: a minor, documented seam artifact.)
 *
 * @param {{
 *   height: Int16Array, biome: Uint8Array, dim?: number,
 *   overrides?: Map<string,number>|Array<[string,number]>,
 *   carves?: Set<string>|Array<string|[string]>,
 *   aprons?: { px?: Int16Array|null, nx?: Int16Array|null, pz?: Int16Array|null, nz?: Int16Array|null }
 * }} job
 *   aprons: px = neighbour at cx+1 (shared +x edge, indexed by local z); nx = cx-1
 *   edge (by local z); pz = cz+1 edge (by local x); nz = cz-1 edge (by local x).
 *   Each is an Int16Array(dim) of the neighbour's edge-column heights, or null.
 * @returns {{ positions:Float32Array, normals:Float32Array, colors:Float32Array, indices:Uint32Array, faces:number }}
 */
export function meshChunk({ height, biome, dim = CHUNK_DIM, overrides, carves, aprons } = {}) {
  const D = dim;
  const ov = toMap(overrides);
  const cv = toSet(carves);
  const ap = aprons || {};
  const apx = ap.px || null; // +x, indexed by local z
  const anx = ap.nx || null; // -x, indexed by local z
  const apz = ap.pz || null; // +z, indexed by local x
  const anz = ap.nz || null; // -z, indexed by local x

  // --- compose this chunk into a dense colour-key grid (0 = empty) -----------
  const grid = new Uint16Array(D * D * WORLD_HEIGHT);
  const gi = (lx, y, lz) => (y * D + lz) * D + lx;

  for (let lz = 0; lz < D; lz++) {
    for (let lx = 0; lx < D; lx++) {
      const col = lz * D + lx;
      let h = height[col];
      if (h < 0) h = 0;
      else if (h > WORLD_HEIGHT) h = WORLD_HEIGHT;
      const b = biome[col];
      for (let y = 0; y < h; y++) {
        grid[gi(lx, y, lz)] = y === h - 1 ? surfaceKey(b) : subKey(b);
      }
    }
  }
  // carves remove terrain fill (local x,z; absolute y)
  for (const key of cv) {
    const [x, y, z] = key.split(',').map(Number);
    if (x >= 0 && x < D && z >= 0 && z < D && y >= 0 && y < WORLD_HEIGHT) grid[gi(x, y, z)] = 0;
  }
  // overrides place block voxels (may also add voxels above terrain)
  for (const [key, t] of ov) {
    const [x, y, z] = key.split(',').map(Number);
    if (x >= 0 && x < D && z >= 0 && z < D && y >= 0 && y < WORLD_HEIGHT) grid[gi(x, y, z)] = blockKey(t);
  }

  // --- emit exposed faces ----------------------------------------------------
  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];
  let vcount = 0;
  let faces = 0;

  /** Emit one quad (CCW from outside) as 2 tris with a baked vertex colour. */
  function quad(p0, p1, p2, p3, nx, ny, nz, key) {
    const c = colorOf(key);
    const ps = [p0, p1, p2, p3];
    for (const p of ps) {
      positions.push(p[0], p[1], p[2]);
      normals.push(nx, ny, nz);
      colors.push(c[0], c[1], c[2]);
    }
    indices.push(vcount, vcount + 1, vcount + 2, vcount, vcount + 2, vcount + 3);
    vcount += 4;
    faces++;
  }

  for (let lz = 0; lz < D; lz++) {
    for (let lx = 0; lx < D; lx++) {
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        const key = grid[gi(lx, y, lz)];
        if (!key) continue;
        const x0 = lx, y0 = y, z0 = lz, x1 = lx + 1, y1 = y + 1, z1 = lz + 1;

        // +x wall
        {
          const ns = lx + 1 < D ? grid[gi(lx + 1, y, lz)] !== 0 : apx ? y < apx[lz] : false;
          if (!ns) quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], 1, 0, 0, key);
        }
        // -x wall
        {
          const ns = lx - 1 >= 0 ? grid[gi(lx - 1, y, lz)] !== 0 : anx ? y < anx[lz] : false;
          if (!ns) quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], -1, 0, 0, key);
        }
        // +z wall
        {
          const ns = lz + 1 < D ? grid[gi(lx, y, lz + 1)] !== 0 : apz ? y < apz[lx] : false;
          if (!ns) quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0, 0, 1, key);
        }
        // -z wall
        {
          const ns = lz - 1 >= 0 ? grid[gi(lx, y, lz - 1)] !== 0 : anz ? y < anz[lx] : false;
          if (!ns) quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], 0, 0, -1, key);
        }
        // +y top (normal in-chunk culling; above world top = empty)
        {
          const ns = y + 1 < WORLD_HEIGHT ? grid[gi(lx, y + 1, lz)] !== 0 : false;
          if (!ns) quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], 0, 1, 0, key);
        }
        // -y bottom (below world floor = empty)
        {
          const ns = y - 1 >= 0 ? grid[gi(lx, y - 1, lz)] !== 0 : false;
          if (!ns) quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], 0, -1, 0, key);
        }
      }
    }
  }

  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    colors: Float32Array.from(colors),
    indices: Uint32Array.from(indices),
    faces,
  };
}

/**
 * Far-LOD mesher: a gap-free column surface. Per column emit the top quad at y=height plus, for each
 * of the 4 neighbours whose terrain is LOWER, ONE merged "skirt" quad covering the exposed cliff
 * y∈[neighbourHeight, height] (a single quad, not per-voxel). Iterates only the dim² columns (not the
 * full voxel grid) and ignores overrides/carves — far chunks read as smooth voxel terrain. Boundary
 * neighbours come from the same `aprons` edge-heights the full mesher uses (null apron = map edge =
 * skirt down to 0, matching the full mesher's edge cliff). Top = surface colour, skirt = sub colour.
 *
 * @param {{height:Int16Array, biome:Uint8Array, dim?:number,
 *   aprons?:{px?:Int16Array|null,nx?:Int16Array|null,pz?:Int16Array|null,nz?:Int16Array|null}}} job
 * @returns {{positions:Float32Array, normals:Float32Array, colors:Float32Array, indices:Uint32Array, faces:number}}
 */
export function meshChunkSurface({ height, biome, dim = CHUNK_DIM, aprons } = {}) {
  const D = dim;
  const ap = aprons || {};
  const apx = ap.px || null, anx = ap.nx || null, apz = ap.pz || null, anz = ap.nz || null;
  const positions = [], normals = [], colors = [], indices = [];
  let vcount = 0, faces = 0;
  const clampH = (h) => (h < 0 ? 0 : h > WORLD_HEIGHT ? WORLD_HEIGHT : h);

  function quad(p0, p1, p2, p3, nx, ny, nz, key) {
    const c = colorOf(key);
    for (const p of [p0, p1, p2, p3]) { positions.push(p[0], p[1], p[2]); normals.push(nx, ny, nz); colors.push(c[0], c[1], c[2]); }
    indices.push(vcount, vcount + 1, vcount + 2, vcount, vcount + 2, vcount + 3);
    vcount += 4; faces++;
  }

  for (let lz = 0; lz < D; lz++) {
    for (let lx = 0; lx < D; lx++) {
      const col = lz * D + lx;
      const h = clampH(height[col]);
      if (h <= 0) continue;
      const b = biome[col];
      const sKey = surfaceKey(b), subK = subKey(b);
      const x0 = lx, x1 = lx + 1, z0 = lz, z1 = lz + 1;
      // top
      quad([x0, h, z0], [x0, h, z1], [x1, h, z1], [x1, h, z0], 0, 1, 0, sKey);
      // neighbour heights (interior cell, else apron edge, else 0 = map-edge cliff)
      const npx = lx + 1 < D ? clampH(height[col + 1]) : apx ? clampH(apx[lz]) : 0;
      const nnx = lx - 1 >= 0 ? clampH(height[col - 1]) : anx ? clampH(anx[lz]) : 0;
      const npz = lz + 1 < D ? clampH(height[col + D]) : apz ? clampH(apz[lx]) : 0;
      const nnz = lz - 1 >= 0 ? clampH(height[col - D]) : anz ? clampH(anz[lx]) : 0;
      // skirts only where the neighbour is lower (one quad spanning the exposed cliff)
      if (npx < h) quad([x1, npx, z0], [x1, h, z0], [x1, h, z1], [x1, npx, z1], 1, 0, 0, subK);
      if (nnx < h) quad([x0, nnx, z0], [x0, nnx, z1], [x0, h, z1], [x0, h, z0], -1, 0, 0, subK);
      if (npz < h) quad([x0, npz, z1], [x1, npz, z1], [x1, h, z1], [x0, h, z1], 0, 0, 1, subK);
      if (nnz < h) quad([x0, nnz, z0], [x0, h, z0], [x1, h, z0], [x1, nnz, z0], 0, 0, -1, subK);
    }
  }

  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    colors: Float32Array.from(colors),
    indices: Uint32Array.from(indices),
    faces,
  };
}
