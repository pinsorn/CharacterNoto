# Voxel Streaming Engine + Unlimited Image Editor — Design

Date: 2026-06-28 · Branch: `feat/streaming-engine` · Supersedes the single-chunk model for the 3D Map.

## Goal
Support **unlimited-size** voxel maps (target up to ~5000×5000) by moving from one big chunk to a
**grid of streamed chunks**. The multi-layer **Image Editor** accepts an unlimited image and, on
Generate, **auto-splits it into chunks** written straight to IndexedDB (never holding the whole map
in RAM). The 3D view **streams** chunks around the camera (load/unload), meshing each in a **Web
Worker**. The Map-tab topview is **rasterized from chunk data** so it scales to any size.

Non-goals (this epic): true physically-correct LOD morphing, infinite procedural generation,
multiplayer streaming of chunks. Keep cosmetic POV, regions, tokens, objects working.

## Decisions (locked)
- **Per-chunk data.** Fixed `CHUNK_DIM = 64`. A map = a grid of chunks `(cx,cz)`. Each chunk:
  `{cx, cz, height: Int16Array(CHUNK_DIM²), biome: Uint8Array(CHUNK_DIM²), overrides: Map, carves: Set}`.
  Stored per-chunk in IndexedDB via the existing `chunkStore` (`mapId/cx,cz` key — already per-chunk).
- **Map index.** New record per map: `{ mapId, wChunks, hChunks }` (chunk grid extent) + name. Stored
  in `chunkStore` (a `meta/<mapId>` key) or a small `persisted` store. Drives streaming bounds + topview size.
- **Streaming.** Keep a live `Map<"cx,cz", LoadedChunk>` of chunks within a **view radius** of the
  camera target. Load missing ones from IDB (async), unload (dispose mesh, drop arrays) when out of
  radius. Each loaded chunk = ONE `THREE.Mesh` (greedy mesh + 1-voxel **apron** from neighbors to cull
  seam faces). Meshing runs in a **Web Worker**; main thread builds BufferGeometry from transferables.
- **Apron.** Seam correctness: a chunk's mesher reads a 1-cell border of neighbor height/biome so
  boundary faces between adjacent solid voxels are culled (no double faces / z-fight at chunk edges).
- **Image Editor unlimited.** Remove the size cap. Resolution `R px = 1 voxel` → map = `ceil(imgW/R) ×
  ceil(imgH/R)` voxels → `wChunks×hChunks` chunks. Generate iterates chunks, samples the image's
  sub-region per chunk (async, chunk-by-chunk), computes height/biome/object slice, `saveChunk`. Never
  materializes the whole-map array. Objects appended to `mapData.objects` (or per-chunk later).
- **Topview from data.** Rasterize biome colour shaded by height to a canvas directly from chunk data
  (downsampled to a bounded PNG, e.g. ≤1024px), independent of 3D rendering → scales to any map size.
  (Legacy 3D-snapshot topview retired.)
- **Worker via Vite.** `new Worker(new URL('./meshWorker.js', import.meta.url), { type: 'module' })`.
  Fallback to main-thread meshing if Worker unavailable.
- **Migration.** A legacy single-chunk map (one `mapId/0,0` of `size=N`) is re-split into the
  `CHUNK_DIM` grid on first load (one-time), or the user starts a fresh map. Keep it lossless.

## Architecture / components (interfaces stable for subagents)
- `src/lib/voxel/chunkGrid.js` (pure) — chunk grid math: `chunkKey(cx,cz)`, `worldToChunk(x,z)`,
  `forEachChunkInRadius(center, radius, cb)`, map-index helpers. createChunk(cx,cz,CHUNK_DIM,...).
- `src/lib/voxel/tileMesher.js` (pure, Worker-safe) — `meshChunk({height, biome, apron, overrides,
  carves, dim}) -> {positions, normals, colors, indices}` (compose dense + apron → reuse `greedyMesh`).
- `src/components/map3d/meshWorker.js` — Worker entry: receives a chunk job (typed-array slices +
  apron), calls `tileMesher.meshChunk`, posts transferables back. Pure import of tileMesher + types.
- `src/lib/voxel/imageChunker.js` (pure) — `chunkFromImage(img, cx, cz, dim, R, layerOpts) ->
  {height, biome, objects}` for ONE chunk's sub-region (reuses imageTerrain sampling). Drives unlimited
  Generate without whole-map arrays.
- `src/lib/voxel/topoRaster.js` (pure-ish) — `rasterizeTopview(getChunk, wChunks, hChunks, dim, maxPx)
  -> ImageData/canvas` biome-colour + height-shade, downsampled.
- `src/lib/voxel/chunkStore.js` — extend: `saveMeta/loadMeta(mapId)`, `loadChunk`, `saveChunk`,
  `deleteMapChunks`, `allChunkKeys(mapId)`.
- `src/components/Map3DTab.svelte` (overseer-owned) — the streaming loop: track camera target → load/
  unload chunks in radius → Worker mesh queue → swap chunk meshes; edits write the touched chunk(s) +
  apron-neighbors dirty; raycast across loaded chunk meshes; tokens/objects/possession unchanged.
- `src/components/ImageEditor.svelte` — remove cap; Generate streams chunks via imageChunker → chunkStore
  + meta + bump `mapRev`. Progress UI for large gens.

## Data flow
1. Image Editor Generate → for each (cx,cz): `chunkFromImage` → `saveChunk` + accumulate objects →
   `saveMeta` + set `mapData.objects` + `voxelUI.mapRev++`.
2. Map3DTab on `mapRev`/mount → `loadMeta` → set chunk grid → stream chunks in radius around target →
   per chunk: load arrays → post mesh job (with apron from neighbors) → on result build/swap mesh.
