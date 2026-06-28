// Persist an Image-Editor result onto the current 3D map. The editor lives in its own tab and
// computes {size, height, biome, objects}; this writes the chunk to IndexedDB + appends objects,
// then bumps voxelUI.mapRev so Map3DTab reloads the map from disk (decoupled across tabs).
import { get } from 'svelte/store';
import { mapData } from '../stores.js';
import { voxelUI } from './store.js';
import { saveChunk } from './chunkStore.js';

/**
 * @param {{size:number, height:Int16Array, biome:Uint8Array, objects:Array}} result
 */
export async function applyImageMap(result) {
  const { size, height, biome, objects = [] } = result;
  const mapId = get(voxelUI).mapId;
  const chunk = { cx: 0, cz: 0, size, height, biome, overrides: new Map(), carves: new Set() };
  await saveChunk(mapId, chunk);
  // Image objects are additive (user can Clear objects in the Object panel first for a fresh import).
  if (objects.length) mapData.update((d) => ({ ...d, objects: [...(d.objects || []), ...objects] }));
  voxelUI.update((u) => ({ ...u, mapSize: size, mapRev: (u.mapRev || 0) + 1 }));
}
