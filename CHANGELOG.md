# Changelog
All notable changes to the Character Manager project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.14.0] - 2026-06-29

### Added
- **Far-distance rendering (LOD) for streamed maps** — the 3D Map now renders a much larger area at
  once. Chunks within 2 of the camera keep full voxel detail (editable); beyond that they switch to a
  cheaper **gap-free column-surface mesh** (top + cliff skirts) so a wide view stays responsive. A new
  **View** selector picks the render distance (7×7 / 11×11 / 17×17 / **25×25** chunks); LOD updates as
  you pan. Heights/edits/tokens stay exact at every distance.

## [3.13.0] - 2026-06-29

### Added
- **Move a token to an exact spot** — type its **X/Z cell** in the Token panel, or (in Tokens mode)
  **click the ground** with a token selected to move it there. New tokens now spawn at the current
  view centre instead of a fixed corner, so they're visible on huge maps.
- **Locate a token** — a **🎯** button (token list + edit panel) centres the 3D view on a token and
  streams that area, so tokens are easy to find on large maps without hunting by drag.

### Fixed
- **Objects were buried on large (chunked) maps** — the streamed-generate object pass ran with the
  height layer off, so every prop sat at y=1 (under the terrain) and looked like it vanished. Props
  now sit on the actual terrain surface.
- **Middle-drag pan no longer scrolls the web page** — the browser's middle-click autoscroll is
  suppressed over the 3D Map canvas.

## [3.12.0] - 2026-06-28

### Added
- **Full-screen 3D Map** — a toggle expands the 3D Map tab to fill the screen (canvas + tools); the
  renderer/camera resize to the new height.

### Changed
- **Object layer is now colour-keyed** — a pixel's *colour* in the Object image selects WHICH prop to
  scatter (Tree / Pine / Bush / Rock / Boulder / Stump / Crystal, shown as a legend), so one image
  places many prop types. The Density slider controls how many. Replaces the old single-prop
  dark-threshold scatter.

### Fixed
- Objects on large (chunked) maps now spread across the whole map (an equal per-chunk share of the
  object budget) instead of clustering in the first chunks — which from the centre looked like "no
  objects were placed".

## [3.11.0] - 2026-06-28

### Added — Unlimited 3D maps (streaming engine)
- **3D streaming render for unlimited maps.** Maps larger than 256 (generated as a grid of 64-voxel
  chunks by the Image Editor) now render **and edit** directly in the **3D Map** tab — previously they
  showed only a top-down note. A new `ChunkManager` streams chunks in a radius around the camera target:
  it loads/unloads from IndexedDB and meshes each chunk **off-thread in a Web Worker** (seam-correct via a
  1-cell apron from neighbours), so a ~5000² map stays responsive a window at a time.
- **Right-drag to orbit, middle-drag to pan & explore** the streamed map; the loaded window follows the
  camera target (chunks load/unload around it).
- **Full terrain editing on big maps** — every brush (raise/lower/flatten/smooth/roughen/set-height/carve/
  paint-biome) and block place/erase works **across chunk seams** (cross-chunk edits re-mesh with no crack)
  and persists per-chunk to IndexedDB.
- Small maps (≤256) keep the unchanged single-chunk path (greedy mesh, full editing).

## [3.10.0] - 2026-06-28

### Added — Image Editor
- A dedicated host-only **Image Editor** tab (with a **full-screen** mode) that turns an uploaded
  image into a voxel map across **three layers** with a live 2D preview:
  - **Height** (brightness → elevation, max-height + invert), **Biome** (pixel colour → nearest
    biome, with a legend), **Object** (dark pixels → scattered prop; prop / threshold / density).
  - A **shared base image** plus an optional **per-layer override** image.
  - **Resolution**: choose `R px = 1 voxel`; the map size is computed as `maxDim / R`
    (e.g. a 96 px image at 1 px/voxel → a 96×96 map), capped at 256 for now.
  - Per-layer previews + a composite top-down preview; **Apply** writes the map (the 3D Map tab
    reloads automatically).
- **Adjustable map size up to 256** (single chunk). Larger maps (≈1024 via multi-chunk meshing,
  and thousands² via streaming + LOD) are a planned engine phase — see `VOXEL_3D_PLAN.md`.

## [3.9.0] - 2026-06-28