3. Edit → world coords → chunk(cx,cz)+local → write chunk arrays → mark chunk (+boundary neighbors)
   dirty → re-post mesh job → save chunk (debounced) → topview raster (debounced).
4. Topview → `rasterizeTopview` from chunk data → PNG → `mapData.backgroundId` (Map tab unchanged).

## Phases (commit green between every step; branch only, do NOT merge until P2 verified)
**P1 — chunked storage + unlimited generate + bounded render + topview raster**
- chunkGrid, tileMesher, meshWorker, imageChunker, topoRaster, chunkStore meta.
- Map3DTab: render ALL chunks of a map up to a cap (e.g. ≤ 32×32 chunks = 2048²) via Worker; edits per
  chunk; legacy migration. Image Editor unlimited Generate → chunks. Topview from data.
- Verify E2E: generate a >256 map from an image, render, edit, topview on Map tab. All tests green.

**P2 — camera streaming (load/unload window) + LOD-lite**
- Load/unload chunks by camera-target radius; "recenter/pan" to explore huge maps; cap loaded set.
- LOD-lite: far chunks meshed surface-only / skipped. Handles 5000² (a window at a time).
- Verify E2E: generate a ~5000² (or as big as practical) map; pan loads/unloads; stays responsive.

## Testing
- `tileMesher`: single chunk = current behavior; **two adjacent chunks via apron → no double faces at
  the shared seam** (count exposed faces vs naive).
- `imageChunker`: chunk (cx,cz) sub-region matches the corresponding image-tile of the whole transform
  (parity with imageTerrain on a small image).
- `chunkGrid`: radius iteration + worldToChunk correctness.
- `topoRaster`: output size + a known pixel maps to the expected biome colour.
- Existing `*.test.mjs` stay green.

## Risks / footguns
- **Apron seams** — the #1 correctness risk; dedicated test + visual check.
- **Worker message overhead** — coalesce dirty chunks per frame; cap concurrent jobs; transferables.
- **Draw calls / memory** at large render sets — bounded by the radius cap + (P2) unload.
- **Migration** of legacy single-chunk maps — test lossless re-split.
- **Context/session depth** — execute in committed green increments on the branch; main stays on the
  shipped v3.10.0 until P2 is verified. If interrupted, this spec + the branch's last green commit are
  the resume point.

## STATUS (2026-06-28) — P1 SAFE HALF DONE; spine deferred
**Done on branch `feat/streaming-engine` (NOT merged; main = v3.10.0):**
- Pure modules (all unit-tested): `chunkGrid`, `tileMesher`+`meshWorker`, `imageChunker`, `topoRaster`;
  `chunkStore` meta (`saveMeta/loadMeta/allChunkKeys`); `CHUNK_DIM=64`.
- **Unlimited Image Editor generate → chunks** (`applyImageMap.js` `generateChunked`): streams chunks
  to IDB via `imageChunker`, incremental top-down raster → `mapData.backgroundId`, `saveMeta`, objects
  capped at 20000, `mapRev++`. ≤256 still single-chunk (3D-editable, unchanged). Map3DTab shows a
  "Large chunked map" note for chunked maps. **Verified E2E: 640×640 → 100 chunks, topview on Map tab.**

## HANDOFF — the deferred spine (streaming RENDER in Map3DTab) + P2
Resume here. Build a `ChunkManager` (overseer-owned) and reroute Map3DTab off the single-chunk model.
**Parity at one chunk FIRST** (must render/edit/topview identically at small size) before load/unload.

`ChunkManager(scene, THREE, mapId)` interface (so call sites barely change):
`heightAt(gx,gz)`, `editAtWorld(worldX,worldZ,fn)`, `raycastTargets()->Mesh[]`, `meshFor(cx,cz)`,
`setView(centerX,centerZ,radiusChunks)` (load/unload), `save()`, `dispose()`. Uses `meshWorker`
(1 worker + job queue, coalesce dirty/frame), apron from neighbor chunk heights, mesh world-offset to
`(cx*DIM,0,cz*DIM)`.

**Single-chunk assumptions to reroute (miss one → silent break):**
- `brushes.js` writes `chunk.height` bounded by `chunk.size` → must route an edit to the right chunk(s)
  + mark them (and apron-neighbors) dirty.
- `heightAt`/`surfaceY` read `lastDense` (one chunk) → read across loaded chunks.
- `applyImageMap` single path writes one chunk → fine; chunked path already correct.
- raycast vs one `terrainMesh` → raycast `manager.raycastTargets()`.
- topview: small=3D snapshot, large=raster — unify on raster (already scales).
- token/object surface-snap + placement read one chunk → read via manager.

**Render footguns (unit tests can't catch — verify visually):**
- Chunk mesh MUST be world-offset to `(cx*DIM,0,cz*DIM)`.
- Apron orientation (px indexed by z, pz by x) — screenshot 2+ adjacent chunks: no cracks, no double walls.
- Objects: per-5000² density explodes; keep the 20000 cap or store/instances per loaded chunk.

**P2:** camera-target radius load/unload (`chunksInRadius`) + recenter to pan huge maps + LOD-lite (far
chunks surface-only/skip). Verify a ~5000² map pans + stays responsive. Don't merge until P2 E2E-verified.

## Subagent plan (coupled core — overseer owns the streaming loop)
- Subagent(s), disjoint NEW pure modules + tests: (1) `chunkGrid.js`, (2) `tileMesher.js` +
  `meshWorker.js`, (3) `imageChunker.js`, (4) `topoRaster.js`. Run in parallel (no shared files).
- Overseer (me): `chunkStore` meta extension, the Map3DTab streaming integration (load/unload, worker
  queue, edit→chunk, raycast, migration), ImageEditor Generate rewrite, wiring + every E2E + commits.
