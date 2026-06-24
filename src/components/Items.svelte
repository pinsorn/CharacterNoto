<script>
  // Items (Wiki) tab — ported from legacy/item-manager.js.
  // Reuses the persisted itemDatabase store; the "use item" flow is delegated to the
  // shared UseItemModal via the useItemFor store. Effects are edited in a local
  // working-copy array (formEffects) and only written to the store on Save.
  import { itemDatabase, characters } from '../lib/stores.js';
  import { toast } from '../lib/toast.js';
  import { useItemFor } from '../lib/ui.js';
  import Modal from './Modal.svelte';
  import { viewer } from '../lib/mode.js';
  import { receivedHides } from '../lib/p2p.js';

  // DM-forced hides in the player view.
  const hideObtain = $derived(viewer && !!$receivedHides?.itemObtain);
  const hideEffects = $derived(viewer && !!$receivedHides?.itemEffects);

  let search = $state('');
  let modalOpen = $state(false);
  let editIndex = $state(null); // null = adding a new item; else the index being edited

  // Editable form state. formEffects mirrors the legacy per-row DOM widgets:
  // { type: 'stat'|'custom', target, action: 'add'|'subtract'|'set', value, paramType: 'range'|'checkbox' }
  let form = $state({ name: '', howToObtain: '', description: '' });
  let formEffects = $state([]);

  // Case-insensitive filter on name / howToObtain / description (legacy filterItems).
  const filtered = $derived.by(() => {
    const q = search.toLowerCase();
    if (!q) return $itemDatabase;
    return $itemDatabase.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.howToObtain && item.howToObtain.toLowerCase().includes(q)) ||
        (item.description && item.description.toLowerCase().includes(q))
    );
  });

  // Custom-parameter names gathered across all characters (legacy updateEffectTargets).
  const customParams = $derived.by(() => {
    const set = new Set();
    for (const ch of $characters) {
      if (ch.custom) for (const key of Object.keys(ch.custom)) set.add(key);
    }
    return Array.from(set);
  });

  // Human-readable effect summary (legacy renderItemDatabase effectsHtml).
  function effectLabel(effect) {
    const sign = effect.action === 'add' ? '+' : effect.action === 'subtract' ? '-' : '=';
    if (effect.type === 'stat') {
      return `${sign}${effect.value} ${effect.target}`;
    }
    if (effect.paramType === 'range') {
      return `${sign}${effect.value} ${effect.target}`;
    }
    return `Set ${effect.target} to ${effect.value ? 'True' : 'False'}`;
  }

  function openAdd() {
    editIndex = null;
    form = { name: '', howToObtain: '', description: '' };
    formEffects = [];
    modalOpen = true;
  }

  function openEdit(index) {
    editIndex = index;
    const item = $itemDatabase[index];
    form = {
      name: item.name,
      howToObtain: item.howToObtain ?? '',
      description: item.description ?? ''
    };
    // Clone effects into editable rows so cancelling discards changes.
    // Checkbox custom effects persist value as a boolean; the form's value <select>
    // binds string 'true'/'false', so normalize on load.
    formEffects = (item.effects ?? []).map((e) => {
      const isCheckbox = e.type === 'custom' && e.paramType === 'checkbox';
      return {
        type: e.type ?? 'stat',
        target: e.target ?? '',
        action: e.action ?? 'add',
        value: isCheckbox ? (e.value ? 'true' : 'false') : e.value ?? 0,
        paramType: e.paramType ?? 'range'
      };
    });
    modalOpen = true;
  }

  function addEffect() {
    formEffects = [
      ...formEffects,
      { type: 'stat', target: 'hunger', action: 'add', value: 0, paramType: 'range' }
    ];
  }

  function removeEffect(i) {
    formEffects = formEffects.filter((_, idx) => idx !== i);
  }

  function save() {
    const name = form.name.trim();
    const howToObtain = form.howToObtain.trim();
    const description = form.description.trim();

    if (!name) {
      toast('Item name is required!');
      return;
    }

    // Build the persisted effect shape, mirroring legacy saveItemFromForm coercion.
    const effects = formEffects
      .filter((e) => e.target && e.action !== undefined && e.value !== '')
      .map((e) => {
        const isCheckbox = e.type === 'custom' && e.paramType === 'checkbox';
        const effect = {
          type: e.type,
          target: e.target,
          action: e.action,
          value: isCheckbox ? e.value === 'true' || e.value === true : parseInt(e.value) || 0
        };
        if (e.type === 'custom') effect.paramType = e.paramType || 'range';
        return effect;
      });

    const entry = { name, howToObtain, description, effects };

    itemDatabase.update((db) => {
      // Case-SENSITIVE find by name (legacy addItemToDatabase): replace or push.
      const existing = db.findIndex((item) => item.name === name);
      if (existing >= 0) db[existing] = entry;
      else db.push(entry);
      return db;
    });

    modalOpen = false;
  }

  function removeItem(index) {
    const item = $itemDatabase[index];
    if (!confirm(`Are you sure you want to remove "${item.name}" from the item database?`)) return;
    itemDatabase.update((db) => {
      db.splice(index, 1);
      return db;
    });
  }

  function useItem(item) {
    useItemFor.set({ item });
  }