### Added / fixed — 3D Map review pass
- **Adjustable map size** — pick a square side length (16–128) per map; the terrain, grid, camera
  and topview rescale, and resizing preserves the overlapping region.
- **Image → terrain** — upload an image and bake it into the map as a **height** layer
  (brightness → elevation), a **biome** layer (colour → nearest biome), or an **object** layer
  (dark pixels → scattered props).
- **Imported token models** — give a token a 3D model (**GLB/GLTF, OBJ, STL**); it renders in
  place of the pawn (normalized to stand on the surface). FBX deferred.
- **Voxel Object Editor** — build custom voxel props in-app (layer-by-layer painter at adjustable
  resolution, live preview); saved props join the scatter/hand-place library.
- **Token rotation X/Y/Z** — set pitch/yaw/roll per token in the panel (was yaw-only).
- **Fixed possession POV** — you can now look with **left _or_ right drag** (right matched the
  build-mode orbit habit but did nothing) with pointer-capture; and exiting POV no longer leaves
  the possessed token invisible.

## [3.8.0] - 2026-06-28

### Added — 3D Map (VoxelDND)
A new host-only **3D Map** tab: a streaming-ready voxel world builder adapted from the
VoxelDND spec into the app's Svelte 5 + three.js stack. The old **Map** tab keeps its
freeform regions but no longer takes an uploaded image — its background is now the
auto-generated top-down render of the 3D Map (so it stays in sync, and players still get it
over P2P + in the zip backup, unchanged).

- **Voxel terrain engine (L1):** chunked heightmap + biome + block-overrides + carves, a greedy
  mesher (merges coplanar faces), per-chunk IndexedDB persistence, perspective + OrbitControls
  with ISO/Top presets. Raycast edit loop.
- **World Painter (L2):** Raise / Lower / Flatten / Smooth / Roughen / Set-Height / Carve +
  Paint Biome, with circle/square brush, radius/strength and optional falloff; plus single-voxel
  Place / Erase block tools.
- **Tokens (L3):** drop **characters or generic markers** as 3D pawns (initial + colour + facing
  notch + billboard label), drag to move (grid-snap, surface-snap), Q/E rotate, sizes
  tiny→gargantuan, and **possession** — a cosmetic first-person POV from a token (drag-look,
  WASD/arrows, Esc). Tokens persist in the map and appear in the topview so players see who/what
  is where.
- **Object system (L4):** a built-in prop library (pine, tree, bush, rock, boulder, stump,
  crystal) with a **scatter brush + hand-place** painter, rendered with InstancedMesh.
- **Environment (L6):** day/night with a real sky + sun, season tint, moon-lit stars, weather
  (rain/snow/storm particles), and atmospheric fog — static or animated time.
- The 3D Map is host-only authoring; the resulting topview + regions are what players see on the
  shared Map tab.

Deferred (roadmap in `VOXEL_3D_PLAN.md`): chunk streaming/Workers/LOD + 1 ft resolution,
QuickJS-sandboxed programmable materials, capped real point-lights, water volumes + flood,
destruction physics, multi-map browser, STL export.

## [3.7.1] - 2026-06-27

### Fixed
- Add/Edit Crafting Recipe modal: the **Materials Required** and **Output Items** columns no longer overflow and overlap (the "Add Output" button colliding with a delete ×). The modal is now wider (`max-w-2xl`) and the flex/grid items get `min-w-0` so they shrink to fit instead of spilling past the box. Modal gained an optional `boxClass` prop for per-use sizing.

## [3.7.0] - 2026-06-27

