// Voxel world model (spec §4): hybrid heightmap + biome + overrides + carves, composed into
// a dense colour-key grid for the mesher. The map is a single square chunk whose side length
// (`size`) is per-map and adjustable — every index/bound reads `ch.size`, so there is no global
// size constant in the hot paths (CHUNK is only the default for a fresh map).
import { CHUNK, WORLD_HEIGHT, surfaceKey, subKey, blockKey } from './types.js';

const idx = (ch, x, z) => z * ch.size + x;
const key3 = (x, y, z) => `${x},${y},${z}`;
const denseIdxN = (size, x, y, z) => (y * size + z) * size + x;

export const inBounds = (ch, x, y, z) =>
  x >= 0 && x < ch.size && z >= 0 && z < ch.size && y >= 0 && y < WORLD_HEIGHT;
const inCol = (ch, x, z) => x >= 0 && x < ch.size && z >= 0 && z < ch.size;

/** Fresh square chunk of `size` columns/side, flat ground at `base`, one biome. */
export function createChunk(cx = 0, cz = 0, base = 6, biomeId = 0, size = CHUNK) {
  const height = new Int16Array(size * size).fill(base);
  const biome = new Uint8Array(size * size).fill(biomeId);
  return { cx, cz, size, height, biome, overrides: new Map(), carves: new Set(), dirty: true };
}

/** Resize a chunk to `newSize`, preserving the overlapping region (top-left aligned). */
export function resizeChunk(ch, newSize) {
  if (newSize === ch.size) return ch;
  const next = createChunk(ch.cx, ch.cz, 6, 0, newSize);
  const n = Math.min(ch.size, newSize);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      next.height[z * newSize + x] = ch.height[z * ch.size + x];
      next.biome[z * newSize + x] = ch.biome[z * ch.size + x];
    }
  }
  for (const [k, t] of ch.overrides) {
    const [x, y, z] = k.split(',').map(Number);
    if (x < newSize && z < newSize) next.overrides.set(k, t);
  }
  for (const k of ch.carves) {
    const [x, y, z] = k.split(',').map(Number);
    if (x < newSize && z < newSize) next.carves.add(k);
  }
  next.dirty = true;
  return next;
}

export const getHeight = (ch, x, z) => ch.height[idx(ch, x, z)];
export const getBiome = (ch, x, z) => ch.biome[idx(ch, x, z)];

/** Compose a chunk → dense Uint16 colour-key grid (0 = empty). Order: fill → carve → override. */
export function composeDense(ch) {
  const { size } = ch;
  const dense = new Uint16Array(size * WORLD_HEIGHT * size);
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const h = Math.max(0, Math.min(WORLD_HEIGHT, ch.height[z * size + x]));
      const b = ch.biome[z * size + x];
      for (let y = 0; y < h; y++) {
        dense[denseIdxN(size, x, y, z)] = y === h - 1 ? surfaceKey(b) : subKey(b);
      }
    }
  }
  for (const c of ch.carves) {
    const [x, y, z] = c.split(',').map(Number);
    if (inBounds(ch, x, y, z)) dense[denseIdxN(size, x, y, z)] = 0;
  }
  for (const [c, t] of ch.overrides) {
    const [x, y, z] = c.split(',').map(Number);
    if (inBounds(ch, x, y, z)) dense[denseIdxN(size, x, y, z)] = blockKey(t);
  }
  return dense;
}

// --- edits (mutate + mark dirty) -----------------------------------------
export function setColumnHeight(ch, x, z, h) {
  if (!inCol(ch, x, z)) return;
  ch.height[idx(ch, x, z)] = Math.max(0, Math.min(WORLD_HEIGHT - 1, Math.round(h)));
  ch.dirty = true;
}
export function addHeight(ch, x, z, delta) {
  if (!inCol(ch, x, z)) return;
  setColumnHeight(ch, x, z, ch.height[idx(ch, x, z)] + delta);
}
export function paintBiome(ch, x, z, biomeId) {
  if (!inCol(ch, x, z)) return;
  ch.biome[idx(ch, x, z)] = biomeId;
  ch.dirty = true;
}
export function placeBlock(ch, x, y, z, blockId) {
  if (!inBounds(ch, x, y, z)) return;
  ch.carves.delete(key3(x, y, z));
  ch.overrides.set(key3(x, y, z), blockId);
  ch.dirty = true;
}
/** Remove a voxel: drop an override if one sits there, else carve the terrain fill. */
export function eraseVoxel(ch, x, y, z) {
  if (!inBounds(ch, x, y, z)) return;
  const k = key3(x, y, z);
  if (ch.overrides.has(k)) ch.overrides.delete(k);
  else ch.carves.add(k);
  ch.dirty = true;
}

/** Top solid y of a column from the dense grid (for surface-snapping tokens). Needs the size. */
export function surfaceY(dense, x, z, size) {
  for (let y = WORLD_HEIGHT - 1; y >= 0; y--) if (dense[denseIdxN(size, x, y, z)]) return y + 1;
  return 0;
}

/** Column array index (test/diagnostic helper). */
export const columnIndex = (x, z, size = CHUNK) => z * size + x;
export { key3 as cellKey };
