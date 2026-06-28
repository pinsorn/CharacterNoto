// VoxelDND core constants + material palette + dense-grid key encoding.
// Adapted from voxeldnd-spec-v1.0.md §3–§4 for the Svelte app. Plain JS + JSDoc (no TS here).

export const CHUNK = 32; // DEFAULT columns per side for a fresh map (per-map `size` overrides it)
export const CHUNK_DIM = 64; // streaming engine: fixed chunk side length (a map = a grid of these)
export const WORLD_HEIGHT = 64; // max voxel layers (y)
export const DEFAULT_VOXEL_FT = 5; // build/test at 5 ft coarse first (decision #3)

// Selectable square map sizes (columns/side). The topview always covers the whole map extent
// (= the current size), so normalized region polygons stay aligned on every regen.
// MAX_MAP_SIZE is the current single-chunk ceiling (one greedy-meshed chunk). Larger maps
// (→1024 via multi-chunk meshing, →thousands via streaming+LOD) are a future engine phase —
// see VOXEL_3D_PLAN.md. The Image Editor clamps imported sizes to this.
export const MAX_MAP_SIZE = 256;
export const MAP_SIZES = [16, 32, 48, 64, 96, 128, 192, 256];

// Biomes: surface + subsurface colours (decision #2 hybrid heightmap+biome).
export const BIOMES = [
  { id: 0, name: 'Grass', surface: '#5a8f3c', sub: '#6b4f2a' },
  { id: 1, name: 'Sand', surface: '#d9c27a', sub: '#c9b06a' },
  { id: 2, name: 'Rock', surface: '#8a8a8a', sub: '#6f6f6f' },
  { id: 3, name: 'Snow', surface: '#eef3f6', sub: '#b9c4cc' },
  { id: 4, name: 'Dirt', surface: '#7a5a36', sub: '#5e4427' },
  { id: 5, name: 'Forest', surface: '#3f6f33', sub: '#4a3a22' },
];
export const MAXBIOME = BIOMES.length;

// Override block types (structures: walls, floors, bridges — decision §7).
export const BLOCKS = [
  { id: 1, name: 'Stone', color: '#9a9a9a' },
  { id: 2, name: 'Wood', color: '#9c6b3f' },
  { id: 3, name: 'Brick', color: '#a8543a' },
  { id: 4, name: 'Plank', color: '#c8a06a' },
  { id: 5, name: 'Glass', color: '#bfe3ef' },
  { id: 6, name: 'Dark', color: '#3a3a44' },
];

// Object-layer colour legend: a pixel's colour in the OBJECT image picks WHICH prop to scatter
// (so one image can place many prop types). Paint these exact colours where you want each prop;
// anything nearest to white places nothing. Colours are mutually distinct in RGB → unambiguous
// nearest-match. propId matches the built-in PROPS in components/map3d/objects.js.
export const OBJECT_KEYS = [
  { color: [0x2e, 0xcc, 0x40], propId: 'tree', name: 'Tree' },     // bright green
  { color: [0x0a, 0x6b, 0x4a], propId: 'pine', name: 'Pine' },     // dark teal-green
  { color: [0xbf, 0xe0, 0x4a], propId: 'bush', name: 'Bush' },     // yellow-green
  { color: [0x9b, 0x9b, 0x9b], propId: 'rock', name: 'Rock' },     // mid grey
  { color: [0x55, 0x55, 0x55], propId: 'boulder', name: 'Boulder' }, // dark grey
  { color: [0x8b, 0x5a, 0x2b], propId: 'stump', name: 'Stump' },   // brown
  { color: [0xcc, 0x33, 0xff], propId: 'crystal', name: 'Crystal' }, // magenta
  { color: [0xff, 0xff, 0xff], propId: null, name: '(none)' },     // background → no object
];

/**
 * Nearest OBJECT_KEYS propId for an (r,g,b) colour (0..255), or null when the closest key is
 * the "(none)" background. Pure Euclidean RGB nearest-match.
 * @returns {string|null}
 */
export function objectPropForColor(r, g, b) {
  let best = OBJECT_KEYS[0], bestD = Infinity;
  for (const k of OBJECT_KEYS) {
    const dr = r - k.color[0], dg = g - k.color[1], db = b - k.color[2];
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) { bestD = d; best = k; }
  }
  return best.propId;
}

// --- dense-grid colour-key encoding (0 = empty) ---------------------------
// surface biome b  → 1 + b
// subsurface biome → 1 + MAXBIOME + b
// override block t  → 1 + 2*MAXBIOME + t
const BLOCK_BASE = 1 + 2 * MAXBIOME;
export const surfaceKey = (b) => 1 + b;
export const subKey = (b) => 1 + MAXBIOME + b;
export const blockKey = (t) => BLOCK_BASE + t;

function hexToRGB(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

// Precompute key → [r,g,b] (0..1). Built once.
const KEY_RGB = (() => {
  const m = new Map();
  for (const b of BIOMES) {
    m.set(surfaceKey(b.id), hexToRGB(b.surface));
    m.set(subKey(b.id), hexToRGB(b.sub));
  }
  for (const t of BLOCKS) m.set(blockKey(t.id), hexToRGB(t.color));
  return m;
})();

const FALLBACK_RGB = [1, 0, 1]; // magenta = unknown key (visible bug)
/** Colour for a dense key. @param {number} key @returns {[number,number,number]} */
export const colorOf = (key) => KEY_RGB.get(key) || FALLBACK_RGB;

export const hex = hexToRGB;