### Changed — symmetric (Platonic) 3D dice
- Dice whose face count is 4, 6, 8, 12, or 20 now render as the real symmetric solid — **tetrahedron, cube, octahedron, dodecahedron, icosahedron** — instead of the N-gon barrel, with one label per face. Every other count (including the d10, which is a pentagonal trapezohedron — not a Platonic solid — so it'd need custom geometry) keeps the barrel.
- Each face gets a full orientation frame (normal + in-plane up), used for both label placement and the reveal pose, so the rolled face squares up to the camera **upright by construction**. Reveal = `TILT · qFace⁻¹`.
- Face anchors are derived by grouping the solid's triangles by normal (`dot > 0.99`); a count mismatch falls back to the barrel. Validated against all five three.js geometries (grouped face count + upright/camera-facing reveal for every face).

## [3.6.1] - 2026-06-24

### Changed
- Removed "hide inventory" and "hide badges" from the DM's player-hide controls — character inventory and badges now always stay visible to players. The DM can still force-hide character stats/params, item effects & how-to-obtain, recipe details, map region details, and relationship edge labels.

## [3.6.0] - 2026-06-24

### Added — DM-controlled "Hide from players"
- The Share panel now lets the **host force-hide** parts of the players' view; **players can't toggle these** (the settings come from the DM and re-broadcast live). Hideable: character stats/params, inventory, badges; item effects & how-to-obtain; recipe details; map region details (names + loot counts); relationship edge labels.
- Enforced through the shared payload (`viewerHides`), applied in the read-only viewer. Pure `buildPublicView` carries the flags (tested).

## [3.5.0] - 2026-06-24

### Added — DM → Player live sharing (serverless, P2P)
- A **"Share"** panel lets the host (DM) go live and get a **viewer link / room code**. Players open it and view the session **read-only**, live. Direct **WebRTC P2P** (PeerJS) — game data flows browser-to-browser, no server, no account; the broker only brokers the handshake.
- **Per-tab visibility**: the host chooses which tabs to share; toggling re-broadcasts instantly. Visibility is enforced at the source — the host sends a **filtered public view** (only shared tabs, minus any entity flagged `hidden`), so players never receive hidden data. `buildPublicView` is pure + tested.
- **Many players** at once (star broadcast); the panel shows the connected count.
- **Viewer mode** (`?view=1&room=…`): in-memory only (never touches the player's own localStorage), all editing controls hidden/`inert`, only shared tabs shown. Shared images (avatars, map background) stream over the data channel.
- ⚠️ Uses public STUN; no TURN — works on typical home/mobile networks, may fail on strict/corporate NAT (a manual-paste fallback can be added later).

## [3.4.0] - 2026-06-24

### Added — 3D Dice
- A real **3D dice** builder on the Dice tab (the notation roller stays below it). Built with **Three.js** (render) + **cannon-es** (physics tumble).
- **Any number of dice**, each with **any number of faces** and **custom labels per face** (comma-separated); dice can differ from one another. Quick presets d4–d100.
- Rolling throws the dice with real physics, then each die eases to reveal its face. The **outcome is a fair uniform RNG pick** (`lib/dice3d`, tested) that the animation visualises, so results are fair and the shown face always matches the result; the sum is shown when every face is numeric.
- Each die is an N-gon **barrel** (no regular polyhedron exists for arbitrary face counts), with its labels as a strip texture.
- `diceSet` persists and is included in the zip backup.

## [3.3.1] - 2026-06-24

### Fixed
- Dragging a node in the relationship graph (and dragging/reshaping a region on the Map) no longer triggers native text-selection / a drag-image "ghost" (which could render as a large white blob). Drag handlers now `preventDefault()` and the canvases are `select-none`.

## [3.3.0] - 2026-06-24

### Added (polish)
- **Theme switcher** — a header dropdown across 10 DaisyUI themes (dark, light, dracula, synthwave, forest, business, night, cyberpunk, luxury, coffee); the choice persists to `localStorage` and applies to `<html data-theme>`.
- **Highlight relationship edges by axis** — in the graph, a "Highlight edges by" dropdown colours and thickens each edge by its value on the chosen axis (low → high ramp, thicker = higher), turning the web into a quick heat-map for one dimension.

## [3.2.0] - 2026-06-24

### Added
- **Weighted roll mode** for region loot — the DM picks **Independent** (each item rolls its own %, 0..N drops) or **Weighted** (exactly one item, `Drop%` used as a relative weight) per roll. Weighted respects and depletes finite stock.
- **Multi-axis relationships + spider/radar chart** — the DM defines global **axes** (e.g. Trust, Fear, Respect) each with its own min/max (signed ranges allowed). Each directed relationship rates every axis via sliders and is plotted as an SVG **radar chart**, overlaying the reverse edge (B→A, dashed) for asymmetry. New `RadarChart.svelte`.

### Changed
- `relationships` store gains a global `axes` array; edges gain a per-axis `values` map (auto-migrated on load). Zip backup already carries it.

### Tests
- `loot.test.mjs` now covers weighted pick + depletion (9). Suites: logic (15) + loot (9) + dice (7).

## [3.1.0] - 2026-06-24

### Added
- **Dice Roller** tab — standard notation (`2d6+3`, `1d20-1`, `2d6+1d4+2`), quick-roll buttons (d4–d100), per-roll breakdown and a session history.
- **Character Relationship Graph** tab — directed, labelled relationships between characters rendered as an interactive SVG graph; draggable nodes with persisted positions. Characters now carry a stable `id` (auto-assigned on load).
- **Region reshape/move** on the Map — an "Edit Shapes" mode adds draggable vertex handles (reshape) and lets you drag a region body to move it; changes persist.

### Changed
- Zip backup now also bundles the relationship graph (`relationships`).

### Tests
- Added `src/lib/dice.test.mjs` (7). Suites now: logic (15) + loot (7) + dice (7).

## [3.0.0] - 2026-06-23

### Major: Framework migration (vanilla JS → Svelte 5) + Map & Region Loot

Complete rewrite of the app onto **Svelte 5 + Vite + Tailwind 3 / DaisyUI 4**, preserving all existing functionality, plus a new Map feature. The legacy single-file app is kept under `legacy/` for reference.

#### Added - Map & Region Loot
- **Map tab** with an uploadable background image (stored in IndexedDB).
- **Freeform polygon regions** drawn on an SVG overlay (normalized coords, survive resize).
- **Per-region loot tables**: each item has a **% drop chance**, a per-roll quantity, and either a **depleting stock** or an **infinite** (loot-table) flag.
- **Roll**: independent per-item drop; rolled quantity (toggle to randomize or use the full amount); finite items deplete their stock; results can be **sent to a character's inventory**.
- **Zip backup** (Export/Import `.zip`): full-fidelity backup bundling `manifest.json` + images, built on demand.

#### Changed - Architecture
- Reactive Svelte stores replace the global-namespace managers, manual `innerHTML` re-renders, and the 1-second `localStorage` polling.
- Images (avatars + map backgrounds) moved to **IndexedDB** as Blobs (avoids the localStorage quota / silent-data-loss risk); avatars auto-migrate from legacy base64 on first load.
- Single shared toast and reactive modals replace the duplicated toast + `setTimeout` modal-close hacks.

#### Notes
- Existing `localStorage` data (characters/badges/items/recipes) loads unchanged.
- The legacy "Live Mode" 1s polling is superseded by reactive stores (removed).
- Pure logic covered by self-checks: `src/lib/logic.test.mjs` (15) and `src/lib/loot.test.mjs` (7).

## [2.0.0] - 2025-07-13

###  Major Update: Complete Character Management Ecosystem

This release represents a complete transformation from a basic character manager to a comprehensive character management ecosystem with advanced inventory, item effects, and crafting systems.

###  Added - Item Encyclopedia System
- **Item Database**: Comprehensive item encyclopedia with descriptions, effects, and acquisition methods
- **Item Effects System**: Complex item effects that can modify character stats and custom parameters
- **Use Item Functionality**: Apply item effects to characters with automatic parameter creation
- **Item Search**: Advanced filtering by name, description, effects, or acquisition method
- **Smart Suggestions**: Auto-complete for items based on existing database
- **Item Wiki Priority**: Item encyclopedia serves as primary source for all item data

###  Added - Crafting System
- **Recipe Management**: Create and manage crafting recipes with materials and outputs
- **Bulk Crafting**: Craft multiple quantities at once with intelligent material validation
- **Material Validation**: Real-time checking of available materials vs. required materials
- **Crafting Preview**: Live preview showing materials needed and outputs received
- **Max Quantity Calculation**: Automatically determine maximum craftable amount
- **Recipe Search**: Filter recipes by name, materials, or outputs
- **Character Crafting**: Direct crafting from character cards with inventory integration

###  Added - Enhanced User Interface
- **Three-Tab Interface**: Separate tabs for Characters, Items, and Crafting management
- **Enhanced Modals**: Improved modal management with reliable closing mechanisms
- **Real-time Updates**: Live preview calculations and material validation
- **Enhanced Search**: Advanced filtering capabilities across all systems
- **Improved Navigation**: Seamless switching between management modes

###  Added - Technical Improvements
- **Modular Architecture**: Separate JavaScript managers for different functionalities:
  - character-manager.js: Core character management
  - item-manager.js: Item encyclopedia and effects system
  - crafting-manager.js: Recipe and crafting system
- **Startup Initialization**: All managers initialize at application load
- **Duplicate Prevention**: Protection against multiple manager initialization
- **Enhanced Data Integrity**: Validation and cleanup for all database systems
- **Centralized Suggestions**: Single source of truth for item auto-complete

###  Enhanced - Existing Features
- **Inventory System**: Enhanced with item encyclopedia integration
- **Character Management**: Integrated with crafting and item usage systems
- **Data Persistence**: Extended to support items database and crafting recipes
- **Auto-Parameter Creation**: Items can automatically create missing character parameters
- **Smart Tooltips**: Enhanced feedback and status messages

###  Fixed
- **Modal Closing**: Enhanced reliability for all modal interactions
- **Data Synchronization**: Improved consistency between different systems
- **Initialization Issues**: Crafting recipes now load before first use
- **Suggestion Updates**: Real-time updates when database changes

###  Changed
- **Data Priority**: Item Wiki now serves as primary source over character inventories
- **UI Organization**: Reorganized interface into logical tab sections
- **Performance**: Optimized initialization and data loading
- **User Flow**: Streamlined workflows for item usage and crafting

###  File Structure
`
Character Manager v2.0.0/
 characterNoto.html          # Main application (enhanced UI)
 character-manager.js        # Core character management
 item-manager.js            # Item encyclopedia & effects
 crafting-manager.js        # Crafting & recipe system
 README.md                  # Updated documentation
`

###  Data Format Updates
- **Item Database**: New localStorage key itemDatabase
- **Crafting Recipes**: New localStorage key craftingRecipes
- **Character Data**: Enhanced compatibility with new systems
- **Badge Data**: Maintained backward compatibility

###  AI Development Notice
This application was created with the assistance of AI technology, representing a collaborative approach to software development that combines human creativity with AI capabilities.

---

## [1.0.0] - 2025-01-13

### Added
- Initial release of Character Manager
- Character creation and management system
- Avatar upload and management with automatic compression
- Custom parameter system (range sliders and checkboxes)
- Dynamic badge system with JavaScript conditions
- Inventory management with item moving capabilities
- Multiple view modes (Standard, Tile, Live)
- Import/Export functionality for JSON data
- Drag-and-drop character reordering
- Real-time summary statistics
- Auto-complete suggestions for items and parameters
- Mobile-responsive design
- Dark theme with DaisyUI components
- Multilingual support with Noto Sans Thai font
- Automatic localStorage persistence
- Character navigation menu
- Toast notifications for save confirmations

### Features
- **Character Types**: Standard characters with hunger/thirsty stats and non-characters
- **Custom Parameters**: Configurable range and checkbox parameters with color themes
- **Badge System**: Conditional badges based on character stats and properties
- **Inventory System**: Add, edit, move, and track items between characters
- **View Modes**:
  - Standard mode for full character management
  - Tile mode for compact overview
  - Live mode for real-time updates and display
- **Data Management**: Complete import/export with JSON format
- **User Interface**: Modern, responsive design with accessibility features

### Technical Details
- Single HTML file architecture for easy deployment
- Vanilla JavaScript with no external dependencies (except SortableJS for drag-drop)
- TailwindCSS and DaisyUI for styling
- Browser localStorage for data persistence
- Mobile-optimized touch interactions

### Browser Support
- Chrome 70+
- Firefox 65+
- Safari 12+
- Edge 79+

---

## Migration Guide: v1.0.0  v2.0.0

### Data Compatibility
- **Character Data**: Fully backward compatible
- **Badge Data**: Fully backward compatible
- **New Features**: Item database and crafting recipes are optional additions

### New Capabilities
1. **Item Encyclopedia**: Create items with complex effects in the Items tab
2. **Crafting System**: Design recipes and craft items in the Crafting tab
3. **Enhanced Item Usage**: Use items from encyclopedia on characters
4. **Bulk Operations**: Craft multiple quantities with material validation

### Recommended Upgrade Process
1. **Backup Data**: Export your existing character data
2. **Replace Files**: Update to new HTML and JavaScript files
3. **Gradual Migration**: Start adding items to the encyclopedia
4. **Create Recipes**: Design crafting recipes for your use case

---

For more details about each release, see the [GitHub releases page](https://github.com/pinsorn/CharacterNoto/releases).
