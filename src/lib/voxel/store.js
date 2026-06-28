// Small UI/session state for the 3D Map (tool, brush, selected material, env). localStorage is
// fine here — it's tiny. Heavy voxel/chunk bytes live in IndexedDB (chunkStore), never here.
import { persisted } from '../stores.js';

export const voxelUI = persisted('voxelUI', {
  mapId: 'default',
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

// Per-map environment (spec §11). Static for S0; animation/weather layer on at L6.
export const voxelEnv = persisted('voxelEnv', {
  mode: 'static',
  minuteOfDay: 12 * 60,
  season: 'summer',
  moonPhase: 0,
  weather: 'clear',
  weatherIntensity: 0.5,
  fogRadiusFt: 0,
});
