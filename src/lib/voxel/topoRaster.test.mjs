// Runnable check for the top-view rasterizer: node src/lib/voxel/topoRaster.test.mjs
// No framework — counts passes and prints `topoRaster: N passed, 0 failed`.
import { rasterizeTopview } from './topoRaster.js';
import { BIOMES, WORLD_HEIGHT, hex } from './types.js';

let passed = 0;
let failed = 0;

/** @param {boolean} cond @param {string} msg */
function check(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${msg}`);
  }
}

/** abs diff per channel ≤ tol (robust to any rounding mode) */
function approxRGB(got, want, tol, msg) {
  const ok =
    Math.abs(got[0] - want[0]) <= tol &&
    Math.abs(got[1] - want[1]) <= tol &&
    Math.abs(got[2] - want[2]) <= tol;
  check(ok, `${msg} (got [${got}], want ≈ [${want.map((n) => n.toFixed(1))}])`);
}

// --- fake 2×2 grid of dim=4 chunks --------------------------------------
const dim = 4;
const N = dim * dim;
/** @param {number} biome @param {number} h */
function makeChunk(biome, h) {
  return { height: new Int16Array(N).fill(h), biome: new Uint8Array(N).fill(biome) };
}
const c00 = makeChunk(0, 4); // grass, low
const c11 = makeChunk(3, 32); // snow, high
/** @type {(cx:number,cz:number)=>any} */
const getChunk = (cx, cz) => {
  if (cx === 0 && cz === 0) return c00;
  if (cx === 1 && cz === 1) return c11;
  return null; // (0,1) and (1,0) unloaded
};

const bg = [158, 199, 232];
const { width, height, data } = rasterizeTopview(getChunk, 2, 2, dim, { maxPx: 1024, bg });

/** read pixel [r,g,b,a] at (x,y) */
const pix = (x, y) => {
  const i = (y * width + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
};

/** expected shaded surface 0..255 for a biome id + height */
function shaded(biomeId, h) {
  const [r, g, b] = hex(BIOMES[biomeId].surface);
  const shade = Math.min(1, Math.max(0, 0.55 + 0.45 * (h / WORLD_HEIGHT)));
  return [r * 255 * shade, g * 255 * shade, b * 255 * shade];
}

// --- size sanity: ≤ maxPx, and == map voxels when small -----------------
check(width <= 1024 && height <= 1024, 'output within maxPx');
check(width === 8 && height === 8, `output equals map voxels when small (got ${width}x${height})`);
check(data.length === width * height * 4, 'data length = w*h*4');

// --- chunk(0,0): grass, low height --------------------------------------
const grass = pix(1, 1); // gx=1,gz=1 → chunk(0,0)
approxRGB(grass, shaded(0, 4), 1, 'chunk(0,0) pixel ≈ grass surface shaded');
check(grass[3] === 255, 'grass pixel alpha = 255');

// --- chunk(1,1): snow, high height --------------------------------------
const snow = pix(6, 6); // gx=6,gz=6 → chunk(1,1)
approxRGB(snow, shaded(3, 32), 1, 'chunk(1,1) pixel ≈ snow surface shaded');
check(
  snow[0] > grass[0] && snow[1] > grass[1] && snow[2] > grass[2],
  `snow brighter than grass (snow [${snow.slice(0, 3)}] vs grass [${grass.slice(0, 3)}])`,
);

// --- null chunks → background -------------------------------------------
const nullA = pix(1, 6); // cx=0,cz=1 → null
const nullB = pix(6, 1); // cx=1,cz=0 → null
check(nullA[0] === bg[0] && nullA[1] === bg[1] && nullA[2] === bg[2] && nullA[3] === 255, 'null chunk (0,1) == bg');
check(nullB[0] === bg[0] && nullB[1] === bg[1] && nullB[2] === bg[2] && nullB[3] === 255, 'null chunk (1,0) == bg');

// --- downsample path: longer side capped, aspect kept, no upscale -------
const big = rasterizeTopview(getChunk, 2, 2, dim, { maxPx: 4 });
check(big.width === 4 && big.height === 4, `downsampled to maxPx (got ${big.width}x${big.height})`);

console.log(`topoRaster: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
