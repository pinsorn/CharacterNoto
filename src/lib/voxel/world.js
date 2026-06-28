// Voxel world model (spec §4): hybrid heightmap + biome + overrides + carves, composed into
// a dense colour-key grid for the mesher. S0 = a single chunk; streaming (§4) layers on later
// behind the same edit/compose API.
import { CHUNK, WORLD_HEIGHT, surfaceKey, subKey, blockKey } from './types.js';

const col = (x, z) => z * CHUNK + x;
const key3 = (x, y, z) => `${x},${y},${z}`;
const denseIdx = (x, y, z) => (y * CHUNK + z) * CHUNK + x;
export const inBounds = (x, y, z) =>
  x >= 0 && x < CHUNK && z >= 0 && z < CHUNK && y >= 0 && y < WORLD_HEIGHT;

/** Fresh chunk, flat ground at `base` height, all one biome. */
export function createChunk(cx = 0, cz = 0, base = 6, biomeId = 0) {
  const height = new Int16Array(CHUNK * CHUNK).fill(base);
  const biome = new Uint8Array(CHUNK * CHUNK).fill(biomeId);
  return { cx, cz, height, biome, overrides: new Map(), carves: new Set(), dirty: true };
}

export const getHeight = (ch, x, z) => ch.height[col(x, z)];
export const getBiome = (ch, x, z) => ch.biome[col(x, z)];

/** Compose a chunk → dense Uint16 colour-key grid (0 = empty). Order: fill → carve → override. */
export function composeDense(ch) {
  const dense = new Uint16Array(CHUNK * WORLD_HEIGHT * CHUNK);
  for (let z = 0; z < CHUNK; z++) {
    for (let x = 0; x < CHUNK; x++) {
      const h = Math.max(0, Math.min(WORLD_HEIGHT, ch.height[col(x, z)]));
      const b = ch.biome[col(x, z)];
      for (let y = 0; y < h; y++) {
        dense[denseIdx(x, y, z)] = y === h - 1 ? surfaceKey(b) : subKey(b);
      }
    }
  }
  for (const c of ch.carves) {
    const [x, y, z] = c.split(',').map(Number);
    if (inBounds(x, y, z)) dense[denseIdx(x, y, z)] = 0;
  }
  for (const [c, t] of ch.overrides) {
    const [x, y, z] = c.split(',').map(Number);
    if (inBounds(x, y, z)) dense[denseIdx(x, y, z)] = blockKey(t);
  }
  return dense;
}

// --- edits (mutate + mark dirty) -----------------------------------------
export function setColumnHeight(ch, x, z, h) {
  if (x < 0 || x >= CHUNK || z < 0 || z >= CHUNK) return;
  ch.height[col(x, z)] = Math.max(0, Math.min(WORLD_HEIGHT - 1, Math.round(h)));
  ch.dirty = true;
}
export function addHeight(ch, x, z, delta) {
  if (x < 0 || x >= CHUNK || z < 0 || z >= CHUNK) return;
  setColumnHeight(ch, x, z, ch.height[col(x, z)] + delta);
}
export function paintBiome(ch, x, z, biomeId) {
  if (x < 0 || x >= CHUNK || z < 0 || z >= CHUNK) return;
  ch.biome[col(x, z)] = biomeId;
  ch.dirty = true;
}
export function placeBlock(ch, x, y, z, blockId) {
  if (!inBounds(x, y, z)) return;
  ch.carves.delete(key3(x, y, z));
  ch.overrides.set(key3(x, y, z), blockId);
  ch.dirty = true;
}
/** Remove a voxel: carve terrain fill, or drop an override if one sits there. */
export function eraseVoxel(ch, x, y, z) {
  if (!inBounds(x, y, z)) return;
  const k = key3(x, y, z);
  if (ch.overrides.has(k)) ch.overrides.delete(k);
  else ch.carves.add(k);
  ch.dirty = true;
}

/** Top solid y of a column from the dense grid (for surface-snapping tokens later). */
export function surfaceY(dense, x, z) {
  for (let y = WORLD_HEIGHT - 1; y >= 0; y--) if (dense[denseIdx(x, y, z)]) return y + 1;
  return 0;
}

export { col as columnIndex, key3 as cellKey, denseIdx };