</script>

<div>
  <div class="flex justify-between items-center mb-6">
    <h2 class="text-2xl font-bold">Item Encyclopedia</h2>
    <button class="btn btn-primary" onclick={openAdd}>Add New Item</button>
  </div>

  <!-- Search Bar -->
  <div class="mb-4">
    <input
      type="text"
      class="input input-bordered w-full"
      placeholder="Search items by name, description, or how to obtain..."
      bind:value={search}
    />
  </div>

  <div>
    {#if filtered.length === 0}
      <div class="text-center text-gray-500 py-8">
        {#if search}
          No items found matching "{search}"
        {:else}
          No items in database. Add items or they will be auto-populated from character inventories.
        {/if}
      </div>
    {:else}
      {#each filtered as item}
        <div class="card bg-base-200 shadow-sm mb-4">
          <div class="card-body p-4">
            <div class="flex justify-between items-start">
              <h3 class="card-title text-lg">{item.name}</h3>
              <div class="flex gap-2">
                <button
                  class="btn btn-xs btn-primary"
                  onclick={() => openEdit($itemDatabase.indexOf(item))}>Edit</button
                >
                <button
                  class="btn btn-xs btn-error"
                  onclick={() => removeItem($itemDatabase.indexOf(item))}>Delete</button
                >
              </div>
            </div>

            <div class="grid gap-3 mt-3">
              {#if !hideObtain}
                <div>
                  <span class="font-semibold text-sm">How to Obtain:</span>
                  <p class="text-sm mt-1">
                    {#if item.howToObtain}{item.howToObtain}{:else}<em class="text-gray-500"
                        >Not specified</em
                      >{/if}
                  </p>
                </div>
              {/if}

              <div>
                <span class="font-semibold text-sm">Description:</span>
                <p class="text-sm mt-1">
                  {#if item.description}{item.description}{:else}<em class="text-gray-500"
                      >No description</em
                    >{/if}
                </p>
              </div>

              {#if !hideEffects}
                <div>
                  <span class="font-semibold text-sm">Effects when used:</span>
                  <div class="mt-1 flex flex-wrap gap-1">
                    {#if item.effects && item.effects.length}
                      {#each item.effects as effect}
                        <span class="badge badge-outline badge-sm">{effectLabel(effect)}</span>
                      {/each}
                    {:else}
                      <em class="text-gray-500 text-sm">No effects</em>
                    {/if}
                  </div>
                </div>
              {/if}
            </div>

            <div class="mt-3">
              <button class="btn btn-sm btn-success" onclick={() => useItem(item)}>Use Item</button>
            </div>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>

<Modal bind:open={modalOpen} title={editIndex === null ? 'Add Item' : 'Edit Item'}>
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
    <div class="form-control">
      <label class="label" for="item-name">Item Name</label>
      <input
        id="item-name"
        type="text"
        class="input input-bordered"
        placeholder="Item name"
        bind:value={form.name}
      />
    </div>
    <div class="form-control">
      <label class="label" for="item-obtain">How to Obtain</label>
      <input
        id="item-obtain"
        type="text"
        class="input input-bordered"
        placeholder="How to get this item"
        bind:value={form.howToObtain}
      />
    </div>
  </div>

  <div class="form-control mb-4">
    <label class="label" for="item-description">Description</label>
    <textarea
      id="item-description"
      class="textarea textarea-bordered"
      placeholder="Item description"
      rows="3"
      bind:value={form.description}
    ></textarea>
  </div>

  <div class="mb-4">
    <div class="flex justify-between items-center mb-2">
      <span class="label">Effects when used</span>
      <button type="button" class="btn btn-sm btn-accent" onclick={addEffect}>Add Effect</button>
    </div>

    <div>
      {#each formEffects as effect, i}
        <div class="effect-item border border-base-300 rounded p-3 mb-2">
          <div class="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
            <div>
              <label class="label label-text text-xs" for={`effect-type-${i}`}>Type</label>
              <select
                id={`effect-type-${i}`}
                class="select select-bordered select-sm w-full"
                bind:value={effect.type}
              >
                <option value="stat">Basic Stat</option>
                <option value="custom">Custom Parameter</option>
              </select>
            </div>
            <div>
              <label class="label label-text text-xs" for={`effect-target-${i}`}>Target</label>
              {#if effect.type === 'stat'}
                <select
                  id={`effect-target-${i}`}
                  class="select select-bordered select-sm w-full"
                  bind:value={effect.target}
                >
                  <option value="hunger">Hunger</option>
                  <option value="thirsty">Thirsty</option>
                </select>
              {:else}
                <select
                  id={`effect-target-${i}`}
                  class="select select-bordered select-sm w-full"
                  bind:value={effect.target}
                >
                  {#each customParams as param}
                    <option value={param}>{param}</option>
                  {/each}
                </select>
              {/if}
            </div>
            <div>
              <label class="label label-text text-xs" for={`effect-action-${i}`}>Action</label>
              <select
                id={`effect-action-${i}`}
                class="select select-bordered select-sm w-full"
                bind:value={effect.action}
              >
                <option value="add">Add (+)</option>
                <option value="subtract">Subtract (-)</option>
                <option value="set">Set (=)</option>
              </select>
            </div>
            <div>
              <label class="label label-text text-xs" for={`effect-value-${i}`}>Value</label>
              {#if effect.type === 'custom' && effect.paramType === 'checkbox'}
                <select
                  id={`effect-value-${i}`}
                  class="select select-bordered select-sm w-full"
                  bind:value={effect.value}
                >
                  <option value="true">True</option>
                  <option value="false">False</option>
                </select>
              {:else}
                <input
                  id={`effect-value-${i}`}
                  type="number"
                  class="input input-bordered input-sm w-full"
                  bind:value={effect.value}
                />
              {/if}
            </div>
            <div>
              <button type="button" class="btn btn-error btn-sm" onclick={() => removeEffect(i)}
                >Remove</button
              >
            </div>
          </div>
          {#if effect.type === 'custom'}
            <div class="effect-param-type-container mt-2">
              <label class="label label-text text-xs" for={`effect-paramtype-${i}`}
                >Parameter Type</label
              >
              <select
                id={`effect-paramtype-${i}`}
                class="select select-bordered select-sm"
                bind:value={effect.paramType}
              >
                <option value="range">Range</option>
                <option value="checkbox">Checkbox</option>
              </select>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <div class="modal-action">
    <button class="btn" onclick={save}>Save Item</button>
    <button class="btn btn-ghost" onclick={() => (modalOpen = false)}>Cancel</button>
  </div>
</Modal>
