# VoxelDND 3D Map — build plan & checkpoint

Adapts `voxeldnd-spec-v1.0.md` (written for Next.js + react-three-fiber) into the existing
**Svelte 5 + Vite + raw three.js** CharacterNoto app. User chose **full spec (L1–L12)** +
**characters-as-tokens**, autonomous, subagents allowed, overseer (main agent) reviews.

Branch: `feat/voxel-3d-map`. Working repo: `Y:\ClaudePlayground\CharacterNoto` (NOT the
typo'd `CharactorNoto`, which only holds the spec + screenshots).

## Locked adaptation decisions
- **Renderer**: raw three.js (reuse `DiceScene.svelte` lifecycle: onMount → rAF tick →
  ResizeObserver for hidden-tab 0×0 mount → onDestroy). R3F/drei → not used.
- **Addons are free**: `three/addons/*` (OrbitControls, GLTFLoader, OBJ/MTL/FBX/STLLoader,
  objects/Sky, objects/Water) ship with three@0.184. `Stars`→Points cloud, `Cloud`→hand-rolled.
- **Physics**: reuse installed **cannon-es** for destruction debris (spec said rapier; ponytail
  rung 4 = reuse installed dep). // ponytail: cannon-es debris, swap to rapier only if it can't keep up.
- **State**: small UI/env state → `persisted()` (localStorage). **Chunk/voxel data → IndexedDB**
  (own DB `voxelworld`, raw IDB like `blobstore.js`). NEVER voxel data in localStorage (silent
  quota drop corrupts `mapData`).
- **Topview → Map integration (the headline ask)**: 3D Map tab renders a top-down ortho
  snapshot over a FIXED map extent → PNG → `putBlob` → set `mapData.backgroundId`. The existing
  Map tab renders that blob unchanged; **P2P sync + zip export already carry `backgroundId`**
  (`publicview.js imageIdsOf`), so viewers get the topview for free. Map tab loses its image
  upload; regions (normalized 0..1) stay aligned because the extent is fixed.
- **3D Map tab is host-only** (authoring). Viewers see only the resulting Map tab if shared.
- **QuickJS-wasm** (material script sandbox, decision #5 — security, don't simplify away) added
  only at L5, after the spine is stable.

## Build discipline (spec §17)
L1 single-chunk @5ft → prove greedy mesher + edit loop → topview → COMMIT green → then
streaming, then 1ft, then additive layers. Every slice: `npm run build` green + committed
before the next. Algorithmic pieces leave a runnable `*.test.mjs`.

## Slices / status
- [x] **S0 spine** — 3D Map tab + scene/perspective+OrbitControls/lights/grid; single flat
      chunk; greedy mesher; raycast→cell→raise/lower/flatten/paintBiome/place/erase; IDB chunk
      store; topview→`mapData.backgroundId`; Map tab upload removed. `voxel.test.mjs`. **DONE,
      verified E2E in production preview.** *(overseer)*
- [x] **S1 L2 World Painter** — raise/lower/flatten/smooth/roughen/setHeight + carve; biome paint;
      brush radius/strength/falloff/shape. **DONE** (`map3d/brushes.js` pure+tested, wired into
      Map3DTab param-driven toolbar; verified E2E). Water level → deferred to S8.
- [x] **S2 L3 Tokens** — characters + generic; drag-drop snap to grid; facing (Q/E); sizes;
      surface-snap; possession POV (drag-look + WASD, Esc). `map3d/tokens.js` (mesh, tested) +
      `TokenPanel.svelte`; tokens in `mapData` (P2P + zip via publicview); bake into topview so
      players see them on the Map tab. **DONE, verified E2E.** Imported-mesh/voxel-figure tokens → S3.
- [x] **S3 L4 Object system** — built-in prop library (pine/tree/bush/rock/boulder/stump/crystal,
      vertex-coloured) + Object Painter (scatter + hand-place, seeded) + InstancedMesh per prop +
      topview bake + persist (mapData.objects, P2P/zip). `map3d/objects.js` (tested) + `ObjectPanel`.
      **DONE, verified E2E** (pine forest). Object Builder (custom voxel props) → deferred.
- [ ] **S4 L1b streaming** — chunk load/unload by camera, Worker greedy mesher, LOD, per-chunk
      IDB; then enable 1ft.
- [ ] **S5 L5 materials** — QuickJS-wasm sandbox + per-type/time-bucket cache + presets.
- [x] **S6 L6 environment** — time static/animated (Sky addon, sun az/elev, day/night lights),
      season tint, moon (star brightness), weather (rain/snow/storm particles), fog+radius, stars.
      `map3d/environment.js` (tested) + `EnvPanel.svelte`; env owns all lights. **DONE, verified E2E**
      (night+stars, storm, noon). Season biome-palette recolour → S5 (deferred). Noon sky a touch pale.
- [ ] **S7 L7 lighting** — emissive + capped real point lights.
- [ ] **S8 L8 water** — Water volumes (addons/Water) + flood tool + reactive reflood.
- [ ] **S9 L9 destruction** — cannon-es debris for props + terrain carve → reflood/remesh.
- [ ] **S10 L10 multi-map** — project/map browser, thumbnails, per-map env + saved view.
- [ ] **S11 L11 optional** — STL export, .vox import, share links. (deferred unless time.)

## Voxel core API (stable — subagents build against this; don't change signatures)
`src/lib/voxel/types.js`: `CHUNK=32`, `WORLD_HEIGHT=64`, `MAP_EXTENT=32`, `BIOMES[]`,
  `BLOCKS[]`, `surfaceKey(b)`, `subKey(b)`, `blockKey(t)`, `colorOf(key)->[r,g,b]`.
`src/lib/voxel/world.js`: `createChunk(cx,cz,base,biomeId)`, `composeDense(ch)->Uint16` (dense
  idx = `(y*CHUNK+z)*CHUNK+x`), `getHeight/getBiome(ch,x,z)`, `setColumnHeight`, `addHeight`,
  `paintBiome`, `placeBlock(ch,x,y,z,blockId)`, `eraseVoxel(ch,x,y,z)`, `surfaceY(dense,x,z)`,
  `inBounds(x,y,z)`. All edits set `ch.dirty=true`.
`src/lib/voxel/mesher.js`: `greedyMesh([X,Y,Z], get(x,y,z)->key, colorOf)->{positions,normals,
  colors,indices,quads}` (pure, Worker-safe).
`src/lib/voxel/chunkStore.js`: `saveChunk(mapId,ch)`, `loadChunk(mapId,cx,cz)`, `deleteMapChunks`.
`src/lib/voxel/store.js`: `voxelUI` (tool/brush/biome/block/mapId/cameraPreset), `voxelEnv`.
`Map3DTab.svelte`: host. `chunk` (current), `rebuild()` (recompose+remesh), `scene`, `camera`,
  `renderer`, `controls`, `terrainMesh`, `pick(e)->hit`, `scheduleSave/scheduleTopview`. World
  coords == voxel coords (1 unit = 1 voxel); grid is `CHUNK` wide at origin.

Integration rule: a subagent's feature lives in its own `src/components/map3d/<feature>.js`
exporting a small init/update/dispose; the OVERSEER wires the few lines into Map3DTab + commits.

## Notes / footguns
- "crater" on raise was a visual (1-voxel mound, low contrast) — mesher verified correct, NOT a bug.
- **S4 streaming**: topview must stay a FIXED bounded map area (MAP_EXTENT), not auto-expand to all
  chunks, or regions desync. Defer S4 (refactor of proven core) + S5 QuickJS (wasm bundle bloat,
  already 964 kB) — surface to user, don't open unattended.
- Verification gate per slice: `npm run build` green + ALL `src/**/*.test.mjs` (dice, logic, loot,
  publicview, voxel) green + preview E2E.
- KNOWN COST: Map3DTab (like DiceScene) mounts even while its tab is hidden → a host runs a 2nd
  always-on WebGL context + rAF loop. Acceptable now; gate the renderer/loop on first reveal if
  perf complaints surface.
- Viewer/player path: tokens+objects added to publicview (unit-tested, additive); players see them
  baked into the topview PNG. Not re-E2E'd live this milestone.

## Review-fix batch (post-v3.8.0, from VOXEL_3D_CHECKLIST.md comments)
- [x] L3 possession "can't rotate" → POV accepts left OR right drag + pointer-capture; fixed
      exit-POV invisible-pawn bug. (committed)
- [x] L3 token rotation X/Y/Z in panel (pitch/facing/roll, degrees). (committed)
- [x] L1 **map size customization** — per-map square `size` (16..128), `resizeChunk`. (committed)
- [x] L1 **image → terrain** (height/biome/object) — `imageTerrain.js` + panel. DONE, E2E (hill PNG).
- [x] L3 **GLB/OBJ/STL token models** — `tokenModels.js` loader + tokens.js render + panel import. DONE, E2E (cube.obj).
- [x] L4 **voxel object editor** — `voxelProp.js` + `ObjectEditor.svelte` + `customProps` + objects.js resolver. DONE, E2E (saved 5-voxel prop → picker).
- Released as **v3.9.0**.

## Image Editor + large maps (v3.10.0 — DONE, verified E2E)
- **Image Editor** = new host-only tab + full-screen. Shared base image + per-layer override;
  3 layers (Height/Biome/Object); resolution `R px = 1 voxel` → map size `N = clamp(maxDim/R, 8,
  MAX_MAP_SIZE)`. 2D preview (per-layer + composite). Apply → `applyImageMap.js` writes the chunk
  to IDB + appends objects + bumps `voxelUI.mapRev`; Map3DTab reloads on the bump (cross-tab).
  `ImageEditor.svelte` (subagent) is pure-2D (no three), uses tested `imageTerrain.js`.
- **Large-map RENDERING — phased (data already scales: height+biome ≈ 3 B/col, 75 MB @ 5000²;
  only whole-map meshing doesn't scale):**
  - now: single chunk, `MAX_MAP_SIZE=256` (one greedy mesh; 256 edits may lag, fine for imports).
  - next (medium risk): **multi-chunk meshing** — tile the map into chunk sub-meshes, remesh only
    dirty chunks, reuse the existing greedy mesher per chunk → ~512–1024. No streaming/LOD/workers.
  - epic (high risk, confirm scope first): camera chunk load/unload + LOD + Worker meshing for
    thousands² (true 5000²). This is deferred L1b in full — a dedicated engine project, NOT a
    tail-of-session add. User said 5000² is aspirational ("อาจจะ"); pin the real target before building.

## File map (new)
- `src/lib/voxel/types.js` — constants, factories, JSDoc schemas, MAP_EXTENT.
- `src/lib/voxel/chunkStore.js` — IDB `voxelworld` per-chunk persistence.
- `src/lib/voxel/mesher.js` — greedy mesher (pure: chunk → {positions,normals,colors,indices}).
- `src/lib/voxel/world.js` — active chunks, column composition, edits, dirty, raycast→cell.
- `src/lib/voxel/store.js` — persisted UI/env state (tool, brush, biome, env, mapId).
- `src/lib/voxel/voxel.test.mjs` — composition + mesher checks.
- `src/components/Map3DTab.svelte` — scene + toolbar + panels host.
- `src/components/map3d/*` — BrushPanel, TokenPanel, EnvPanel, etc. (disjoint → subagent-friendly).

## Edits to existing
- `src/App.svelte` — add host-only `3dmap` tab before `map`.
- `src/components/MapTab.svelte` — remove Upload/Clear Background buttons; background is the
  generated topview; add hint when none yet.
- `src/lib/stores.js` — extend `mapData` default with `{ tokens: [], world: {...meta} }` (kept
  small; heavy chunk bytes live in IDB).
