// image → terrain: pure pixel→voxel transforms (NO DOM, NO three) so it runs under node + tests.
// Input image is a plain `{ width, height, data }` where `data` is an RGBA Uint8ClampedArray
// (length width*height*4) — i.e. a Canvas ImageData. The Svelte panel does the canvas/getImageData;
// this module only crunches numbers. Cells are row-major: index = z*size + x.
import { BIOMES, WORLD_HEIGHT, hex, objectPropForColor } from './types.js';

/**
 * Nearest-area downsample (also upscales) an image to size×size, returning average RGB (0..255).
 * @param {{width:number,height:number,data:Uint8ClampedArray}} img
 * @param {number} size
 * @returns {Float32Array} length size*size*3, row-major (z*size+x)*3 + {0:r,1:g,2:b}
 */
export function sampleResize(img, size) {
  const { width, height, data } = img;
  const out = new Float32Array(size * size * 3);
  for (let z = 0; z < size; z++) {
    const sz0 = Math.floor((z * height) / size);
    let sz1 = Math.floor(((z + 1) * height) / size);
    if (sz1 <= sz0) sz1 = sz0 + 1; // upscale: always sample ≥1 source row
    for (let x = 0; x < size; x++) {
      const sx0 = Math.floor((x * width) / size);
      let sx1 = Math.floor(((x + 1) * width) / size);
      if (sx1 <= sx0) sx1 = sx0 + 1;
      let r = 0, g = 0, b = 0, n = 0;
      for (let sy = sz0; sy < sz1 && sy < height; sy++) {
        for (let sx = sx0; sx < sx1 && sx < width; sx++) {
          const i = (sy * width + sx) * 4;
          r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
        }
      }
      const o = (z * size + x) * 3;
      if (n) { out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; }
    }
  }
  return out;
}

/** Rec.601 luminance (0..255) of an RGB triple. */
const lum601 = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/**
 * Brightness → elevation. height = base + round((lum/255)*(maxHeight-base)), optionally inverted.
 * @param {{width:number,height:number,data:Uint8ClampedArray}} img
 * @param {number} size
 * @param {{maxHeight?:number,invert?:boolean,base?:number}} [opts]
 * @returns {Int16Array} length size*size, clamped 0..WORLD_HEIGHT-1
 */
export function imageToHeights(img, size, opts = {}) {
  const { maxHeight = 24, invert = false, base = 1 } = opts;
  const rgb = sampleResize(img, size);
  const out = new Int16Array(size * size);
  for (let i = 0; i < size * size; i++) {
    const o = i * 3;
    let t = lum601(rgb[o], rgb[o + 1], rgb[o + 2]) / 255;
    if (invert) t = 1 - t;
    let h = base + Math.round(t * (maxHeight - base));
    if (h < 0) h = 0;
    else if (h > WORLD_HEIGHT - 1) h = WORLD_HEIGHT - 1;
    out[i] = h;
  }
  return out;
}

/**
 * Pixel colour → nearest biome id (Euclidean RGB vs each biome's `surface` colour).
 * @param {{width:number,height:number,data:Uint8ClampedArray}} img
 * @param {number} size
 * @returns {Uint8Array} length size*size of biome ids
 */
export function imageToBiomes(img, size) {
  const rgb = sampleResize(img, size);
  // biome surface colours scaled to 0..255 (computed once)
  const pal = BIOMES.map((b) => { const [r, g, bl] = hex(b.surface); return [r * 255, g * 255, bl * 255, b.id]; });
  const out = new Uint8Array(size * size);
  for (let i = 0; i < size * size; i++) {
    const o = i * 3, cr = rgb[o], cg = rgb[o + 1], cb = rgb[o + 2];
    let best = 0, bestD = Infinity;
    for (const p of pal) {
      const dr = cr - p[0], dg = cg - p[1], db = cb - p[2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bestD) { bestD = d; best = p[3]; }
    }
    out[i] = best;
  }
  return out;
}

// Deterministic 32-bit hash of two ints → uint32 (replaces Math.random for reproducible scatter).
function hash2(x, z) {
  let h = (Math.imul(x, 374761393) + Math.imul(z, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

const TAU = Math.PI * 2;

/**
 * Colour-keyed cells → scattered prop instances: each cell's colour picks WHICH prop via
 * OBJECT_KEYS (nearest-match; background → none), gated by `density`. Deterministic.
 * @param {{width:number,height:number,data:Uint8ClampedArray}} img
 * @param {number} size
 * @param {{density?:number,heightAt?:(gx:number,gz:number)=>number}} [opts]
 * @returns {Array<{propId:string,pos:{x:number,y:number,z:number},yaw:number,scale:number,seed:number}>}
 */
export function imageToObjects(img, size, opts = {}) {
  const { density = 0.4, heightAt = () => 1 } = opts;
  const rgb = sampleResize(img, size);
  const out = [];
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const o = (z * size + x) * 3;
      const pid = objectPropForColor(rgb[o], rgb[o + 1], rgb[o + 2]); // colour → prop (null = none)
      if (!pid) continue;
      const h = hash2(x, z);
      // bit-slice the single hash for gate / yaw / scale (all derived "from the hash")
      const gate = (h & 0xffff) / 0x10000;
      if (gate >= density) continue;
      const yaw = (((h >>> 16) & 0xff) / 0x100) * TAU;
      const scale = 0.8 + (((h >>> 24) & 0xff) / 0x100) * 0.4; // 0.8..1.2
      out.push({ propId: pid, pos: { x: x + 0.5, y: heightAt(x, z), z: z + 0.5 }, yaw, scale, seed: h });
    }
  }
  return out;
}
