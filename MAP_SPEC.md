# Map & Region Loot — Feature Spec (Draft v2)

Status: **draft for review** (v2 reflects confirmed decisions). Targets the migrated Svelte 5 codebase.
Goal: a **Map** tab with an uploadable background image, where you draw freeform **Regions**, stock each region with **Items** (quantity + **% drop chance**, depleting unless flagged infinite), then **roll** a region to generate loot — items + rolled quantities, with a toggle to randomize quantity.

---

## 1. Confirmed decisions

| # | Decision | Choice | Notes |
|---|----------|--------|-------|
| D1 | Region model | **Depleting stock, per-item opt-out** | Rolling removes the rolled amount from a finite item's stock. Items flagged `infinite` never deplete (loot-table behavior). |
| D2 | Region shape | **Freeform polygon** | Click to add vertices, close to finish. Stored as normalized points. |
| D3 | Background | **Uploadable map image** behind regions | Stored in IndexedDB (see §5), referenced by id. |
| D4 | Coords | **Normalized 0..1** of the map area | Survives container/image resize. |
| D5 | Drop evaluation | **Independent per-item roll** | Each item rolls its own `% drop`; a roll yields 0..N items. |
| D6 | Rolled quantity | `perRoll` ceiling; toggle **Randomize quantity** | ON → randInt(1, perRoll); OFF → perRoll (clamped to remaining stock for finite). |
| D7 | Item identity | **name string**, autocompleted from `itemDatabase` | Rolled loot can be sent to a character (auto-adds wiki stub via existing path). |
| D8 | Live persistence | **Split**: JSON→localStorage, images→IndexedDB | See §5. No polling; event-driven. |
| D9 | Backup/export | **On-demand .zip** (JSZip): manifest + images | Built only on Export click. Encryption deferred (Q-E). |

---

## 2. Data model

New persisted store — `src/lib/stores.js`:
```js
export const mapData = persisted('mapData', { backgroundId: null, regions: [] });
```

```
mapData = {
  backgroundId: string | null,      // IndexedDB key of the map image Blob (null = plain canvas)
  regions: [
    {
      id: string,                   // crypto.randomUUID()
      name: string,
      color: string,                // daisyUI color token for the overlay
      points: [ { x: number, y: number }, ... ],   // polygon vertices, normalized 0..1 (>=3 pts)
      items: [
        {
          name: string,             // references itemDatabase by name (input + datalist)
          dropChance: number,       // 0..100  (% chance to drop on a roll)
          perRoll: number,          // >=1; max units per successful roll
          infinite: boolean,        // true = never depletes (loot-table); false = depleting stock
          stock: number             // remaining units; used only when infinite=false
        }
      ]
    }
  ]
}
```
- `backgroundId` and (optionally) avatars are **not** stored inline — they live in IndexedDB as Blobs (§5). The JSON stays small → localStorage-safe.
- Additive to existing stores; nothing else changes.

---

## 3. Roll algorithm (core)

`src/lib/loot.js` — pure, rng-injectable; mutates finite items' `stock` in place (caller persists):
```js
// Roll a region's loot. Returns [{ name, amount }] (possibly empty).
// Mutates region.items[].stock for finite items that drop. rng injectable for tests.
export function rollRegion(region, { randomizeQty = true } = {}, rng = Math.random) {
  const loot = [];
  for (const it of region.items) {
    if (rng() * 100 >= it.dropChance) continue;            // failed the drop roll
    const cap = Math.max(1, Math.floor(it.perRoll) || 1);
    let amount = randomizeQty ? 1 + Math.floor(rng() * cap) : cap;   // randInt(1,cap) | fixed
    if (!it.infinite) {
      if (it.stock <= 0) continue;                         // depleted → can't drop
      amount = Math.min(amount, it.stock);                 // can't take more than in stock
      it.stock -= amount;                                  // deplete
    }
    loot.push({ name: it.name, amount });
  }
  return loot;
}
```
Caller: `mapData.update(d => d)` after rolling so depletion persists.

Semantics:
- `dropChance` 100 → always; 0 → never. Each item independent → 0..N items per roll.
- Finite item with `stock = 0` is effectively removed from the table until restocked.
- `randomizeQty: false` → full `perRoll` (clamped to stock for finite).
- Empty result valid → UI shows "Nothing dropped."

---

## 4. UI / UX

New **Map** tab (4th tab in `App.svelte`).

### 4.1 Map canvas
- A bordered, fixed-aspect box. If `backgroundId` set, the image (loaded from IndexedDB → object URL) fills it; else a plain base-200 canvas.
- An SVG overlay (viewBox 0..1) renders each region as a semi-transparent polygon (`color`), with the `name` at the centroid.
- Toolbar: **Upload Map Image**, **Draw Region** toggle, **Clear background**.

### 4.2 Draw a region (polygon)
- With **Draw Region** on: each click adds a vertex (live preview line to cursor). **Double-click / Enter** closes the polygon (needs ≥3 pts) → prompt name → push to `regions`. **Esc** cancels.
- Coordinates captured relative to the canvas, normalized to 0..1.
- Click an existing region (point-in-polygon hit-test) → open its editor. (v2.1: drag vertices to reshape.)

