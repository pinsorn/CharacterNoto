# VoxelDND 3D Map — Feature Checklist & Review

Living checklist for the 3D Map feature (shipped v3.8.0). Each item: **status · how it was built · Comment** (fill the Comment line as you review; I'll address them per layer).

Legend: ✅ done & E2E-verified · 🟡 partial/known-rough · ⬜ not built yet (roadmap)
Files: `src/components/Map3DTab.svelte` (host) · `src/components/map3d/*` · `src/lib/voxel/*`

***

## L1 — Voxel terrain engine ✅

* ✅ **Chunk data model** — heightmap + biome + block overrides + carves; composed into a dense grid. *(`src/lib/voxel/world.js`,* *`types.js`)*

  > Comment: Add size map customization. Add image to terrain (Biome Layer/Object Layer/Height Layer)

* ✅ **Greedy mesher** — merges coplanar same-colour faces into quads; pure + unit-tested. *(`mesher.js`,* *`voxel.test.mjs`)*

  > Comment:

* ✅ **Per-chunk persistence** — own IndexedDB DB `voxelworld` (not localStorage). *(`chunkStore.js`)*

  > Comment:

* ✅ **Camera** — perspective + OrbitControls (right-drag orbit, wheel zoom, middle pan), ISO/Top presets.

  > Comment:

* ✅ **Raycast edit loop** — left-drag edits; rebuild throttled to 1×/frame.

  > Comment:

## L2 — World Painter ✅

* ✅ **Height brushes** — Raise / Lower / Flatten / Smooth / Roughen / Set-Height / Carve. *(`map3d/brushes.js`, tested)*

  > Comment:

* ✅ **Paint Biome** — grass/sand/rock/snow/dirt/forest surface+subsurface colours.

  > Comment:

* ✅ **Block tools** — single-voxel Place / Erase (6 block types).

  > Comment:

* ✅ **Brush params** — radius, strength, circle/square shape, optional linear falloff.

  > Comment:

## L3 — Tokens + possession ✅

* ✅ **Add tokens** — characters (linked, shows initial) or generic markers; distinct palette colours. *(`map3d/tokens.js`,* *`TokenPanel.svelte`)*

  > Comment: custom Character's model (GLB? OBJ?)

* ✅ **Pawn mesh** — base disc + body + facing notch + billboard label sprite; surface-snapped.

  > Comment:

* ✅ **Move** — drag on grid (cell snap), follows terrain height.

  > Comment:

* ✅ **Edit** — label, colour, size (tiny→gargantuan), facing (Q/E or ⟲⟳), height override, note, delete.

  > Comment:

* ✅ **Possession POV** — first-person from a token; drag-look + WASD/arrows, Esc exits; own pawn hidden.

  > Comment: Cannot move/Rotate camera in possession POV rotation (X Y Z yaw) can be custom in token selection 

* ✅ **Sync to players** — tokens in `mapData` + carried over P2P/zip; appear baked in the Map-tab topview.

  > Comment:

## L4 — Object / prop system ✅

* ✅ **Prop library** — pine, tree, bush, rock, boulder, stump, crystal (vertex-coloured, low-poly). *(`map3d/objects.js`, tested)*

  > Comment: Add object editor to create or edit new objects (voxel) with customizable resolution

* ✅ **Scatter brush** — radius/density/jitter/scaleVar/yawRandom, seeded (deterministic). *(`ObjectPanel.svelte`)*

  > Comment:

* ✅ **Hand-place** — single prop per click.

  > Comment:

* ✅ **Render** — one InstancedMesh per prop type; persists in `mapData.objects`; bakes into topview.

  > Comment:

## L6 — Environment ✅

* ✅ **Time of day** — sky dome + sun azimuth/elevation, day/night light colour; static or animated clock. *(`map3d/environment.js`,* *`EnvPanel.svelte`)*

  > Comment:

* ✅ **Stars / moon** — night starfield, brightness scales with moon phase.

  > Comment:

* ✅ **Weather** — rain / snow / storm particles, intensity slider.

  > Comment:

* ✅ **Fog** — atmospheric FogExp2 by radius + weather.

  > Comment:

* 🟡 **Season** — tints sky/light/fog only (NOT per-biome terrain recolour — that needs L5 materials).

  > Comment:

## Topview → Map integration ✅

* ✅ **Topview render** — top-down ortho snapshot over fixed extent → PNG → `mapData.backgroundId`.

  > Comment:

* ✅ **Map tab** — image upload removed; background is the topview; regions still drawable on top; hint when empty.

  > Comment:

* ✅ **Host-only** — 3D Map tab hidden from viewers; players see only the resulting Map tab.

  > Comment:

## Known rough edges 🟡

* 🟡 **Topview letterbox** — square grid in a 16:9 box → blue bars left/right.

  > Comment:

* 🟡 **Noon sky pale** — Sky shader washes white at zenith; dawn/dusk look better.

  > Comment:

* 🟡 **Always-on WebGL** — Map3DTab mounts even while tab hidden (like DiceScene) → 2nd render loop.

  > Comment:

* 🟡 **Viewer path** — tokens/objects added to publicview (unit-tested, additive) but not re-E2E'd live.

  > Comment:

***

## Not built yet (roadmap) ⬜

* ⬜ **L8 Water** — water/lava/acid volumes + flood tool + reactive re-flood. *(recommended next)*

  > Comment:

* ⬜ **L10 Multi-map** — multiple maps per project, browser + thumbnails, per-map env/view.

  > Comment:

* ⬜ **L7 Point-lights** — capped real point lights (torches/glow) beyond emissive.

  > Comment:

* ⬜ **L9 Destruction** — debris physics (cannon-es) for props + terrain carve → re-flood/remesh.

  > Comment:

* ⬜ **L5 Programmable materials** — QuickJS-wasm sandboxed material scripts + season biome palettes.

  > Comment:

* ⬜ **L1b Streaming** — chunk streaming / Web Worker mesher / LOD, then 1 ft resolution.

  > Comment:

* ⬜ **L11 STL export · .vox import · share-link gallery**.

  > Comment:

* ⬜ **Object Builder** — author custom voxel props in-app (L4 used a built-in library only).

  > Comment:

* ⬜ **Imported-mesh tokens** — glTF/OBJ/FBX/STL token models + animation (L3 used pawns only).

  > Comment:
