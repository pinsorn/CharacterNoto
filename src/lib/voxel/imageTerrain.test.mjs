// node test (no framework): node src/lib/voxel/imageTerrain.test.mjs
import { sampleResize, imageToHeights, imageToBiomes, imageToObjects } from './imageTerrain.js';

let passed = 0, failed = 0;
const ok = (cond, msg) => { if (cond) passed++; else { failed++; console.error('FAIL:', msg); } };

// --- synthetic images -----------------------------------------------------
const solid = (w, h, [r, g, b]) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = 255; }
  return { width: w, height: h, data };
};
// 4×4 quadrants: TL white, TR black, BL red, BR grass-green (#5a8f3c = 90,143,60)
const quad = (() => {
  const w = 4, h = 4, data = new Uint8ClampedArray(w * h * 4);
  const set = (x, y, r, g, b) => { const i = (y * w + x) * 4; data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255; };
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    if (y < 2 && x < 2) set(x, y, 255, 255, 255);       // TL white
    else if (y < 2 && x >= 2) set(x, y, 0, 0, 0);        // TR black
    else if (y >= 2 && x < 2) set(x, y, 255, 0, 0);      // BL red
    else set(x, y, 90, 143, 60);                         // BR grass
  }
  return { width: w, height: h, data };
})();

// --- sampleResize ---------------------------------------------------------
ok(sampleResize(solid(4, 4, [255, 255, 255]), 2).length === 2 * 2 * 3, 'sampleResize length = size*size*3');
{
  const s = sampleResize(quad, 2); // cell (z*2+x)*3
  ok(s[0] === 255 && s[1] === 255 && s[2] === 255, 'sampleResize TL = white');
  ok(s[3] === 0 && s[4] === 0 && s[5] === 0, 'sampleResize TR = black');
  ok(s[6] === 255 && s[7] === 0 && s[8] === 0, 'sampleResize BL = red');
  ok(s[9] === 90 && s[10] === 143 && s[11] === 60, 'sampleResize BR = grass');
}
// upscale: 1×1 → 2×2 keeps colour
ok(sampleResize(solid(1, 1, [10, 20, 30]), 2).every((v, i) => v === [10, 20, 30][i % 3]), 'sampleResize upscales');

// --- imageToHeights -------------------------------------------------------
{
  const white = imageToHeights(solid(2, 2, [255, 255, 255]), 2); // t=1 → base+round(1*(24-1))=24
  const black = imageToHeights(solid(2, 2, [0, 0, 0]), 2);       // t=0 → base=1
  ok(white.every((h) => h === 24), 'white → high (24)');
  ok(black.every((h) => h === 1), 'black → low (base 1)');
  ok(white[0] > black[0], 'white height > black height');
  const wInv = imageToHeights(solid(2, 2, [255, 255, 255]), 2, { invert: true }); // t=0 → 1
  const bInv = imageToHeights(solid(2, 2, [0, 0, 0]), 2, { invert: true });       // t=1 → 24
  ok(wInv[0] === 1 && bInv[0] === 24, 'invert flips white↔black');
}

// --- imageToBiomes --------------------------------------------------------
{
  const b = imageToBiomes(quad, 2);
  ok(b.length === 4, 'biomes length = size*size');
  ok(b.every((id) => id >= 0 && id <= 5), 'biome ids within 0..5');
  ok(b[0] === 3, 'white cell → snow (id 3)');     // TL
  ok(b[3] === 0, 'grass cell → grass (id 0)');    // BR (z=1,x=1) → index 3
}

// --- imageToObjects -------------------------------------------------------
{
  const dark = solid(4, 4, [0, 0, 0]); // lum 0 → all eligible
  const a = imageToObjects(dark, 4, { density: 1 });
  const b = imageToObjects(dark, 4, { density: 1 });
  ok(JSON.stringify(a) === JSON.stringify(b), 'imageToObjects deterministic');
  ok(a.length === 16 && a.every((o) => o.pos.y === 1 && o.scale >= 0.8 && o.scale <= 1.2), 'objects: full density fills + valid fields');
  ok(a.every((o) => o.pos.x % 1 === 0.5 && o.pos.z % 1 === 0.5), 'objects centered at +0.5');
  // heightAt is honoured
  const hh = imageToObjects(dark, 4, { density: 1, heightAt: () => 5 });
  ok(hh.every((o) => o.pos.y === 5), 'objects use heightAt');
  // all-white, threshold 0.5 → zero objects (lum 1 ≥ 0.5)
  ok(imageToObjects(solid(4, 4, [255, 255, 255]), 4, { threshold: 0.5, density: 1 }).length === 0, 'all-white threshold 0.5 → 0 objects');
}

console.log(`imageTerrain: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
