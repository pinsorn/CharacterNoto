// node test (no framework): node src/lib/voxel/imageChunker.test.mjs
// Proves the per-chunk sampler (imageChunker) matches the whole-image path (imageTerrain).
import { chunkFromImage, avgBlockRGB } from './imageChunker.js';
import { imageToHeights, imageToBiomes } from './imageTerrain.js';

let passed = 0, failed = 0;
const ok = (cond, msg) => { if (cond) passed++; else { failed++; console.error('FAIL:', msg); } };

// --- synthetic images -----------------------------------------------------
const solid = (w, h, [r, g, b]) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = 255; }
  return { width: w, height: h, data };
};
// Varied 8×8 so top-left and bottom-right regions hold different values.
const img8 = (() => {
  const w = 8, h = 8, data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    data[i] = x * 32;            // r 0..224
    data[i + 1] = y * 32;        // g 0..224
    data[i + 2] = (x * y) * 4;   // b (clamped by Uint8ClampedArray)
    data[i + 3] = 255;
  }
  return { width: w, height: h, data };
})();
// Varied 4×4 for the single-chunk parity check.
const img4 = (() => {
  const w = 4, h = 4, data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    data[i] = 30 + x * 50; data[i + 1] = 200 - y * 40; data[i + 2] = (x + y) * 28;
    data[i + 3] = 255;
  }
  return { width: w, height: h, data };
})();

const onLayers = { height: { on: true }, biome: { on: true }, object: { on: false } };

// --- region match: 2×2 chunk grid over the 8×8 image (dim=4, R=1) ----------
// With R=1 the whole-image transform at size 8 samples one pixel per cell, exactly
// like the per-chunk sampler — so each chunk cell must equal the global cell it covers.
{
  const wholeH = imageToHeights(img8, 8);
  const wholeB = imageToBiomes(img8, 8);
  const c00 = chunkFromImage(img8, 0, 0, 4, 1, onLayers); // top-left global [0,4)×[0,4)
  const c11 = chunkFromImage(img8, 1, 1, 4, 1, onLayers); // bottom-right global [4,8)×[4,8)
  ok(c00.height.length === 16 && c00.biome.length === 16, 'chunk arrays length = dim*dim');
  let h00 = true, b00 = true, h11 = true, b11 = true;
  for (let lz = 0; lz < 4; lz++) for (let lx = 0; lx < 4; lx++) {
    const local = lz * 4 + lx;
    // chunk (0,0): global (lx,lz)
    if (c00.height[local] !== wholeH[lz * 8 + lx]) h00 = false;
    if (c00.biome[local] !== wholeB[lz * 8 + lx]) b00 = false;
    // chunk (1,1): global (4+lx, 4+lz)
    const gx = 4 + lx, gz = 4 + lz;
    if (c11.height[local] !== wholeH[gz * 8 + gx]) h11 = false;
    if (c11.biome[local] !== wholeB[gz * 8 + gx]) b11 = false;
  }
  ok(h00, 'chunk (0,0) height matches top-left 4×4 region');
  ok(b00, 'chunk (0,0) biome matches top-left 4×4 region');
  ok(h11, 'chunk (1,1) height matches bottom-right 4×4 region');
  ok(b11, 'chunk (1,1) biome matches bottom-right 4×4 region');
  // sanity: the two regions are actually different (test would be vacuous otherwise)
  ok(JSON.stringify([...c00.height]) !== JSON.stringify([...c11.height]), 'regions differ (non-vacuous)');
}

// --- PARITY: single chunk over a 4×4 image == whole-image path -------------
{
  const c = chunkFromImage(img4, 0, 0, 4, 1, onLayers);
  const wholeH = imageToHeights(img4, 4); // default opts: maxHeight 24, invert false, base 1
  const wholeB = imageToBiomes(img4, 4);
  let hEq = c.height.length === wholeH.length;
  for (let i = 0; i < wholeH.length; i++) if (c.height[i] !== wholeH[i]) hEq = false;
  let bEq = c.biome.length === wholeB.length;
  for (let i = 0; i < wholeB.length; i++) if (c.biome[i] !== wholeB[i]) bEq = false;
  ok(hEq, 'parity: chunk height === imageToHeights (whole-image)');
  ok(bEq, 'parity: chunk biome === imageToBiomes (whole-image)');
}

