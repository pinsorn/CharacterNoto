# 3D Map UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing 3D Map easier to use — clarify controls/modes, consolidate the image→terrain workflow, and tidy token/object management — without adding new features or changing the mouse scheme.

**Architecture:** Pure-UI polish on existing Svelte 5 components. New state is three `voxelUI` fields (`mode`, `hintSeen`, `hudCollapsed`). Two tiny pure helpers (`filterTokens`, `clearProp`) carry the only real unit logic; everything else is component markup verified by build + Playwright E2E. No `mapData` schema change, no voxel-lib change, no new dependency.

**Tech Stack:** Svelte 5 (runes: `$state`/`$derived`/`$effect`/`$props`/`$bindable`), daisyUI 4.12.24 + Tailwind 3, Three.js 0.184 (untouched here), Vite 6. Tests are self-contained `node <file>.test.mjs` runnable checks (`node:assert`, fake THREE where needed) — no test framework.

## Global Constraints

- **Mouse scheme is FROZEN.** WS1 is discoverability only — do NOT touch `controls.mouseButtons` (`Map3DTab.svelte:491`) or the pointer handlers' scheme (left=edit, right=orbit, middle=pan, wheel=zoom).
- **`persisted()` does NOT merge defaults** (`stores.js:12` — it does `start = JSON.parse(raw)`). Existing users will NOT have the new `voxelUI` fields. ALWAYS read them defensively: `$voxelUI.mode ?? 'terrain'`, etc. Never assume the store default reaches an existing user.
- **No `mapData` schema change** — stays backward compatible with persisted v3.14.0 maps.
- **No new npm dependencies.**
- Svelte 5 runes only (this codebase uses `$state`/`$derived`/`$effect`, immutable `store.update` spreads).
- Build must stay clean: `npm run build`.
- **Commit after each task. Do NOT `git push`** — the overseer runs the final gate, merge, and release.
- Work on branch `feat/3d-map-ux-polish` (already created; spec already committed there).

---

### Task 1: Add HUD/mode state to `voxelUI`

**Files:**
- Modify: `src/lib/voxel/store.js:5-19` (the `voxelUI` default object)

**Interfaces:**
- Produces: `voxelUI.mode` (`'terrain'|'tokens'|'objects'`, default `'terrain'`), `voxelUI.hintSeen` (bool, default `false`), `voxelUI.hudCollapsed` (bool, default `false`).

- [ ] **Step 1: Add the three fields** to the `voxelUI` default in `store.js`, after `viewDist`:

```js
  viewDist: 6, // streaming render distance in chunks (far-LOD radius); near 2 chunks stay full detail
  mode: 'terrain', // 3D Map authoring mode: terrain | tokens | objects (persisted; read defensively)
  hintSeen: false, // first-visit controls hint dismissed
  hudCollapsed: false, // control-legend HUD collapsed
```

- [ ] **Step 2: Verify build** — Run: `npm run build` — Expected: clean build, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/voxel/store.js
git commit -m "feat(map): persist 3D Map mode + HUD flags in voxelUI"
```

> No unit test: adding default fields is trivial. The backward-compat risk (missing fields for existing users) is handled by defensive reads in Tasks 2-3 and covered by E2E.

---

### Task 2: WS1 — Control HUD, cursor affordance, first-visit hint, toolbar declutter, persisted mode (`Map3DTab.svelte`)

**Files:**
- Modify: `src/components/Map3DTab.svelte` (script `:66`, toolbar `:622-652`, hint line `:708-713`, canvas `:715-725`)

**Interfaces:**
- Consumes: `voxelUI.mode`/`hintSeen`/`hudCollapsed` (Task 1).
- Produces: nothing new for later tasks (UI only). Task 3 will edit the SAME file — Task 3 MUST run after this task is committed.

- [ ] **Step 1: Persist `mode`** — replace local `let mode = $state('terrain');` (`:66`) with a derived-from-store value and a setter that writes the store. Read defensively:

```js
  // mode is persisted in voxelUI (read defensively — persisted() doesn't merge defaults for old users)
  let mode = $state(get(voxelUI).mode ?? 'terrain');
  function setMode(m) { mode = m; voxelUI.update((u) => ({ ...u, mode: m })); }
