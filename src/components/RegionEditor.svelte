<script>
  // Region editor modal: name/color, item loot table (drop%/perRoll/infinite/stock),
  // roll panel (with depletion), and send-loot-to-character.
  import { mapData, characters, itemDatabase } from '../lib/stores.js';
  import { rollRegion, mergeLootIntoItems } from '../lib/loot.js';
  import { toast } from '../lib/toast.js';
  import Modal from './Modal.svelte';

  let { open = $bindable(false), regionId = null } = $props();

  const colors = ['primary', 'secondary', 'accent', 'info', 'success', 'warning', 'error'];

  // Fresh deep-ish copy each store fire so display (incl. depleting stock) stays reactive.
  const region = $derived.by(() => {
    const r = $mapData.regions.find((x) => x.id === regionId);
    return r ? { ...r, items: r.items.map((it) => ({ ...it })) } : null;
  });

  // Mutate the LIVE region in the store, then persist.
  function commit(mutate) {
    mapData.update((d) => {
      const r = d.regions.find((x) => x.id === regionId);
      if (r) mutate(r);
      return d;
    });
  }

  function addItem() {
    commit((r) => r.items.push({ name: '', dropChance: 100, perRoll: 1, infinite: false, stock: 1 }));
  }
  function removeItem(j) {
    commit((r) => r.items.splice(j, 1));
  }
  function setField(j, key, value) {
    commit((r) => {
      if (key === 'dropChance') value = Math.min(100, Math.max(0, parseInt(value, 10) || 0));
      else if (key === 'perRoll') value = Math.max(1, parseInt(value, 10) || 1);
      else if (key === 'stock') value = Math.max(0, parseInt(value, 10) || 0);
      r.items[j][key] = value;
    });
  }
  function setInfinite(j, checked) {
    commit((r) => (r.items[j].infinite = checked));
  }

  function deleteRegion() {
    if (!confirm(`Delete region "${region?.name}"?`)) return;
    mapData.update((d) => {
      d.regions = d.regions.filter((r) => r.id !== regionId);
      return d;
    });
    open = false;
  }

  // --- roll ---------------------------------------------------------------
  let randomizeQty = $state(true);
  let mode = $state('independent'); // 'independent' | 'weighted' — DM picks per roll
  let results = $state(null); // null = not rolled yet; [] = nothing dropped
  let sendTo = $state(0);

  function roll() {
    let loot = [];
    mapData.update((d) => {
      const r = d.regions.find((x) => x.id === regionId);
      if (r) loot = rollRegion(r, { randomizeQty, mode }); // mutates stock for finite items
      return d;
    });
    results = loot;
  }

  function sendToCharacter() {
    if (!results || results.length === 0) return;
    characters.update((list) => {
      const ch = list[sendTo];
      if (ch) mergeLootIntoItems(ch.items, results);
      return list;
    });
    toast(`Sent ${results.length} item type(s) to ${$characters[sendTo]?.name}!`);
  }
</script>

<Modal bind:open title={region ? `Region — ${region.name}` : 'Region'}>
  {#if region}
    <div class="flex gap-2 mb-4">
      <input
        class="input input-bordered flex-1"
        placeholder="Region name"
        value={region.name}
        onchange={(e) => commit((r) => (r.name = e.currentTarget.value))}
      />
      <select
        class="select select-bordered"
        value={region.color}
        onchange={(e) => commit((r) => (r.color = e.currentTarget.value))}
      >
        {#each colors as c}<option value={c}>{c}</option>{/each}
      </select>
    </div>

    <!-- Item loot table -->
    <h4 class="font-bold mb-2">Items</h4>
    <datalist id="region-item-suggestions">
      {#each $itemDatabase as db}<option value={db.name}></option>{/each}
    </datalist>
    <div class="space-y-2 mb-2">
      {#each region.items as it, j}
        <div class="flex flex-wrap gap-2 items-center bg-base-200 p-2 rounded">
          <input
            class="input input-sm input-bordered flex-1 min-w-32"
            list="region-item-suggestions"
            placeholder="Item name"
            value={it.name}
            onchange={(e) => setField(j, 'name', e.currentTarget.value)}
          />
          <label class="text-xs flex items-center gap-1">
            Drop%
            <input type="number" min="0" max="100" class="input input-sm input-bordered w-16"
              value={it.dropChance} onchange={(e) => setField(j, 'dropChance', e.currentTarget.value)} />
          </label>
          <label class="text-xs flex items-center gap-1">
            /roll
            <input type="number" min="1" class="input input-sm input-bordered w-16"
              value={it.perRoll} onchange={(e) => setField(j, 'perRoll', e.currentTarget.value)} />
          </label>
          <label class="text-xs flex items-center gap-1">
            <input type="checkbox" class="toggle toggle-sm toggle-primary"
              checked={it.infinite} onchange={(e) => setInfinite(j, e.currentTarget.checked)} />
            ∞
          </label>
          {#if !it.infinite}
            <label class="text-xs flex items-center gap-1">
              stock
              <input type="number" min="0" class="input input-sm input-bordered w-16"
                value={it.stock} onchange={(e) => setField(j, 'stock', e.currentTarget.value)} />
            </label>
          {/if}
          <button class="btn btn-xs btn-error" onclick={() => removeItem(j)}>×</button>
        </div>
      {/each}
    </div>
    <button class="btn btn-sm btn-outline mb-4" onclick={addItem}>Add Item</button>

    <!-- Roll panel -->
    <div class="border-t border-base-300 pt-3">
      <div class="flex items-center gap-3 mb-1 flex-wrap">
        <div class="join">
          <button class="btn btn-xs join-item {mode === 'independent' ? 'btn-primary' : 'btn-outline'}"
            onclick={() => (mode = 'independent')}>Independent</button>
          <button class="btn btn-xs join-item {mode === 'weighted' ? 'btn-primary' : 'btn-outline'}"
            onclick={() => (mode = 'weighted')}>Weighted (pick 1)</button>
        </div>
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" class="toggle toggle-sm toggle-primary" bind:checked={randomizeQty} />
          Randomize quantity
        </label>
        <button class="btn btn-sm btn-primary" onclick={roll} disabled={region.items.length === 0}>Roll</button>
      </div>
      {#if mode === 'weighted'}
        <p class="text-xs opacity-60 mb-2">Drop% is used as a relative weight; one item drops per roll.</p>
      {/if}

      {#if results !== null}
        {#if results.length === 0}
          <div class="alert alert-warning py-2 mb-2"><span>Nothing dropped.</span></div>
        {:else}
          <div class="mb-2">
            <div class="text-sm font-semibold mb-1">Loot:</div>
            <div class="flex flex-wrap gap-1 mb-2">
              {#each results as r}<span class="badge badge-success">{r.name} ×{r.amount}</span>{/each}
            </div>
            <div class="flex items-center gap-2">
              <select class="select select-sm select-bordered" bind:value={sendTo}>
                {#each $characters as ch, idx}<option value={idx}>{ch.name}</option>{/each}
              </select>
              <button class="btn btn-sm btn-success" onclick={sendToCharacter}>Send to character →</button>
            </div>
          </div>
        {/if}
      {/if}
    </div>

    <div class="modal-action">
      <button class="btn btn-error btn-outline" onclick={deleteRegion}>Delete Region</button>
      <button class="btn" onclick={() => (open = false)}>Close</button>
    </div>
  {/if}
</Modal>
