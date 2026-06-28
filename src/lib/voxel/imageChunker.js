// Per-chunk image → terrain sampler for UNLIMITED image→voxel generation.
// Computes ONE chunk's sub-region straight from the source image — never building a
// whole-map array — so Generate can stream chunk-by-chunk to disk. The per-cell math
// mirrors the whole-image transforms in `./imageTerrain.js` (luminance height, nearest
// biome, deterministic dark-cell scatter); this module just restricts the work to the
// global cells a single chunk (cx,cz) covers. Pure: imports only `./types.js`, no DOM/three.
//
// Coords (global, 1 unit = 1 voxel): chunk (cx,cz) of side `dim` covers global cells
//   gx ∈ [cx*dim, cx*dim+dim), gz ∈ [cz*dim, cz*dim+dim).
// Resolution R = image px per voxel, so global cell (gx,gz) samples the image pixel block
//   [gx*R, gx*R+R) × [gz*R, gz*R+R)  (clamped to image bounds).
// Cells whose block starts past the image edge → lowest/empty: height=base, biome 0, no object.
import { BIOMES, WORLD_HEIGHT, hex, objectPropForColor } from './types.js';

/** Rec.601 luminance (0..255) of an RGB triple — identical to imageTerrain. */
const lum601 = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

// Deterministic 32-bit hash of two ints → uint32 (same as imageTerrain; replaces Math.random).
function hash2(x, z) {
  let h = (Math.imul(x, 374761393) + Math.imul(z, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

const TAU = Math.PI * 2;

// Biome surface colours scaled to 0..255 — built once, exactly as imageTerrain does.
const BIOME_PAL = BIOMES.map((b) => { const [r, g, bl] = hex(b.surface); return [r * 255, g * 255, bl * 255, b.id]; });

/**
 * Average RGB (0..255) of the source-image pixel block a global cell samples.
 * Block = [gx*R, gx*R+R) × [gz*R, gz*R+R), floored to integer pixels and clamped to
 * image bounds. Guarantees ≥1 source pixel when the block starts inside the image
 * (mirrors imageTerrain.sampleResize's upscale guard). Returns float averages.
 * @param {{width:number,height:number,data:Uint8ClampedArray}} img
 * @param {number} gx global cell x
 * @param {number} gz global cell z
 * @param {number} R image px per voxel
 * @returns {[number,number,number]} average [r,g,b], 0..255
 */
export function avgBlockRGB(img, gx, gz, R) {
  const { width, height, data } = img;
  let px0 = Math.floor(gx * R);
  let pz0 = Math.floor(gz * R);
  let px1 = Math.floor((gx + 1) * R);
  let pz1 = Math.floor((gz + 1) * R);
  if (px0 < 0) px0 = 0;
  if (pz0 < 0) pz0 = 0;
  if (px1 <= px0) px1 = px0 + 1; // always sample ≥1 source column
  if (pz1 <= pz0) pz1 = pz0 + 1; // always sample ≥1 source row
  if (px1 > width) px1 = width;
  if (pz1 > height) pz1 = height;
  let r = 0, g = 0, b = 0, n = 0;
  for (let py = pz0; py < pz1; py++) {
    for (let px = px0; px < px1; px++) {
      const i = (py * width + px) * 4;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
  }
  if (!n) return [0, 0, 0];
  return [r / n, g / n, b / n];
}

/**
 * @typedef {Object} ChunkLayers
 * @property {{on:boolean,maxHeight?:number,invert?:boolean,base?:number}} [height]
 * @property {{on:boolean}} [biome]
 * @property {{on:boolean,density?:number}} [object] colour-keyed (OBJECT_KEYS) → prop; density gates count
 */

/**
 * Generate ONE chunk's terrain sub-region directly from a (possibly huge) image.
 *
 * Iterates only the chunk's dim×dim columns, offsetting each local (lx,lz) by the chunk
 * origin to a global cell (gx = cx*dim + lx, gz = cz*dim + lz), then samples just that
 * cell's pixel block via {@link avgBlockRGB}. No whole-map array is ever allocated.
 *
 * Per-cell math matches imageTerrain:
 *   height = base + round((lum/255)*(maxHeight-base))  (invert → t=1-t), clamped 0..WORLD_HEIGHT-1.
 *   biome  = nearest BIOMES.surface (×255) by Euclidean RGB.
 *   object = nearest OBJECT_KEYS colour → that prop (null = background, skipped), emitted with prob
 *            `density` via a DETERMINISTIC hash of the GLOBAL (gx,gz); yaw/scale/seed bit-sliced from it.
 * Cells whose block starts past the image edge → height=base, biome 0, no object.
 *
 * @param {{width:number,height:number,data:Uint8ClampedArray}} img Canvas ImageData (RGBA).
 * @param {number} cx chunk x
 * @param {number} cz chunk z
 * @param {number} dim chunk side length in voxels (CHUNK_DIM)
 * @param {number} R image px per voxel
 * @param {ChunkLayers} [layers]
 * @returns {{height:Int16Array,biome:Uint8Array,objects:Array<{propId:string,pos:{x:number,y:number,z:number},yaw:number,scale:number,seed:number}>}}
 *   height/biome are length dim*dim, row-major local index = lz*dim + lx.
 *   objects use GLOBAL coords: pos = {x: gx+0.5, y: heightHere, z: gz+0.5}.
 */
export function chunkFromImage(img, cx, cz, dim, R, layers = {}) {
  const hL = layers.height || {};
  const bL = layers.biome || {};
  const oL = layers.object || {};
  const heightOn = hL.on === true;
  const biomeOn = bL.on === true;
  const objectOn = oL.on === true;
  const maxHeight = hL.maxHeight ?? 24;
  const invert = hL.invert === true;
  const base = hL.base ?? 1;
  const density = oL.density ?? 0.4;

  const { width, height: imgH } = img;
  const n = dim * dim;
  const heightOut = new Int16Array(n);
  const biomeOut = new Uint8Array(n); // defaults to 0
  const objects = [];

  // Disabled height → all `base`; disabled biome → all 0 (already zeroed).
  if (!heightOn) heightOut.fill(base);

  // Fast exit: nothing to compute per-cell.
  if (!heightOn && !biomeOn && !objectOn) {
    return { height: heightOut, biome: biomeOut, objects };
  }

  const x0 = cx * dim;
  const z0 = cz * dim;
  for (let lz = 0; lz < dim; lz++) {
    const gz = z0 + lz;
    const rowPastEdge = Math.floor(gz * R) >= imgH; // whole row's block starts past the image
    for (let lx = 0; lx < dim; lx++) {
      const gx = x0 + lx;
      const local = lz * dim + lx;
      const pastEdge = rowPastEdge || Math.floor(gx * R) >= width;
      if (pastEdge) {
        // lowest / empty: height=base, biome 0, no object
        if (heightOn) heightOut[local] = base;
        continue;
      }
      const [r, g, b] = avgBlockRGB(img, gx, gz, R);

      if (heightOn) {
        let t = lum601(r, g, b) / 255;
        if (invert) t = 1 - t;
        let h = base + Math.round(t * (maxHeight - base));
        if (h < 0) h = 0;
        else if (h > WORLD_HEIGHT - 1) h = WORLD_HEIGHT - 1;
        heightOut[local] = h;
      }

      if (biomeOn) {
        let best = 0, bestD = Infinity;
        for (const p of BIOME_PAL) {
          const dr = r - p[0], dg = g - p[1], db = b - p[2];
          const d = dr * dr + dg * dg + db * db;
          if (d < bestD) { bestD = d; best = p[3]; }
        }
        biomeOut[local] = best;
      }

      if (objectOn) {
        const pid = objectPropForColor(r, g, b); // pixel colour → which prop (null = background)
        if (!pid) continue;
        const hsh = hash2(gx, gz); // GLOBAL coords → deterministic across chunks
        const gate = (hsh & 0xffff) / 0x10000;
        if (gate >= density) continue;
        const yaw = (((hsh >>> 16) & 0xff) / 0x100) * TAU;
        const scale = 0.8 + (((hsh >>> 24) & 0xff) / 0x100) * 0.4; // 0.8..1.2
        const y = heightOn ? heightOut[local] : 1; // spec: 1 when height layer off
        objects.push({ propId: pid, pos: { x: gx + 0.5, y, z: gz + 0.5 }, yaw, scale, seed: hsh });
      }
    }
  }

  return { height: heightOut, biome: biomeOut, objects };
}