```
Then replace the three mode buttons' `onclick={() => (mode = 'terrain')}` etc. (`:626-628`) with `onclick={() => setMode('terrain')}` (and `'tokens'`, `'objects'`).

- [ ] **Step 2: Declutter the top toolbar** (`:623-652`). Keep Mode + Camera (ISO/Top) + Full screen + (big-map) View visible. Move **Size**, **Regenerate Topview**, **Reset** into a daisyUI dropdown so they stop crowding the row. Replace the `{#if !bigMap}` Size/Regenerate/Reset block with:

```svelte
    {#if !bigMap}
      <div class="dropdown dropdown-end">
        <button tabindex="0" class="btn btn-xs btn-ghost" aria-label="Map options">⋯ Map</button>
        <div tabindex="0" class="dropdown-content z-10 menu bg-base-200 rounded-box shadow p-2 gap-2 w-48">
          <label class="flex items-center justify-between gap-1 text-xs">Size
            <select class="select select-xs select-bordered" value={$voxelUI.mapSize} onchange={(e) => resizeMap(+e.target.value)}>
              {#each MAP_SIZES as n}<option value={n}>{n}×{n}</option>{/each}
            </select>
          </label>
          <button class="btn btn-xs btn-secondary" onclick={renderTopview}>Regenerate Topview</button>
          <button class="btn btn-xs btn-ghost" onclick={resetMap}>Reset</button>
        </div>
      </div>
    {/if}
```

- [ ] **Step 3: Add the Control HUD** overlay inside the `.relative` canvas wrapper (`:715`), after the `{#if bigMap}` streaming hint. It is `pointer-events-none`, repositions in full-screen automatically (absolute within the wrapper), and is collapsible. Define a derived legend first (script):

```js
  // Live control legend per mode (mouse scheme is fixed; this only describes it).
  const hudLines = $derived(
    possessing ? ['POV', 'Drag = look', 'WASD / arrows = move', 'Esc = exit']
    : mode === 'tokens' ? ['Tokens', 'Left-click = select', 'Drag / click ground = move', 'Right-drag = orbit · Wheel = zoom', 'Q/E rotate · Possess = POV']
    : mode === 'objects' ? ['Objects', 'Left-drag = scatter / place', 'Right-drag = orbit · Wheel = zoom', 'Pick prop & params below']
    : ['Terrain', 'Left-drag = edit', 'Right-drag = orbit', 'Middle-drag = pan · Wheel = zoom']
  );
```

Markup (inside `.relative`, sibling to the existing overlays):

```svelte
    <div class="absolute bottom-2 left-2 text-[11px] leading-tight rounded bg-base-300/85 shadow pointer-events-auto select-none">
      <button class="flex items-center gap-1 px-2 py-1 font-semibold w-full text-left"
        onclick={() => voxelUI.update((u) => ({ ...u, hudCollapsed: !($voxelUI.hudCollapsed ?? false) }))}
        title="Toggle controls help">
        <span>🎮 {hudLines[0]}</span>
        <span class="opacity-60">{($voxelUI.hudCollapsed ?? false) ? '▸' : '▾'}</span>
      </button>
      {#if !($voxelUI.hudCollapsed ?? false)}
        <div class="px-2 pb-1 opacity-80">
          {#each hudLines.slice(1) as l}<div>{l}</div>{/each}
        </div>
      {/if}
    </div>
```

- [ ] **Step 4: First-visit hint** — a one-time bubble near the HUD, dismissed via `hintSeen`. Add inside `.relative`:

```svelte
    {#if !($voxelUI.hintSeen ?? false)}
      <div class="absolute bottom-14 left-2 max-w-[15rem] text-[11px] bg-info text-info-content rounded shadow px-2 py-1 pointer-events-auto">
        Tip: <b>Left-drag</b> edits · <b>Right-drag</b> orbits · <b>Middle-drag</b> pans. See 🎮 anytime.
        <button class="btn btn-2xs btn-ghost ml-1 underline" onclick={() => voxelUI.update((u) => ({ ...u, hintSeen: true }))}>Got it</button>
      </div>
    {/if}
```

- [ ] **Step 5: Cursor affordance** — bind a cursor class to the canvas container (`:716`). Add to the script:

```js
  const canvasCursor = $derived(possessing ? 'cursor-grabbing' : mode === 'tokens' ? 'cursor-pointer' : 'cursor-crosshair');
```
and add `{canvasCursor}` to the container `class`. Keep `style` as-is. The cursor only sets the idle hint; OrbitControls right-drag still works (it does not change the CSS cursor).

- [ ] **Step 6: Trim the faint hint line** (`:708-713`) — the HUD now carries this. Replace the whole block with a single compact line kept for screen-reader / no-canvas fallback, OR delete it (HUD replaces it). Minimal: delete `:708-713`.

- [ ] **Step 7: Verify build** — Run: `npm run build` — Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/components/Map3DTab.svelte
git commit -m "feat(map): control HUD, cursor + first-visit hint, declutter toolbar, persist mode (WS1)"
```

> Verified by E2E in Task 6 (HUD renders + updates per mode; mode survives a tab switch; toolbar groups render).

---

### Task 3: WS2 — Consolidate image→terrain, clarify resolution, copyable object swatches (`Map3DTab.svelte` + `ImageEditor.svelte`)

**Files:**
- Modify: `src/components/Map3DTab.svelte` (the `{#if mode === 'terrain'}` import collapse `:732-737`; import line `:29`)
- Modify: `src/components/ImageEditor.svelte` (resolution block `:242-250`; object legend `:331-338`)
- Possibly delete: `src/components/map3d/ImageTerrainPanel.svelte` + the `applyImage` handler (`:460-476`) and its imports — **only if** nothing else references them.
- Reference: `src/App.svelte` (host tab switching — find how the active tab is set, and the Image Editor tab id).

**Interfaces:**
- Consumes: App's tab state (to switch to the Image Editor tab).
- MUST run AFTER Task 2 (same file `Map3DTab.svelte`) is committed.

- [ ] **Step 1: Find the tab mechanism** — Run: `grep -n "ImageEditor\|activeTab\|tab ===\|'image'\|3dmap" src/App.svelte` — note the store/state and the Image Editor tab id used to switch tabs.

- [ ] **Step 2: Replace the in-tab import panel with a button.** In `Map3DTab.svelte`, remove the `{#if mode === 'terrain'} <details>…ImageTerrainPanel…</details>` block (`:732-737`) and add, in the terrain tools row, a button that switches to the Image Editor tab (use the exact tab setter found in Step 1), e.g.:

```svelte
      <button class="btn btn-xs btn-accent" onclick={openImageEditor} title="Build terrain from an image">🖼 Image → Map</button>
```
with a script helper `openImageEditor()` that sets the App active tab to the Image Editor tab. If the tab state lives in `App.svelte` local state, lift the setter via a prop or a small shared store — prefer the existing pattern in App.svelte (check Step 1 result).

- [ ] **Step 3: Retire dead code IF unused** — Run: `grep -rn "ImageTerrainPanel\|applyImage" src/` — if the only hits are in `Map3DTab.svelte`, remove the `ImageTerrainPanel` import (`:29`), the `applyImage` function (`:460-476`), and delete `src/components/map3d/ImageTerrainPanel.svelte`. Keep `src/lib/voxel/imageTerrain.js` (still used by `ImageEditor`/`applyImageMap`). If `ImageTerrainPanel` is referenced elsewhere, leave it and just hide it behind the new button.

- [ ] **Step 4: Resolution clarity in `ImageEditor.svelte`** (`:242-250`). Add a one-line plain-language hint under the resolution select and keep the live `→ N×N` badge. Replace the resolution `<label>` inner caption with:

```svelte
        <label class="block text-xs">
          <span class="flex justify-between"><span>Detail — {R} px = 1 voxel</span><span class="opacity-60">{N ? N + '×' + N + ' map' : ''}</span></span>
          <select class="select select-bordered select-sm w-full" bind:value={R}>
            <option value={1}>1 px / voxel — finest, biggest map</option>
            <option value={2}>2 px / voxel — fine</option>
            <option value={4}>4 px / voxel — medium</option>
            <option value={8}>8 px / voxel — coarse, smallest map</option>
          </select>
          <span class="text-[10px] opacity-60">Fewer px per voxel = more detail and a larger map.</span>
        </label>
```

- [ ] **Step 5: Copyable object swatches** in `ImageEditor.svelte` object legend (`:331-338`). Make each swatch a button that copies its RGB to the clipboard, plus a short note. Replace the legend `<div class="flex flex-wrap gap-1">…</div>` for objects with:

```svelte
      <div class="text-xs opacity-70">Pixel <strong>colour</strong> → which prop. Click a swatch to copy its RGB, then paint the object image with it:</div>
      <div class="flex flex-wrap gap-1">
        {#each OBJECT_KEYS.filter((k) => k.propId) as k}
          <button type="button" class="inline-flex items-center gap-1 text-[10px] badge badge-sm badge-ghost cursor-pointer"
            title="Copy rgb({k.color[0]},{k.color[1]},{k.color[2]})"
            onclick={() => navigator.clipboard?.writeText(`rgb(${k.color[0]}, ${k.color[1]}, ${k.color[2]})`)}>
            <span class="w-3 h-3 rounded-sm border border-base-300" style="background: rgb({k.color[0]},{k.color[1]},{k.color[2]})"></span>{k.name}
          </button>
        {/each}
      </div>
```

- [ ] **Step 6: Verify build** — Run: `npm run build` — Expected: clean (no unresolved imports if Step 3 removed files).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(map): one image→terrain entry point + clearer resolution + copyable object swatches (WS2)"
```

---

### Task 4: WS3a — TokenPanel sections + searchable list (`tokenFilter.js` + `TokenPanel.svelte`)

**Files:**
- Create: `src/components/map3d/tokenFilter.js`
- Create: `src/components/map3d/tokenFilter.test.mjs`
- Modify: `src/components/map3d/TokenPanel.svelte` (list `:113-130`, edit area `:133-237`)

**Interfaces:**
- Produces: `filterTokens(tokens, query)` → filtered array (case-insensitive match on `label`; empty/blank query returns all).
- DISJOINT from Map3DTab → may run in parallel with Tasks 2-3.

- [ ] **Step 1: Write the failing test** — `src/components/map3d/tokenFilter.test.mjs`:

```js
// Runnable check: node src/components/map3d/tokenFilter.test.mjs
import assert from 'node:assert';
import { filterTokens } from './tokenFilter.js';

let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); pass++; console.log('ok   -', n); } catch (e) { fail++; console.error('FAIL -', n, '\n      ', e.message); } };
const toks = [
  { id: '1', label: 'Goblin', cell: { gx: 1, gz: 2 } },
  { id: '2', label: 'Hero Knight', cell: { gx: 3, gz: 4 } },
  { id: '3', label: 'goblin scout', cell: { gx: 5, gz: 6 } },
];

