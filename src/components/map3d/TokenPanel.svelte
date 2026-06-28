<script>
  // Token panel for the 3D Map: add / edit / delete tokens (creature & generic markers) that the
  // overseer renders on the voxel grid (see tokens.js). All mutations go through mapData.update
  // with an immutable spread so Svelte, the localStorage persistence, and the P2P rebroadcast all
  // fire — and regions/backgroundId are preserved on every write.
  import { mapData, characters } from '../../lib/stores.js';

  let { selectedId = $bindable(null), onPossess } = $props();

  const DEFAULT_COLOR = '#7c3aed';
  const R2D = 180 / Math.PI; // radians → degrees for the rotation inputs
  const deg = (rad) => Math.round((rad || 0) * R2D);
  const rad = (d) => (Number(d) || 0) / R2D;
  // App palette (matches MapTab's daisy colours) for quick colour picks.
  const SWATCHES = ['#7c3aed', '#db2777', '#06b6d4', '#3abff8', '#36d399', '#fbbd23', '#f87272', '#64748b'];
  const SIZE_KEYS = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'];

  // Existing users may have mapData saved before `tokens` existed → guard the read.
  const tokens = $derived($mapData.tokens ?? []);
  const selected = $derived(tokens.find((t) => t.id === selectedId) ?? null);

  let addCharId = $state('');

  // Immutable update that always keeps regions/backgroundId intact.
  function setTokens(next) {
    mapData.update((d) => ({ ...d, tokens: next }));
  }

  // Distinct default colour per new token (characters carry no colour field) — cycle the palette.
  const nextColor = () => SWATCHES[tokens.length % SWATCHES.length];

  function addGeneric() {
    const tok = {
      id: crypto.randomUUID(), kind: 'marker', label: 'Marker',
      color: nextColor(), size: 'medium', cell: { gx: 16, gz: 16 }, facing: 0,
    };
    setTokens([...tokens, tok]);
    selectedId = tok.id;
  }

  function addCreature() {
    const char = $characters.find((c) => c.id === addCharId);
    if (!char) return;
    const tok = {
      id: crypto.randomUUID(), kind: 'creature', charId: char.id,
      label: char.name, color: char.color || nextColor(),
      size: 'medium', cell: { gx: 16, gz: 16 }, facing: 0,
    };
    setTokens([...tokens, tok]);
    selectedId = tok.id;
  }

  function patch(id, fields) {
    setTokens(tokens.map((t) => (t.id === id ? { ...t, ...fields } : t)));
  }

  function rotate(id, delta) {
    const t = tokens.find((x) => x.id === id);
    if (t) patch(id, { facing: (t.facing || 0) + delta });
  }

  function del(id) {
    setTokens(tokens.filter((t) => t.id !== id));
    if (selectedId === id) selectedId = null; // collapse the edit area
  }
</script>

<div class="space-y-2">
  <!-- Add row -->
  <div class="flex flex-wrap items-center gap-2 bg-base-200 rounded p-2">
    <button class="btn btn-xs btn-primary" onclick={addGeneric}>+ Generic</button>
    <div class="join">
      <select class="select select-xs select-bordered join-item" bind:value={addCharId}>
        <option value="" disabled>Character…</option>
        {#each $characters as c (c.id)}
          <option value={c.id}>{c.name}</option>
        {/each}
      </select>
      <button class="btn btn-xs join-item" disabled={!addCharId} onclick={addCreature}>+ Add</button>
    </div>
  </div>

  <!-- Token list -->
  {#if tokens.length === 0}
    <div class="text-xs opacity-60 px-1">No tokens yet. Add a generic marker or a character.</div>
  {:else}
    <div class="grid gap-1">
      {#each tokens as t (t.id)}
        <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
        <div
          class="flex items-center gap-2 rounded p-1 cursor-pointer {selectedId === t.id ? 'bg-primary/20 ring-1 ring-primary' : 'bg-base-200'}"
          onclick={() => (selectedId = t.id)}
        >
          <span class="inline-block w-3 h-3 rounded-full shrink-0" style={`background:${t.color}`}></span>
          <span class="text-sm truncate mr-auto">{t.label}</span>
          <span class="badge badge-ghost badge-xs">{t.size}</span>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Edit area -->
  {#if selected}
    <div class="bg-base-200 rounded p-2 space-y-2">
      <input
        class="input input-xs input-bordered w-full"
        placeholder="Label"
        value={selected.label}
        oninput={(e) => patch(selected.id, { label: e.target.value })}
      />

      <div class="flex items-center gap-1 flex-wrap">
        {#each SWATCHES as sw}
          <button
            class="w-4 h-4 rounded-full {selected.color === sw ? 'ring-2 ring-offset-1 ring-base-content' : ''}"
            style={`background:${sw}`}
            title={sw}
            aria-label={sw}
            onclick={() => patch(selected.id, { color: sw })}
          ></button>
        {/each}
        <input
          type="color"
          class="w-6 h-6 ml-1 rounded cursor-pointer"
          value={selected.color}
          oninput={(e) => patch(selected.id, { color: e.target.value })}
        />
      </div>

      <div class="flex items-center gap-2 flex-wrap">
        <select
          class="select select-xs select-bordered"
          value={selected.size}
          onchange={(e) => patch(selected.id, { size: e.target.value })}
        >
          {#each SIZE_KEYS as s}<option value={s}>{s}</option>{/each}
        </select>

        <button class="btn btn-xs btn-ghost" title="Rotate facing left" onclick={() => rotate(selected.id, -Math.PI / 4)}>⟲</button>
        <button class="btn btn-xs btn-ghost" title="Rotate facing right" onclick={() => rotate(selected.id, Math.PI / 4)}>⟳</button>
      </div>

      <div class="flex items-center gap-2 flex-wrap text-xs">
        <span class="opacity-60">Rotation°</span>
        <label class="flex items-center gap-1">X
          <input type="number" step="15" class="input input-xs input-bordered w-16" value={deg(selected.pitch)}
            oninput={(e) => patch(selected.id, { pitch: rad(e.target.value) })} />
        </label>
        <label class="flex items-center gap-1">Y
          <input type="number" step="15" class="input input-xs input-bordered w-16" value={deg(selected.facing)}
            oninput={(e) => patch(selected.id, { facing: rad(e.target.value) })} />
        </label>
        <label class="flex items-center gap-1">Z
          <input type="number" step="15" class="input input-xs input-bordered w-16" value={deg(selected.roll)}
            oninput={(e) => patch(selected.id, { roll: rad(e.target.value) })} />
        </label>
      </div>

      <label class="flex items-center gap-1 text-xs">Height
        <input
          type="number"
          class="input input-xs input-bordered w-20"
          placeholder="surface"
          value={selected.heightOverride ?? ''}
          oninput={(e) => patch(selected.id, { heightOverride: e.target.value === '' ? undefined : +e.target.value })}
        />
        <span class="opacity-60">(blank = sit on surface)</span>
      </label>

      <input
        class="input input-xs input-bordered w-full"
        placeholder="Note"
        value={selected.note ?? ''}
        oninput={(e) => patch(selected.id, { note: e.target.value })}
      />

      <div class="flex items-center gap-2">
        {#if onPossess}
          <button class="btn btn-xs btn-secondary" onclick={() => onPossess(selected.id)}>Possess</button>
        {/if}
        <button class="btn btn-xs btn-error ml-auto" onclick={() => del(selected.id)}>Delete</button>
      </div>
    </div>
  {/if}
</div>
