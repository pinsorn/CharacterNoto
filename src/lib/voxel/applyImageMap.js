// Persist an Image-Editor result onto the current 3D map.
// Two paths:
//  - SMALL (size ≤ MAX_MAP_SIZE): one chunk, exactly as before → the 3D Map tab renders + edits it.
//  - LARGE (chunked: true): stream the (unlimited) map chunk-by-chunk to IndexedDB via imageChunker,
//    rasterize a top-down PNG incrementally (never holding the whole map in RAM), save a map meta
//    record, and bump mapRev. The Map tab shows the topview; full 3D streaming render is a later phase.
import { get } from 'svelte/store';
import { mapData } from '../stores.js';
import { voxelUI } from './store.js';
import { saveChunk, saveMeta, deleteMapChunks } from './chunkStore.js';
import { chunkFromImage } from './imageChunker.js';
import { CHUNK_DIM, BIOMES, WORLD_HEIGHT, hex } from './types.js';
import { putBlob, delBlob, newImageId } from '../blobstore.js';

const MAX_OBJECTS = 20000; // cap so a dense object layer over a huge map can't explode mapData/instances
const BIOME_RGB255 = BIOMES.map((b) => hex(b.surface).map((v) => Math.round(v * 255)));

export async function applyImageMap(result) {
  if (result.chunked) return generateChunked(result);
  return applySingle(result);
}

// --- small map: one chunk (unchanged behaviour) ---------------------------
async function applySingle(result) {
  const { size, height, biome, objects = [] } = result;
  const mapId = get(voxelUI).mapId;
  await deleteMapChunks(mapId); // drop any prior (incl. a previous large/chunked map's records)
  await saveChunk(mapId, { cx: 0, cz: 0, size, height, biome, overrides: new Map(), carves: new Set() });
  mapData.update((d) => ({ ...d, objects: [...(d.objects || []), ...objects] }));
  voxelUI.update((u) => ({ ...u, mapSize: size, mapRev: (u.mapRev || 0) + 1 }));
}

// --- large map: stream chunks + incremental topview -----------------------
// result = { chunked:true, N, R, layers:{height:{on,maxHeight,invert,base}, biome:{on},
//            object:{on,propId,threshold,density}}, imgs:{height,biome,object} (ImageData) }
async function generateChunked({ N, R, layers, imgs }) {
  const DIM = CHUNK_DIM;
  const mapId = get(voxelUI).mapId;
  await deleteMapChunks(mapId);

  const wChunks = Math.ceil(N / DIM);
  const hChunks = Math.ceil(N / DIM);
  const objects = [];
  // Spread the object budget across chunks so a huge map isn't front-loaded (all objects in the
  // first chunk-rows, invisible from the centre). Each chunk gets an equal share of MAX_OBJECTS.
  const perChunkObjects = Math.max(8, Math.floor(MAX_OBJECTS / (wChunks * hChunks)));

  // incremental top-down raster (bounded), splatted as each chunk is generated
  const TW = Math.min(N, 512);
  const TH = TW;
  const buf = new Uint8ClampedArray(TW * TH * 4);

  const baseH = layers.height.base ?? 1;
  for (let cz = 0; cz < hChunks; cz++) {
    for (let cx = 0; cx < wChunks; cx++) {
      const height = layers.height.on
        ? chunkFromImage(imgs.height, cx, cz, DIM, R, { height: { on: true, maxHeight: layers.height.maxHeight, invert: layers.height.invert, base: baseH }, biome: { on: false }, object: { on: false } }).height
        : new Int16Array(DIM * DIM).fill(baseH);
      const biome = layers.biome.on
        ? chunkFromImage(imgs.biome, cx, cz, DIM, R, { height: { on: false }, biome: { on: true }, object: { on: false } }).biome
        : new Uint8Array(DIM * DIM);
      if (layers.object.on && objects.length < MAX_OBJECTS) {
        const o = chunkFromImage(imgs.object, cx, cz, DIM, R, { height: { on: false }, biome: { on: false }, object: { on: true, density: layers.object.density } }).objects;
        let placed = 0;
        for (const inst of o) { if (placed >= perChunkObjects || objects.length >= MAX_OBJECTS) break; objects.push(inst); placed++; }
      }
      await saveChunk(mapId, { cx, cz, height, biome, overrides: new Map(), carves: new Set() });

      // splat this chunk into the topview buffer (downsample to TW×TH)
      for (let lz = 0; lz < DIM; lz++) {
        const gz = cz * DIM + lz; if (gz >= N) break;
        const ty = Math.floor((gz / N) * TH);
        for (let lx = 0; lx < DIM; lx++) {
          const gx = cx * DIM + lx; if (gx >= N) break;
          const idx = lz * DIM + lx;
          const shade = 0.55 + 0.45 * Math.min(1, height[idx] / WORLD_HEIGHT);
          const rgb = BIOME_RGB255[biome[idx]] || BIOME_RGB255[0];
          const di = (ty * TW + Math.floor((gx / N) * TW)) * 4;
          buf[di] = rgb[0] * shade; buf[di + 1] = rgb[1] * shade; buf[di + 2] = rgb[2] * shade; buf[di + 3] = 255;
        }
      }
    }
  }

  await saveMeta(mapId, { wChunks, hChunks, dim: DIM, wVox: N, hVox: N });

  // topview buffer → PNG → mapData.backgroundId (Map tab shows it unchanged)
  const cv = document.createElement('canvas');
  cv.width = TW; cv.height = TH;
  cv.getContext('2d').putImageData(new ImageData(buf, TW, TH), 0, 0);
  const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
  const oldId = get(mapData).backgroundId;
  if (blob) { const id = newImageId(); await putBlob(id, blob); if (oldId) delBlob(oldId); mapData.update((d) => ({ ...d, backgroundId: id, objects })); }
  else mapData.update((d) => ({ ...d, objects }));

  voxelUI.update((u) => ({ ...u, mapSize: N, mapRev: (u.mapRev || 0) + 1 }));
  return { wChunks, hChunks, objects: objects.length };
}
