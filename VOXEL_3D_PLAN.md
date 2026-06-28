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
- [ ] **S1 L2 World Painter** — raise/lower/flatten/smooth/set/roughen + carve; biome paint;
      water level; brush radius/strength/falloff/shape.
- [ ] **S2 L3 Tokens** — characters + generic; drag-drop snap to 5ft grid; facing; sizes;
      surface-snap; possession POV camera. Token state in `mapData` (syncs to viewers).
- [ ] **S3 L4 Object system** — Object Builder (objectVoxelSizeFt) + prop library + Object
      Painter (scatter + hand-place), InstancedMesh per prop.
- [ ] **S4 L1b streaming** — chunk load/unload by camera, Worker greedy mesher, LOD, per-chunk
      IDB; then enable 1ft.
- [ ] **S5 L5 materials** — QuickJS-wasm sandbox + per-type/time-bucket cache + presets.
- [ ] **S6 L6 environment** — time static/animated, season, moon, weather, fog+radius (Sky/Stars).
- [ ] **S7 L7 lighting** — emissive + capped real point lights.
- [ ] **S8 L8 water** — Water volumes (addons/Water) + flood tool + reactive reflood.
- [ ] **S9 L9 destruction** — cannon-es debris for props + terrain carve → reflood/remesh.
- [ ] **S10 L10 multi-map** — project/map browser, thumbnails, per-map env + saved view.
- [ ] **S11 L11 optional** — STL export, .vox import, share links. (deferred unless time.)

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