// --- avgBlockRGB ----------------------------------------------------------
{
  // R=1 → single pixel; img4 pixel (1,0): r=30+50=80, g=200, b=28
  const [r, g, b] = avgBlockRGB(img4, 1, 0, 1);
  ok(r === 80 && g === 200 && b === 28, 'avgBlockRGB R=1 returns the exact pixel');
  // R=2 over a 4×4 image: cell (0,0) averages the 2×2 top-left block
  const avg = avgBlockRGB(img4, 0, 0, 2);
  let er = 0, eg = 0, eb = 0;
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { const i = (y * 4 + x) * 4; er += img4.data[i]; eg += img4.data[i + 1]; eb += img4.data[i + 2]; }
  ok(Math.abs(avg[0] - er / 4) < 1e-9 && Math.abs(avg[1] - eg / 4) < 1e-9 && Math.abs(avg[2] - eb / 4) < 1e-9, 'avgBlockRGB R=2 averages the 2×2 block');
}

// --- objects: deterministic, global coords, threshold ----------------------
{
  const dark = solid(4, 4, [0, 0, 0]); // lum 0 → all eligible
  const objLayers = { height: { on: true }, biome: { on: false }, object: { on: true, density: 1, threshold: 0.5 } };
  const a = chunkFromImage(dark, 0, 0, 4, 1, objLayers).objects;
  const b = chunkFromImage(dark, 0, 0, 4, 1, objLayers).objects;
  ok(JSON.stringify(a) === JSON.stringify(b), 'objects deterministic (same args twice → identical)');
  ok(a.length === 16, 'full density dark chunk → 16 objects');
  ok(a.every((o) => o.scale >= 0.8 && o.scale <= 1.2 && o.yaw >= 0 && o.yaw < Math.PI * 2), 'objects valid yaw/scale fields');
  ok(a.every((o) => o.pos.x % 1 === 0.5 && o.pos.z % 1 === 0.5), 'objects centered at +0.5');
  // GLOBAL coords: chunk (1,1) over an 8×8 dark image → cells gx,gz ∈ [4,8) → pos ≥ 4.5
  const dark8 = solid(8, 8, [0, 0, 0]);
  const c11 = chunkFromImage(dark8, 1, 1, 4, 1, objLayers).objects;
  ok(c11.length === 16 && c11.every((o) => o.pos.x >= 4.5 && o.pos.z >= 4.5 && o.pos.x < 8 && o.pos.z < 8), 'objects use GLOBAL coords offset by chunk origin');
  // object y uses the column height (height layer on)
  const heights = chunkFromImage(dark, 0, 0, 4, 1, objLayers).height;
  ok(a.every((o) => o.pos.y === heights[(o.pos.z - 0.5) * 4 + (o.pos.x - 0.5)]), 'object y = column height when height layer on');
  // height layer OFF → object y = 1
  const offH = chunkFromImage(dark, 0, 0, 4, 1, { height: { on: false }, biome: { on: false }, object: { on: true, density: 1, threshold: 0.5 } }).objects;
  ok(offH.every((o) => o.pos.y === 1), 'object y = 1 when height layer off');
  // all-white, threshold 0.5 → zero objects (lum 1 ≥ 0.5)
  const white = chunkFromImage(solid(4, 4, [255, 255, 255]), 0, 0, 4, 1, objLayers).objects;
  ok(white.length === 0, 'all-white threshold 0.5 → 0 objects');
}

// --- disabled layers + past-edge defaults ----------------------------------
{
  const allOff = chunkFromImage(img4, 0, 0, 4, 1, { height: { on: false }, biome: { on: false }, object: { on: false } });
  ok([...allOff.height].every((h) => h === 1), 'height off → all base (default 1)');
  ok([...allOff.biome].every((b) => b === 0), 'biome off → all 0');
  ok(allOff.objects.length === 0, 'objects off → []');
  // chunk (1,1) over a 4×4 image: every cell starts past the edge → empty defaults
  const past = chunkFromImage(img4, 1, 1, 4, 1, { ...onLayers, object: { on: true, density: 1, threshold: 1 } });
  ok([...past.height].every((h) => h === 1), 'past-edge cells → height base (1)');
  ok([...past.biome].every((b) => b === 0), 'past-edge cells → biome 0');
  ok(past.objects.length === 0, 'past-edge cells → no objects');
}

console.log(`imageChunker: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
