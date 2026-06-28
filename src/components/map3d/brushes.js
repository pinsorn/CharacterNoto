// World Painter brush engine (slice S1). Pure terrain-editing stamps over a voxel chunk.
// No DOM, no three.js. Mutates the chunk in place via the world.js setters (which mark dirty).
// Imported lazily by Map3DTab; runnable in plain node for the test.
import { setColumnHeight, addHeight, paintBiome as setBiome, eraseVoxel, getHeight } from '../../lib/voxel/world.js';

/**
 * Tool registry the overseer renders controls from. `params` names the extra
 * controls each tool exposes, drawn from radius|strength|shape|falloff|target|biome.
 * @type {{id:string,label:string,params:string[]}[]}
 */
export const PAINTER_TOOLS = [
  { id: 'raise', label: 'Raise', params: ['radius', 'strength', 'shape', 'falloff'] },
  { id: 'lower', label: 'Lower', params: ['radius', 'strength', 'shape', 'falloff'] },
  { id: 'flatten', label: 'Flatten', params: ['radius', 'shape', 'falloff'] },
  { id: 'smooth', label: 'Smooth', params: ['radius', 'strength', 'shape'] },
  { id: 'roughen', label: 'Roughen', params: ['radius', 'strength', 'shape'] },
  { id: 'setHeight', label: 'Set Height', params: ['radius', 'target', 'shape'] },
  { id: 'carve', label: 'Carve', params: ['radius', 'strength', 'shape'] },
  { id: 'paintBiome', label: 'Paint Biome', params: ['radius', 'shape', 'biome'] },
];

const inCol = (size, x, z) => x >= 0 && x < size && z >= 0 && z < size;

/** Per-column scaled effect. Linear falloff (center strongest), rounded to an integer, never negative. */
function scaled(strength, dist, radius, falloff) {
  if (!falloff) return strength;
  const f = 1 - dist / (radius + 1); // radius 0 => f=1 at center
  return Math.max(0, Math.round(strength * f));
}

/** Deterministic integer jitter in [-strength, +strength] from (x,z,seed). No Math.random. */
function jitter(x, z, seed, strength) {
  if (strength <= 0) return 0;
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(seed | 0, 2246822519)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h ^= h >>> 16;
  const span = 2 * strength + 1;
  return (h % span) - strength;
}

/**
 * Apply one brush stamp centered on column (cx,cz). Mutates `chunk` in place.
 * @param {*} chunk
 * @param {number} cx
 * @param {number} cz
 * @param {{tool:string,radius?:number,strength?:number,shape?:'circle'|'square',falloff?:boolean,target?:number,biomeId?:number,seed?:number,baseline?:number}} opts
 */
export function applyBrush(chunk, cx, cz, opts) {
  const {
    tool,
    radius = 2,
    strength = 1,
    shape = 'circle',
    falloff = false,
    target = 6,
    biomeId = 0,
    seed = 0,
  } = opts;
  const baseline = opts.baseline ?? getHeight(chunk, cx, cz);
  const N = chunk.size; // per-map side length

  // Smooth needs an order-independent read of every source height.
  const snap = tool === 'smooth' ? Int16Array.from(chunk.height) : null;

  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (shape === 'square') {
        if (Math.max(Math.abs(dx), Math.abs(dz)) > radius) continue;
      } else if (dx * dx + dz * dz > radius * radius + radius) {
        continue; // circle footprint
      }
      const x = cx + dx;
      const z = cz + dz;
      if (!inCol(N, x, z)) continue;
      const dist = Math.sqrt(dx * dx + dz * dz);

      switch (tool) {
        case 'raise':
          addHeight(chunk, x, z, scaled(strength, dist, radius, falloff));
          break;
        case 'lower':
          addHeight(chunk, x, z, -scaled(strength, dist, radius, falloff));
          break;
        case 'flatten':
          setColumnHeight(chunk, x, z, baseline);
          break;
        case 'smooth': {
          const factor = Math.min(1, strength / 4);
          let sum = 0;
          let n = 0;
          for (const [nx, nz] of [[x - 1, z], [x + 1, z], [x, z - 1], [x, z + 1]]) {
            if (inCol(N, nx, nz)) {
              sum += snap[nz * N + nx];
              n++;
            }
          }
          if (n > 0) {
            const cur = snap[z * N + x];
            const avg = sum / n;
            setColumnHeight(chunk, x, z, cur + (avg - cur) * factor);
          }
          break;
        }
        case 'roughen':
          addHeight(chunk, x, z, jitter(x, z, seed, strength));
          break;
        case 'setHeight': {
          if (falloff) {
            const f = 1 - dist / (radius + 1);
            const cur = getHeight(chunk, x, z);
            setColumnHeight(chunk, x, z, cur + (target - cur) * f);
          } else {
            setColumnHeight(chunk, x, z, target);
          }
          break;
        }
        case 'carve': {
          const s = scaled(strength, dist, radius, falloff);
          addHeight(chunk, x, z, -s);
          // Rounded hollow: in the center region remove a couple of cells just under the
          // new surface so terrain can overhang. Bounded; eraseVoxel adds to chunk.carves.
          if (dist <= radius / 2) {
            const top = getHeight(chunk, x, z); // top solid voxel sits at top-1
            const depth = Math.min(2, s + 1);
            for (let d = 1; d <= depth; d++) eraseVoxel(chunk, x, top - 1 - d, z);
          }
          break;
        }
        case 'paintBiome':
          setBiome(chunk, x, z, biomeId);
          break;
        default:
          break;
      }
    }
  }
}
