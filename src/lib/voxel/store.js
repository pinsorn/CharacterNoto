// Small UI/session state for the 3D Map (tool, brush, selected material, env). localStorage is
// fine here — it's tiny. Heavy voxel/chunk bytes live in IndexedDB (chunkStore), never here.
import { persisted } from '../stores.js';

export const voxelUI = persisted('voxelUI', {
  mapId: 'default',
  mapSize: 32, // square map side length (columns); selectable, see MAP_SIZES
  tool: 'raise', // raise|lower|flatten|smooth|roughen|setHeight|carve|paintBiome | place|erase
  brushRadius: 2,
  brushStrength: 1,
  brushShape: 'circle', // circle | square
  brushFalloff: false,
  targetHeight: 8, // for setHeight tool
  biomeId: 0,
  blockId: 1,
  cameraPreset: 'iso', // iso | top
});

// Object painter (spec §9): scatter / hand-place props on the terrain.
export const voxelObjUI = persisted('voxelObjUI', {
  propId: 'pine',
  mode: 'scatter', // scatter | place
  radius: 3,
  density: 0.5, // instances per cell within the brush disc
  jitter: 0.4,
  scaleVar: 0.3,
  yawRandom: true,
});

// Per-map environment (spec §11). Static for S0; animation/weather layer on at L6.
export const voxelEnv = persisted('voxelEnv', {
  mode: 'static', // static | animated
  timeScale: 60, // in-world minutes advanced per real second when animated
  minuteOfDay: 12 * 60,
  day: 1,
  season: 'summer',
  moonPhase: 0, // 0..7
  weather: 'clear', // clear|cloudy|rain|storm|snow|fog
  weatherIntensity: 0.5,
  fogRadiusFt: 0, // 0 = no atmospheric fog
});