t('empty query returns all', () => assert.equal(filterTokens(toks, '').length, 3));
t('blank/whitespace returns all', () => assert.equal(filterTokens(toks, '  ').length, 3));
t('case-insensitive label match', () => assert.equal(filterTokens(toks, 'goblin').length, 2));
t('partial match', () => assert.equal(filterTokens(toks, 'knight').length, 1));
t('no match returns empty', () => assert.equal(filterTokens(toks, 'dragon').length, 0));
t('null tokens → empty', () => assert.equal(filterTokens(null, 'x').length, 0));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
```

- [ ] **Step 2: Run it, verify it fails** — Run: `node src/components/map3d/tokenFilter.test.mjs` — Expected: FAIL (`Cannot find module './tokenFilter.js'`).

- [ ] **Step 3: Implement** — `src/components/map3d/tokenFilter.js`:

```js
// Pure token-list filter for the 3D Map TokenPanel. Case-insensitive match on label.
export function filterTokens(tokens, query) {
  const list = tokens ?? [];
  const q = (query ?? '').trim().toLowerCase();
  if (!q) return list;
  return list.filter((t) => (t.label ?? '').toLowerCase().includes(q));
}
```

- [ ] **Step 4: Run it, verify it passes** — Run: `node src/components/map3d/tokenFilter.test.mjs` — Expected: `6 passed, 0 failed`.

- [ ] **Step 5: Searchable list in `TokenPanel.svelte`.** Import the helper, add a search box shown only when there are several tokens, and render the filtered list. In `<script>` add `import { filterTokens } from './tokenFilter.js';`, a `let query = $state('');`, and `const shown = $derived(filterTokens(tokens, query));`. Above the list (`:110`), add:

```svelte
  {#if tokens.length > 6}
    <input class="input input-xs input-bordered w-full" placeholder="Search tokens…" bind:value={query} />
  {/if}
```
Change the list `{#each tokens as t (t.id)}` (`:114`) to `{#each shown as t (t.id)}`, and add the cell position to each row (after the size badge `:122`):

```svelte
          <span class="badge badge-ghost badge-xs">{t.cell?.gx ?? '?'},{t.cell?.gz ?? '?'}</span>
```

- [ ] **Step 6: Group the edit area** (`:133-237`) into labelled sections. Wrap the existing controls with thin section headers (no behaviour change) — insert a small header `<div class="text-[10px] uppercase opacity-50 pt-1">Identity</div>` before label+colour, `Transform` before the size/rotation/position/height block, `Model` before the model row, `Notes` before the note input. Keep every existing control and handler exactly as-is.

- [ ] **Step 7: Verify build** — Run: `npm run build` — Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/components/map3d/tokenFilter.js src/components/map3d/tokenFilter.test.mjs src/components/map3d/TokenPanel.svelte
git commit -m "feat(map): searchable token list + grouped token editor sections (WS3a)"
```

---

### Task 5: WS3b — Safer object clearing (`objects.js` + `ObjectPanel.svelte`)

**Files:**
- Modify: `src/components/map3d/objects.js` (add `clearProp` export)
- Modify: `src/components/map3d/objects.test.mjs` (add a test)
- Modify: `src/components/map3d/ObjectPanel.svelte` (`:94-100`)

**Interfaces:**
- Produces: `clearProp(objects, propId)` → new array without entries whose `propId === propId`.
- DISJOINT from Map3DTab/TokenPanel → may run in parallel.

- [ ] **Step 1: Add a failing test** to `src/components/map3d/objects.test.mjs` (append, following its existing `t()` harness — match the file's style):

```js
import { clearProp } from './objects.js';
t('clearProp removes only the given prop', () => {
  const objs = [{ propId: 'pine' }, { propId: 'rock' }, { propId: 'pine' }];
  const out = clearProp(objs, 'pine');
  assert.equal(out.length, 1);
  assert.equal(out[0].propId, 'rock');
});
t('clearProp on empty/null → empty array', () => {
  assert.deepEqual(clearProp(null, 'pine'), []);
});
```
(If the import line must sit at the top, move `import { clearProp } from './objects.js';` up beside the file's other imports.)

- [ ] **Step 2: Run it, verify it fails** — Run: `node src/components/map3d/objects.test.mjs` — Expected: FAIL (`clearProp is not a function` / import error).

- [ ] **Step 3: Implement `clearProp`** in `src/components/map3d/objects.js` (add near the other exports):

```js
// Remove only the scattered instances of one prop id (used by ObjectPanel's "Clear current prop").
export function clearProp(objects, propId) {
  return (objects ?? []).filter((o) => o.propId !== propId);
}
```

- [ ] **Step 4: Run it, verify it passes** — Run: `node src/components/map3d/objects.test.mjs` — Expected: all pass (existing + 2 new).

- [ ] **Step 5: Wire the buttons in `ObjectPanel.svelte`** (`:94-100`). Import `clearProp`, add a guarded clear-all and a clear-current-prop. Replace the count+clear row:

```svelte
  <!-- Count readout + clears -->
  <div class="flex items-center justify-between gap-2 pt-1">
    <span class="opacity-70 text-xs">{count} placed</span>
    <div class="flex gap-1">
      <button type="button" class="btn btn-xs btn-outline" disabled={count === 0}
        onclick={() => mapData.update((d) => ({ ...d, objects: clearProp(d.objects, ui.propId) }))}>
        Clear {allProps.find((p) => p.id === ui.propId)?.name ?? 'prop'}
      </button>
      <button type="button" class="btn btn-xs btn-error btn-outline" disabled={count === 0}
        onclick={() => { if (confirm('Remove ALL placed objects?')) clearObjects(); }}>
        Clear all
      </button>
    </div>
  </div>
```
Add `import { clearProp } from './objects.js';` (the file already imports `{ PROPS }` from `./objects.js` — extend that import to `{ PROPS, clearProp }`).

- [ ] **Step 6: Verify build** — Run: `npm run build` — Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/map3d/objects.js src/components/map3d/objects.test.mjs src/components/map3d/ObjectPanel.svelte
git commit -m "feat(map): clear-current-prop + guarded clear-all for objects (WS3b)"
```

---

### Task 6: Integration gate — unit + build + E2E + AGY/Codex, then release

**Files:** none new — verification + release only.

- [ ] **Step 1: Run all unit checks** —

```bash
node src/components/map3d/tokenFilter.test.mjs
node src/components/map3d/objects.test.mjs
node src/components/map3d/tokens.test.mjs
node src/lib/voxel/voxelProp.test.mjs
```
Expected: every file prints `… passed, 0 failed`.

- [ ] **Step 2: Clean build** — Run: `npm run build` — Expected: success, no warnings about unresolved imports (catches a missed `ImageTerrainPanel` reference from Task 3).

- [ ] **Step 3: E2E (Playwright)** — `npm run dev`, open the app, enter host mode, go to **3D Map**, and verify:
  - HUD (🎮) renders, names the mode, and its lines change when switching Terrain/Tokens/Objects; collapse toggle works.
  - First-visit hint shows once, "Got it" dismisses it, and it stays gone after reload (`hintSeen` persisted).
  - Mode survives leaving the tab and returning (persisted `mode`).
  - `⋯ Map` dropdown exposes Size / Regenerate Topview / Reset.
  - **🖼 Image → Map** switches to the Image Editor tab; uploading a small image and Apply yields a 3D-**editable** map (small-map path intact).
  - TokenPanel: with >6 tokens the search box filters; edit area shows the Identity/Transform/Model/Notes sections; row shows cell position.
  - ObjectPanel: "Clear <prop>" removes only that prop; "Clear all" asks to confirm.
  - Console clean (no new errors).

- [ ] **Step 4: AGY vision pass** — screenshot the polished 3D Map (with a generated map loaded) and ask AGY for a UX critique focused on the three friction areas. Fold any quick, in-scope wins; log out-of-scope items as future-round notes. (One pass — timeboxed.)

- [ ] **Step 5: Codex review** — run a Codex adversarial review over the branch diff; address real findings, note false positives.

- [ ] **Step 6: Update CHANGELOG + version** — add a `## [3.15.0]` entry summarising WS1/WS2/WS3; bump `package.json` to `3.15.0`. Commit:

```bash
git add CHANGELOG.md package.json
git commit -m "chore(release): v3.15.0 — 3D Map UX polish (HUD, image-import consolidation, token/object panels)"
```

- [ ] **Step 7: Merge + tag + push (overseer)** —

```bash
git checkout main
git merge --no-ff feat/3d-map-ux-polish -m "Merge feat/3d-map-ux-polish: 3D Map UX polish — v3.15.0"
git tag v3.15.0
git push origin main --tags
```
Expected: GitHub Actions CI/CD deploys to https://pinsorn.github.io/CharacterNoto/.

---

## Self-Review

**Spec coverage:**
- WS1 controls/modes → Task 2 (HUD, cursor, hint, declutter, persist mode) + Task 1 (state). ✓
- WS2 image→terrain → Task 3 (single entry point, resolution clarity, copyable swatches). ✓
- WS3 token/object → Task 4 (TokenPanel sections + filter) + Task 5 (ObjectPanel safety). ✓
- Backward-compat (persisted no-merge) → Global Constraints + defensive reads in Tasks 2-3. ✓
- E2E + AGY + Codex + release → Task 6. ✓
- Deferred (features, undo, scheme overhaul) → out of scope, no tasks (correct). ✓

**Placeholder scan:** no TBD/TODO; every code step shows code; commands have expected output. ✓

**Type/name consistency:** `filterTokens(tokens, query)` (Task 4) and `clearProp(objects, propId)` (Task 5) used identically where consumed; `voxelUI.mode`/`hintSeen`/`hudCollapsed` named identically in Tasks 1-2. ✓

**Sequencing:** Tasks 2 and 3 share `Map3DTab.svelte` → Task 3 explicitly runs after Task 2. Tasks 4 and 5 are disjoint → parallel-safe. ✓
