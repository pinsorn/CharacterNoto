// Chunk-grid math for the streaming voxel engine.
// Pure helpers: world<->chunk coordinate mapping, chunk creation, and grid
// queries (radius/all). No DOM, no three.js — importable in plain node.
// World/voxel coords are global (1 unit = 1 voxel). A map is a grid of square
// chunks of side CHUNK_DIM. See VOXEL_3D_PLAN.md streaming phase.

import { CHUNK_DIM } from './types.js';

export { CHUNK_DIM };

/**
 * Stable string key for a chunk coordinate.
 * @param {number} cx
 * @param {number} cz
 * @returns {string} `"cx,cz"`
 */
export const chunkKey = (cx, cz) => `${cx},${cz}`;

/**
 * Map a global world/voxel (x,z) to its chunk coord + local column offset.
 * Uses Math.floor so negative coords map correctly (e.g. x=-1 → cx=-1, lx=63).
 * @param {number} x
 * @param {number} z
 * @returns {{ cx: number, cz: number, lx: number, lz: number }}
 *   cx/cz = chunk coords; lx/lz = local 0..CHUNK_DIM-1.
 */
export function worldToChunk(x, z) {
  const cx = Math.floor(x / CHUNK_DIM);
  const cz = Math.floor(z / CHUNK_DIM);
  return { cx, cz, lx: x - cx * CHUNK_DIM, lz: z - cz * CHUNK_DIM };
}

/**
 * World-space origin (min corner) of a chunk.
 * @param {number} cx
 * @param {number} cz
 * @returns {{ x0: number, z0: number }}
 */
export const chunkOrigin = (cx, cz) => ({ x0: cx * CHUNK_DIM, z0: cz * CHUNK_DIM });

/**
 * Local column index within a chunk's CHUNK_DIM×CHUNK_DIM grid.
 * @param {number} lx local x, 0..CHUNK_DIM-1
 * @param {number} lz local z, 0..CHUNK_DIM-1
 * @returns {number} lz*CHUNK_DIM + lx
 */
export const lidx = (lx, lz) => lz * CHUNK_DIM + lx;

/**
 * Create a fresh chunk with flat height/biome columns.
 * @param {number} cx
 * @param {number} cz
 * @param {number} [base=6] initial height for every column
 * @param {number} [biomeId=0] initial biome id for every column
 * @returns {{
 *   cx: number, cz: number,
 *   height: Int16Array, biome: Uint8Array,
 *   overrides: Map<string, number>, carves: Set<string>, dirty: boolean
 * }}
 */
export function createChunk(cx, cz, base = 6, biomeId = 0) {
  const n = CHUNK_DIM * CHUNK_DIM;
  const height = new Int16Array(n);
  height.fill(base);
  const biome = new Uint8Array(n);
  biome.fill(biomeId);
  return { cx, cz, height, biome, overrides: new Map(), carves: new Set(), dirty: true };
}

/**
 * All grid chunks within Chebyshev `radiusChunks` of the chunk containing
 * (centerX, centerZ), clamped to the grid 0..wChunks-1 × 0..hChunks-1.
 * Sorted nearest-first (squared Euclidean distance to the center chunk),
 * with (cx,cz) tie-break for determinism.
 * @param {number} centerX world x
 * @param {number} centerZ world z
 * @param {number} radiusChunks Chebyshev radius in chunks (>=0)
 * @param {number} wChunks grid width in chunks
 * @param {number} hChunks grid height in chunks
 * @returns {Array<{ cx: number, cz: number }>}
 */
export function chunksInRadius(centerX, centerZ, radiusChunks, wChunks, hChunks) {
  const { cx: ccx, cz: ccz } = worldToChunk(centerX, centerZ);
  const out = [];
  const minX = Math.max(0, ccx - radiusChunks);
  const maxX = Math.min(wChunks - 1, ccx + radiusChunks);
  const minZ = Math.max(0, ccz - radiusChunks);
  const maxZ = Math.min(hChunks - 1, ccz + radiusChunks);
  for (let cz = minZ; cz <= maxZ; cz++) {
    for (let cx = minX; cx <= maxX; cx++) {
      out.push({ cx, cz });
    }
  }
  out.sort((a, b) => {
    const da = (a.cx - ccx) ** 2 + (a.cz - ccz) ** 2;
    const db = (b.cx - ccx) ** 2 + (b.cz - ccz) ** 2;
    return da - db || a.cx - b.cx || a.cz - b.cz;
  });
  return out;
}

/**
 * Every chunk coord in a wChunks × hChunks grid (row-major).
 * @param {number} wChunks
 * @param {number} hChunks
 * @returns {Array<{ cx: number, cz: number }>}
 */
export function allChunks(wChunks, hChunks) {
  const out = [];
  for (let cz = 0; cz < hChunks; cz++) {
    for (let cx = 0; cx < wChunks; cx++) {
      out.push({ cx, cz });
    }
  }
  return out;
}

/**
 * Convert a map side length in voxels to its side length in chunks.
 * @param {number} nVoxels voxels per side
 * @returns {number} chunks per side (ceil)
 */
export const mapSizeToChunks = (nVoxels) => Math.ceil(nVoxels / CHUNK_DIM);
