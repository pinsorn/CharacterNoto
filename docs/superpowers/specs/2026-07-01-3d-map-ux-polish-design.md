# 3D Map UX Polish — Design

**Date:** 2026-07-01
**Status:** Approved (scope + key decisions confirmed by user)
**Baseline:** v3.14.0 (live at https://pinsorn.github.io/CharacterNoto/)

## Goal

Make the **existing** 3D Map easier to use. This is a polish round — reduce friction in
the way current features are used. It is **not** a feature-expansion round.

User-confirmed focus, three friction areas:
1. **Controls / modes** — confusing.
2. **Image → terrain** workflow — confusing.
3. **Token / object** management — awkward.

## Key decisions (locked with user)

- **Interaction model: KEEP the current mouse scheme** (left-drag = edit, right-drag = orbit,
  middle-drag = pan, wheel = zoom). The root problem is *discoverability*, not the scheme itself
  (left-drag = act is a normal editor convention). Fix it with visible affordances, not relearning.
- **Undo / redo: DEFERRED** to a future round. Undo across streaming chunks is a non-trivial build,
  not polish.

## Non-goals (deferred — kept honest per original "most features" ask)

- Feature expansion (fog-of-war, measurement tools, lighting/time presets, saved camera views,
  multiplayer cursors, etc.) → a later round.
- Full undo / redo system (including across streaming chunks).
- Interaction-model overhaul (current scheme kept by decision).

---

## Workstream 1 — Controls / modes clarity (`Map3DTab.svelte`)

**Problem (confirmed in code):** the mouse scheme lives in a faint `text-xs opacity-60` hint line
(`Map3DTab.svelte:708`); the top toolbar crowds Mode + Camera + Full screen + View + Size +
Regenerate Topview + Reset into one wrapping row; `mode` is **local component state** (`:66`) so it
resets to `terrain` on every remount; the active mode/tool is not strongly signalled.

**Changes:**

1. **Control HUD** — a small, always-on legend overlaid in a corner of the canvas showing the
   *current mode* and the *live mouse map*, updating per mode (terrain / tokens / objects / POV).
   Replaces reliance on the faint hint line (a compact form of the same text). `pointer-events:none`
   so it never blocks the canvas; repositions correctly in full-screen. Collapsible; collapsed state
   remembered.
2. **Cursor affordance** — the canvas cursor reflects the active mode/tool (crosshair while a paint
   tool is armed, move during token drag, default/grab otherwise). Cheap CSS cursor swap; must not
   fight OrbitControls during right-drag orbit.
3. **First-visit hint** — a one-time tip bubble near the HUD ("Left-drag edits · Right-drag orbits"),
   dismissed via a `hintSeen` flag in `voxelUI` (localStorage-persisted).
4. **Toolbar declutter** — group the top row into clusters: **Mode** (Terrain / Tokens / Objects) ·
   **Camera** (ISO / Top / Full screen) · **Map** (Size / Regenerate Topview / Reset moved behind a
   `⋯` dropdown). View-distance stays visible for big maps. Less wrapping, clear grouping.
5. **Persist `mode`** in the `voxelUI` store so it survives tab switches / remounts (currently local).
6. **Stronger active-mode emphasis** — ensure the active mode/tool reads at a glance (the HUD already
   names the mode; keep the join `btn-active` contrast strong).

**Interfaces / boundaries:** HUD is a presentational block driven by `mode`, `$voxelUI.tool`,
`possessing`, `bigMap`. **No change to pointer logic or the mouse scheme.** `voxelUI` gains
`mode` (string), `hintSeen` (bool), `hudCollapsed` (bool) — all default-safe for existing users.

---

## Workstream 2 — Image → terrain consolidation (`ImageEditor.svelte` + `Map3DTab` import panel)

**Problem (confirmed in code):** there are **two** image-import paths — the host-only **Image
Editor** tab (`ImageEditor.svelte`) and a separate **"Import image → terrain"** collapse inside
Map3DTab terrain mode (`ImageTerrainPanel` → `applyImage`, `Map3DTab.svelte:732`). That is
duplicate UI + duplicate maintenance and it is unclear which to use. Resolution is expressed as
`R px = 1 voxel` (`:243`) — inverted/indirect relative to the output map size. The Object layer
requires hand-painting exact RGB colours with only a read-only legend to go on.

**Changes:**

1. **Single canonical path** — remove the `ImageTerrainPanel` collapse from Map3DTab; replace it
   with one **"🖼 Open Image Editor"** button that switches to the Image Editor tab. Retire
   `ImageTerrainPanel.svelte` + the `applyImage` handler **only if** nothing else depends on them
   (verify first). Keep `lib/voxel/imageTerrain.js` (shared by both — unchanged).
   **Backward-compat:** the Image Editor already handles small *and* large maps via `onApply`;
   confirm a small image still yields a 3D-**editable** single chunk. No `mapData` / persisted-map
   format change.
2. **Resolution clarity** — make the **output map size** the primary readout and add a
   plain-language hint (e.g. relabel toward "Detail: Fine / Medium / Coarse → N×N" and/or a one-line
   "fewer px per voxel = more detail, larger map"). Keep the live `→ N×N` badge. Minimal change.
3. **Object-layer authoring help** — make each Object legend swatch **click-to-copy its RGB**, plus a
   short "how to paint the object image" note, so the user can author the object image in any editor.
   No new authoring canvas (YAGNI).

**Interfaces / boundaries:** touches `ImageEditor.svelte` (clarity + copy) and `Map3DTab.svelte`
(remove the second panel, add the button). Because WS2 edits `Map3DTab.svelte`, it **overlaps WS1**
— see sequencing. `imageTerrain.js` stays unchanged.

---

## Workstream 3 — Token / object management (`TokenPanel.svelte` + `ObjectPanel.svelte`)

**Problem (confirmed in code):** the TokenPanel edit area is a dense vertical stack of ~11 control
groups (label, colour, size, rotate, rotation XYZ, model, position XZ, height, note, possess, delete)
with no grouping (`TokenPanel.svelte:133-237`); the token list is flat with no filter when there are
many (`:113`); "click ground to move a selected token" is non-obvious (addressed by WS1's HUD);
ObjectPanel's single **"Clear objects"** deletes **all** placed objects with no guard and no undo
(`ObjectPanel.svelte:97`).

**Changes:**

1. **Group the TokenPanel edit area** into labelled sections — **Identity** (label, colour),
   **Transform** (size, facing, rotation XYZ, position XZ, height, 🎯 go-to), **Model**
   (import / clear), **Notes** (note). Thin dividers / small headers; Transform + Model optionally
   collapsible. No behaviour change — readability only.
2. **Token list filter** — a search input + count shown once tokens exceed a small threshold
   (e.g. > 6); show each token's cell position in its row; optionally label creature vs marker.
3. **ObjectPanel safety (no undo stack)** — keep within the deferred-undo decision: add
   **"Clear current prop"** (filters out only the active `propId`) and **guard "Clear all" with a
   confirm**. No last-batch pop / no undo history — just prevent accidental total loss.

**Interfaces / boundaries:** `TokenPanel.svelte` + `ObjectPanel.svelte` only — **fully disjoint**
from WS1/WS2 → parallel-safe.

---

## Architecture / data flow

- New state is limited to `voxelUI` additions: `mode`, `hintSeen`, `hudCollapsed`. All guarded /
  default-safe for users with older persisted state.
- **No `mapData` schema change** → backward compatible with persisted v3.14.0 maps.
- No change to the voxel libs, `chunkStore`, ChunkManager, topview pipeline, or P2P.

## Error handling / edge cases

- New `voxelUI` fields must read safely when absent (existing users).
- Removing `ImageTerrainPanel` must not break small-map image import — the Image Editor path covers
  it; **verify a small image still generates a 3D-editable chunk**.
- HUD: `pointer-events:none`; must reposition in full-screen; must not overlap the existing
  Streaming / POV overlays.
- Cursor swaps must not fight OrbitControls during right-drag.

## Testing

- **Unit (`*.test.mjs`):** token list filter predicate, object "clear current prop" filter,
  resolution→size label mapping (pure functions).
- **E2E (Playwright, per project norm):** host mode → 3D Map → HUD renders and updates per mode ·
  toolbar groups render · "Open Image Editor" switches tabs · small image generates an editable map ·
  TokenPanel sections + filter work · ObjectPanel clear-current-prop + guarded clear-all.
- **Visual QA:** one AGY vision pass on a screenshot of the polished 3D Map (with a map loaded);
  fold notes back. One Codex adversarial review per workstream diff before merge.

## Workstream sequencing (implementation)

- **WS1 and WS2 both edit `Map3DTab.svelte`** → run them as a single sequential Map3DTab workstream
  (WS1 first, then WS2) — never two subagents on that file at once.
- **WS3** (`TokenPanel` + `ObjectPanel`) is disjoint → runs in **parallel** with the Map3DTab
  workstream.
- Overseer (main agent) integrates, runs the consolidated unit + E2E gate, then commits, pushes, and
  releases the next minor (**v3.15.0**).

## Deferred to a future round

- Feature expansion (fog-of-war, measurement, lighting/time presets, saved camera views,
  multiplayer cursors, …).
- Full undo / redo (including across streaming chunks).
- Interaction-model overhaul (current scheme kept by decision).