### 4.3 Region editor (Modal, reuse `Modal.svelte`)
- Edit `name`, `color`; **Delete region**.
- **Items table** — rows: `name` (input + datalist from `$itemDatabase`), `dropChance` (0–100), `perRoll` (≥1), `infinite` (toggle), `stock` (number, shown only when not infinite). Add / Remove row.
- **Restock**: quick action to reset/append stock on finite items.
- **Roll panel**:
  - Toggle **Randomize quantity** (default ON).
  - **Roll** button → `rollRegion`; show result `item × amount` (or "Nothing dropped"); persist depletion.
  - **Send to character →** select (`$characters`) → merge loot into that character's inventory (reuse existing case-sensitive merge).
  - Finite stock counts update live in the table after each roll.

### 4.4 Region list
A compact list beside the canvas (name + item count + stock summary + quick Roll) for mobile / no-precise-click use.

---

## 5. Storage architecture (images) — the key design

**Problem:** base64 images in localStorage bloat fast; localStorage quota ~5 MB; exceeding it makes `setItem` throw — and the current `persisted()` swallows that error → **silent data loss**. A real map background can be megabytes.

**There is NO polling** — persistence is event-driven (Svelte store `subscribe`). So nothing runs on an interval; the concern is quota, not poll cost.

**Live persistence — split by data type:**
- **Metadata** (characters, badges, items, recipes, region geometry + item tables) → **localStorage JSON**, as today. Small, fast, synchronous.
- **Binary images** (map background; optionally avatars) → **IndexedDB** as `Blob`, keyed by id. Native, ~hundreds of MB, no base64 inflation, async. Written only when an image actually changes. Components load them as object URLs (`URL.createObjectURL`) on mount and revoke on destroy.
  - Minimal helper `src/lib/blobstore.js`: `putBlob(id, blob)`, `getBlob(id)`, `delBlob(id)` over a single object store. ~30 lines, no dependency.
  - Avatars are small (100×100 JPEG, a few KB) — migrating them is optional; the map background is the one that forces IndexedDB.

**Backup / portability — on-demand .zip:**
- An **Export** button builds a `.zip` (JSZip): `manifest.json` (all stores) + `images/<id>.<ext>` for every Blob. Download once. **Built only on click** → never in the save path → no perf cost, no "poll" problem.
- **Import**: read the `.zip` → restore JSON stores + write images back to IndexedDB.
- Keep the existing plain-JSON export too (no images) for quick text backups; the zip is the full-fidelity one.

**Encryption (Q-E, deferred):** for a single-user local app it's YAGNI. If wanted later: AES-GCM via WebCrypto over the zip bytes, password-derived key (PBKDF2). Tradeoff: lose the password → unrecoverable. Recommend shipping v1 unencrypted, add as an opt-in flag if needed.

---

## 6. Edge cases & validation
- `dropChance` clamp 0..100; `perRoll` floor ≥1; `stock` floor ≥0.
- Region needs ≥3 points to save; degenerate/zero-area ignored.
- Finite item at `stock 0` → never drops until restocked (UI greys it).
- Empty region → roll []; all-low-% → frequent empties (intended).
- Deleting a wiki item doesn't break a region (name stored; loot re-adds the stub on send-to-character).
- IndexedDB unavailable (private mode / blocked) → fall back to inlining the background as base64 in JSON with a quota warning, or disable background upload. Surface the failure (don't swallow).
- Normalized coords → regions track the image on resize.
- Orphan Blobs (region/background deleted) → clean up its IndexedDB key on delete; a "compact" pass can sweep unreferenced ids on export.

---

## 7. Implementation sketch (fits current arch, ponytail)
```
src/lib/stores.js     + mapData persisted store
src/lib/blobstore.js  IndexedDB Blob helper (put/get/del) — ~30 lines, no dep
src/lib/loot.js       rollRegion() (pure, rng-injectable) + src/lib/loot.test.mjs (assert-based)
src/lib/backup.js     buildZip()/readZip() using JSZip (export/import only)
src/components/MapTab.svelte        canvas + bg image + SVG polygons + draw mode + region list
src/components/RegionEditor.svelte  Modal: items CRUD (+infinite/stock) + roll panel + send-to-character
src/App.svelte        add 4th tab "Map"
```
New dependency: **JSZip** (export/import only). IndexedDB + WebCrypto are native (no dep).

Self-check (`loot.test.mjs`, scripted rng): dropChance 100 always / 0 never; randomizeQty bounds [1..perRoll]; randomizeQty=false → perRoll; **finite depletion**: stock 3, perRoll 10 → drop min(10,3)=3, stock→0, next roll skipped; infinite never depletes; empty region → [].

### Phasing
- **v1**: polygon regions on a plain canvas, item table (drop%/perRoll/infinite/stock), depleting roll, send-to-character, IndexedDB background image, zip export/import.
- **v2**: drag/reshape vertices, restock workflows, weighted single-pick mode, encrypted backup, avatar→IndexedDB migration.

---

## 8. Decisions (resolved) — shipped in v3.0.0
- **Q-S → two-field** (`perRoll` max per roll + `stock` depleting pool, with `infinite` opt-out). ✅ built.
- **Q-A → migrate avatars to IndexedDB** (uniform image pipeline; auto-migrates from base64 on load). ✅ built.
- **Q-W → independent per-item drop only** for v1; weighted single-pick deferred to v2.
- **Q-E → unencrypted zip** for v1; password-protected backup deferred to v2.
