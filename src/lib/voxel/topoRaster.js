// Data-driven top-down rasterizer for a streaming voxel map.
// Produces a downsampled RGBA top-view straight from chunk data (biome surface
// colour shaded by column height) so the Map-tab background scales to any map
// size without rendering millions of voxels in 3D.
//
// PURE: returns raw RGBA only — no canvas / no DOM. The caller wraps `data`
// into an ImageData / canvas. Node-importable; imports only ./types.js.

import { BIOMES, WORLD_HEIGHT, hex } from './types.js';

/** @typedef {{ height: Int16Array, biome: Uint8Array }} Chunk */

// Biome id → surface colour as 0..255 RGB, precomputed once at module load.
const SURFACE_255 = BIOMES.map((b) => {
  const [r, g, bl] = hex(b.surface);
  return [r * 255, g * 255, bl * 255];
});

/** @param {number} v @param {number} lo @param {number} hi */
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Rasterize a whole streaming voxel map to a bounded top-down RGBA buffer.
 *
 * Output keeps the map's aspect ratio, scaled so the longer side is ≤ `maxPx`
 * and never upscaled beyond 1 px per voxel. Each output pixel maps (nearest) to
 * one map voxel cell; its colour is that cell's biome surface multiplied by a
 * height shade `0.55 + 0.45*(h/WORLD_HEIGHT)` (clamped to [0,1]). Cells whose
 * chunk is null (unloaded/empty) get the background colour. Alpha is always 255.
 *
 * @param {(cx:number, cz:number) => (Chunk|null)} getChunk loaded chunk or null
 * @param {number} wChunks map width in chunks
 * @param {number} hChunks map height in chunks
 * @param {number} dim chunk side length in voxels (= CHUNK_DIM in production)
 * @param {{ maxPx?: number, bg?: [number,number,number] }} [opts]
 * @returns {{ width:number, height:number, data:Uint8ClampedArray }}
 */
export function rasterizeTopview(getChunk, wChunks, hChunks, dim, opts = {}) {
  const maxPx = opts.maxPx ?? 1024;
  const bg = opts.bg ?? [158, 199, 232];

  const mapW = wChunks * dim; // whole-map voxel width  (x)
  const mapH = hChunks * dim; // whole-map voxel height (z)

  // Scale so the longer side ≤ maxPx; never upscale (cap at 1 px/voxel).
  const scale = Math.min(1, maxPx / Math.max(mapW, mapH));
  const width = Math.max(1, Math.round(mapW * scale));
  const height = Math.max(1, Math.round(mapH * scale));

  const data = new Uint8ClampedArray(width * height * 4);

  // Memoize chunk fetches: at most wChunks*hChunks entries, sync getChunk.
  /** @type {Map<number, Chunk|null>} */
  const cache = new Map();
  const fetchChunk = (cx, cz) => {
    const key = cz * wChunks + cx;
    let c = cache.get(key);
    if (c === undefined) {
      c = getChunk(cx, cz) || null;
      cache.set(key, c);
    }
    return c;
  };

  for (let py = 0; py < height; py++) {
    // Output row → map voxel z (nearest cell).
    const gz = Math.min(mapH - 1, Math.floor((py * mapH) / height));
    const cz = Math.floor(gz / dim);
    const lz = gz - cz * dim;
    const rowBase = py * width * 4;

    for (let px = 0; px < width; px++) {
      const gx = Math.min(mapW - 1, Math.floor((px * mapW) / width));
      const cx = Math.floor(gx / dim);
      const lx = gx - cx * dim;
      const o = rowBase + px * 4;

      const chunk = fetchChunk(cx, cz);
      if (!chunk) {
        data[o] = bg[0];
        data[o + 1] = bg[1];
        data[o + 2] = bg[2];
        data[o + 3] = 255;
        continue;
      }

      const idx = lz * dim + lx;
      const h = chunk.height[idx];
      const surf = SURFACE_255[chunk.biome[idx]] || [255, 0, 255];
      const shade = clamp(0.55 + 0.45 * (h / WORLD_HEIGHT), 0, 1);

      data[o] = surf[0] * shade;
      data[o + 1] = surf[1] * shade;
      data[o + 2] = surf[2] * shade;
      data[o + 3] = 255;
    }
  }

  return { width, height, data };
}
