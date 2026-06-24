<script>
  // One character card — ported from legacy renderCharacters() per-card markup plus all
  // its handlers (stats, custom params, inventory, avatar, badges, craft).
  //
  // Mutation/persistence: every change mutates the character in place inside a
  // characters.update(list => list) so the persisted store subscriber fires (matches the
  // legacy saveToLocalStorage() side effect). The card receives its index `i` and reads
  // the live character from $characters[i] via a $derived so external changes reflect.
  import { characters, badges, itemDatabase } from '../lib/stores.js';
  import { badgeMatches } from '../lib/badges.js';
  import { fileToAvatarBlob } from '../lib/avatar.js';
  import { putBlob, delBlob, newImageId } from '../lib/blobstore.js';
  import { craftingFor, useItemFor } from '../lib/ui.js';
  import Modal from './Modal.svelte';
  import BlobImage from './BlobImage.svelte';

  let {
    i,
    hideParams = false,
    hideItems = false,
    hideBadges = false,
    onEdit,        // () => parent opens the rename modal for this card
    onDelete       // () => parent opens the delete-confirm modal for this card
  } = $props();

  // Live view of this character. A fresh shallow copy each store fire so the $derived's
  // reference changes — otherwise in-place mutations (commit/craft/use-item) keep the same
  // object ref and Svelte skips propagation, leaving the card stale. Nested items/custom
  // stay the same array refs (fine: we read their contents, don't key by them).
  const char = $derived.by(() => ({ ...($characters[i] ?? {}) }));

  const colors = [
    'primary', 'secondary', 'accent',
    'info', 'success', 'warning', 'error'
  ];

  // Earned badges (legacy: badges.filter(badgeMatches)).
  const earned = $derived($badges.filter((b) => badgeMatches(b, char)));

  // custom is a plain object; entries() gives [key, def] rows in insertion order.
  const customEntries = $derived(Object.entries(char.custom || {}));

  let avatarInput; // hidden <input type=file>

  // --- persistence helper -------------------------------------------------
  // Mutate this character in place, then fire the store subscriber.
  function commit(mutate) {
    characters.update((list) => {
      mutate(list[i]);
      return list;
    });
  }

  // --- stats (hunger / thirsty) ------------------------------------------
  function setStat(stat, v) {
    commit((c) => {
      c[stat] = Math.min(100, Math.max(0, parseInt(v, 10) || 0));
    });
  }
  function adjustStat(stat, delta) {
    commit((c) => {
      c[stat] = Math.min(100, Math.max(0, (c[stat] ?? 0) + delta));
    });
  }

  // --- custom params ------------------------------------------------------
  function setCustomRange(key, v) {
    commit((c) => {
      const def = c.custom[key];
      const n = parseInt(v, 10);
      def.value = Math.min(def.max, Math.max(def.min, isNaN(n) ? def.min : n));
    });
  }
  function adjustCustomRange(key, delta) {
    commit((c) => {
      const def = c.custom[key];
      def.value = Math.min(def.max, Math.max(def.min, def.value + delta));
    });
  }
  function toggleCustom(key, checked) {
    commit((c) => {
      c.custom[key].value = checked;
    });
  }
  function removeCustom(key) {
    commit((c) => {
      delete c.custom[key];
    });
  }

  // --- custom param modal (add / edit) -----------------------------------
  let customModalOpen = $state(false);
  let customEditKey = $state(null); // null = adding; else the key being edited
  let customForm = $state({ name: '', type: 'range', min: 0, max: 100, color: 'primary' });

  function openAddCustom() {
    customEditKey = null;
    customForm = { name: '', type: 'range', min: 0, max: 100, color: 'primary' };
    customModalOpen = true;
  }
  function openEditCustom(key) {
    customEditKey = key;
    const def = char.custom[key];
    customForm = {
      name: key,
      type: def.type,
      min: def.min,
      max: def.max,
      color: def.color
    };
    customModalOpen = true;
  }
  function saveCustom() {
    const name = customForm.name.trim();
    if (!name) return;
    const type = customForm.type;
    const min = type === 'range' ? (parseInt(customForm.min, 10) || 0) : 0;
    const max = type === 'range' ? (parseInt(customForm.max, 10) || min) : 100;
    const color = customForm.color;

    if (customEditKey === null) {
      // Add: legacy guards against duplicate keys.
      if (char.custom && Object.hasOwn(char.custom, name)) {
        alert('Parameter already exists.');
        return;
      }
      commit((c) => {
        if (!c.custom) c.custom = {};
        c.custom[name] = { type, min, max, color, value: type === 'checkbox' ? false : min };
      });
    } else {
      // Edit: preserve existing value (clamp for range / coerce bool), allow rename.
      commit((c) => {
        const oldKey = customEditKey;
        const def = c.custom[oldKey];
        let value = def.value;
        if (type === 'range') value = Math.min(Math.max(value, min), max);
        else value = !!value;
        if (name !== oldKey) delete c.custom[oldKey];
        c.custom[name] = { type, min, max, color, value };
      });
    }
    customModalOpen = false;
  }

  // --- inventory ----------------------------------------------------------
  function setItemName(j, v) {
    commit((c) => {
      c.items[j].name = v;
    });
  }
  function setItemAmount(j, v) {
    commit((c) => {
      c.items[j].amount = parseInt(v, 10) || 0;
    });
  }
  function removeItem(j) {
    commit((c) => {
      c.items.splice(j, 1);
    });
  }

  // Add item modal
  let addItemModalOpen = $state(false);
  let newItem = $state({ name: '', amount: 1 });
  function openAddItem() {
    newItem = { name: '', amount: 1 };
    addItemModalOpen = true;
  }
  function submitNewItem() {
    const name = newItem.name.trim();
    const amount = parseInt(newItem.amount, 10);
    if (name && !isNaN(amount)) {
      commit((c) => {
        c.items.push({ name, amount });
      });
    }
    addItemModalOpen = false;
  }

  // Move item modal (partial qty, CASE-SENSITIVE merge into destination)
  let moveModalOpen = $state(false);
  let moveItemIndex = $state(null);
  let moveDest = $state(0);
  let moveQty = $state(1);
  function openMove(j) {
    moveItemIndex = j;
    moveDest = i; // default selection
    moveQty = char.items[j].amount; // default to full amount
    moveModalOpen = true;
  }
  function confirmMove() {
    const dest = parseInt(moveDest, 10);
    const qty = parseInt(moveQty, 10) || 1;
    const j = moveItemIndex;
    if (dest === i || j === null) {
      moveModalOpen = false;
      return;
    }
    characters.update((list) => {
      const src = list[i];
      const item = src.items[j];
      const moveQ = Math.min(qty, item.amount);
      // subtract / remove from source
      if (moveQ >= item.amount) src.items.splice(j, 1);
      else item.amount -= moveQ;
      // CASE-SENSITIVE merge into destination
      const destItems = list[dest].items;
      const existing = destItems.find((it) => it.name === item.name);
      if (existing) existing.amount += moveQ;
      else destItems.push({ name: item.name, amount: moveQ });
      return list;
    });
    moveModalOpen = false;
  }

  // Use item: case-INsensitive wiki lookup; create stub + persist if missing; then open
  // the shared UseItemModal via the store.
  function useItem(name) {
    let wikiItem = $itemDatabase.find(
      (db) => db.name.toLowerCase() === name.toLowerCase()
    );
    if (!wikiItem) {
      wikiItem = {
        name,
        howToObtain: 'Found in character inventory',
        description: 'Auto-added from character inventory',
        effects: []
      };
      itemDatabase.update((db) => {
        db.push(wikiItem);
        return db;
      });
    }
    useItemFor.set({ item: wikiItem, characterIndex: i });
  }

  // --- avatar -------------------------------------------------------------
  async function onAvatarSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const blob = await fileToAvatarBlob(file);
    e.target.value = null;
    if (blob) {
      const oldId = $characters[i]?.avatarId;
      const id = newImageId();
      await putBlob(id, blob);
      if (oldId) delBlob(oldId);
      commit((c) => {
        c.avatarId = id;
        delete c.avatar; // drop any legacy base64
      });
    }
  }
  function removeAvatar() {
    const oldId = $characters[i]?.avatarId;
    if (oldId) delBlob(oldId);
    commit((c) => {
      delete c.avatarId;
      delete c.avatar;
    });
  }
</script>

<div id={`char-${i}`} class="card bg-base-200 shadow-xl">
  <div class="card-body">
    <!-- Header: name + reorder / craft / edit / delete -->
    <div class="flex justify-between items-center">
      <h2 class="card-title">{char.name}</h2>
      <div class="flex items-center space-x-2">
        <button
          class="btn btn-xs btn-outline"
          onclick={() => characters.update((l) => { if (i > 0) { [l[i - 1], l[i]] = [l[i], l[i - 1]]; } return l; })}
          disabled={i === 0}
        >↑</button>
        <button
          class="btn btn-xs btn-outline"
          onclick={() => characters.update((l) => { if (i < l.length - 1) { [l[i + 1], l[i]] = [l[i], l[i + 1]]; } return l; })}
          disabled={i === $characters.length - 1}
        >↓</button>
        <button class="btn btn-xs btn-outline btn-info" onclick={() => craftingFor.set(i)}>Craft</button>
        <button class="btn btn-xs btn-outline btn-primary" onclick={() => onEdit?.(i)}>Edit</button>
        <button class="btn btn-xs btn-outline btn-error" onclick={() => onDelete?.(i)}>Delete</button>
      </div>
    </div>

    <!-- Avatar + badges -->
    <div class="mb-4 flex items-start gap-4">
      <div class="flex flex-col items-center">
        <div class="w-[140.84px] h-[140.84px] rounded-full overflow-hidden bg-base-300 flex items-center justify-center">
          <BlobImage id={char.avatarId} alt={char.name} class="object-cover w-full h-full">
            {#snippet fallback()}
              <span class="text-sm opacity-50">No Image</span>
            {/snippet}
          </BlobImage>
        </div>
        <input
          type="file"
          accept="image/*"
          class="hidden"
          bind:this={avatarInput}
          onchange={onAvatarSelected}
        />
        <div class="mt-2 flex space-x-2">
          <button class="btn btn-xs btn-outline" onclick={() => avatarInput.click()}>Change</button>
          <button class="btn btn-xs btn-error" onclick={removeAvatar} disabled={!char.avatarId}>Remove</button>
        </div>
      </div>

      {#if !hideBadges}
        <div class="flex flex-wrap gap-2 badge-container p-2">
          {#each earned as b}
            <span class="badge badge-{b.color} tooltip" data-tip={b.desc}>{b.icon} {b.name}</span>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Stats: render only if the property exists (non-characters have neither) -->
    {#if !hideParams}
      {#if Object.hasOwn(char, 'hunger')}
        <p class="flex items-center gap-2">
          Hunger:
          <button class="btn btn-xs btn-outline" onclick={() => adjustStat('hunger', -1)}>-</button>
          <input
            type="range"
            min="0"
            max="100"
            value={char.hunger}
            onchange={(e) => setStat('hunger', e.currentTarget.value)}
            class="range range-warning w-full"
          />
          {char.hunger}
          <button class="btn btn-xs btn-outline" onclick={() => adjustStat('hunger', 1)}>+</button>
        </p>
      {/if}

      {#if Object.hasOwn(char, 'thirsty')}
        <p class="flex items-center gap-2">
          Thirsty:
          <button class="btn btn-xs btn-outline" onclick={() => adjustStat('thirsty', -1)}>-</button>
          <input
            type="range"
            min="0"
            max="100"
            value={char.thirsty}
            onchange={(e) => setStat('thirsty', e.currentTarget.value)}
            class="range range-info w-full"
          />
          {char.thirsty}
          <button class="btn btn-xs btn-outline" onclick={() => adjustStat('thirsty', 1)}>+</button>
        </p>
      {/if}

      <!-- Custom parameters -->
      {#each customEntries as [key, def]}
        {#if def.type === 'range'}
          <div class="flex items-center gap-2">
            <button class="btn btn-xs btn-error" onclick={() => removeCustom(key)}>X</button>
            <button class="btn btn-xs btn-outline btn-primary" onclick={() => openEditCustom(key)}>Edit</button>
            <span>{key}:</span>
            <button class="btn btn-xs btn-outline" onclick={() => adjustCustomRange(key, -1)}>-</button>
            <input
              type="range"
              min={def.min}
              max={def.max}
              value={def.value}
              onchange={(e) => setCustomRange(key, e.currentTarget.value)}
              class="range range-{def.color} w-full"
            />
            {def.value}
            <button class="btn btn-xs btn-outline" onclick={() => adjustCustomRange(key, 1)}>+</button>
          </div>
        {:else}
          <div class="flex items-center gap-2">
            <button class="btn btn-xs btn-error" onclick={() => removeCustom(key)}>X</button>
            <button class="btn btn-xs btn-outline btn-primary" onclick={() => openEditCustom(key)}>Edit</button>
            <label class="flex items-center gap-2">
              <input
                type="checkbox"
                class="toggle toggle-{def.color}"
                checked={def.value}
                onchange={(e) => toggleCustom(key, e.currentTarget.checked)}
              />
              {key}
            </label>
          </div>
        {/if}
      {/each}

      <button class="btn btn-sm btn-accent my-2" onclick={openAddCustom}>Add Custom Parameter</button>
    {/if}

    <!-- Inventory -->
    {#if !hideItems}
      <ul class="mt-2 space-y-1">
        {#each char.items as it, j}
          <li class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <button class="btn btn-xs btn-error" onclick={() => removeItem(j)}>X</button>
              <input
                type="text"
                class="input input-sm"
                value={it.name}
                onchange={(e) => setItemName(j, e.currentTarget.value)}
              />
              <button class="btn btn-xs btn-outline" onclick={() => openMove(j)}>Move</button>
              <button class="btn btn-xs btn-success" title="Use item" onclick={() => useItem(it.name)}>Use</button>
            </div>
            <input
              type="number"
              min="0"
              class="input input-sm input-secondary w-20"
              value={it.amount}
              onchange={(e) => setItemAmount(j, e.currentTarget.value)}
            />
          </li>
        {/each}
      </ul>
      <button class="btn btn-sm btn-success mt-2" onclick={openAddItem}>Add Item</button>
    {/if}
  </div>
</div>

<!-- Custom Parameter Modal (add / edit) -->
<Modal bind:open={customModalOpen} title={customEditKey === null ? 'Add Custom Parameter' : 'Edit Custom Parameter'}>
  <div class="form-control">
    <label class="label" for={`custom-name-${i}`}>Name</label>
    <input
      id={`custom-name-${i}`}
      type="text"
      class="input input-bordered"
      placeholder="Parameter name"
      bind:value={customForm.name}
    />

    <label class="label mt-2" for={`custom-type-${i}`}>Type</label>
    <select id={`custom-type-${i}`} class="select select-bordered" bind:value={customForm.type}>
      <option value="range">Range</option>
      <option value="checkbox">Checkbox</option>
    </select>

    {#if customForm.type === 'range'}
      <div class="flex gap-2 mt-2">
        <input type="number" class="input input-bordered" placeholder="Min" bind:value={customForm.min} />
        <input type="number" class="input input-bordered" placeholder="Max" bind:value={customForm.max} />
      </div>
    {/if}

    <label class="label mt-2" for={`custom-color-${i}`}>Color</label>
    <select id={`custom-color-${i}`} class="select select-bordered" bind:value={customForm.color}>
      {#each colors as c}
        <option value={c}>{c}</option>
      {/each}
    </select>
  </div>
  <div class="modal-action">
    <button class="btn" onclick={saveCustom}>{customEditKey === null ? 'Add' : 'Save'}</button>
    <button class="btn btn-ghost" onclick={() => (customModalOpen = false)}>Cancel</button>
  </div>
</Modal>

<!-- Add Item Modal -->
<Modal bind:open={addItemModalOpen} title="Add Item">
  <div class="form-control">
    <label class="label" for={`new-item-name-${i}`}>Item Name</label>
    <input
      id={`new-item-name-${i}`}
      type="text"
      list={`item-suggestions-${i}`}
      class="input input-bordered"
      placeholder="Item name"
      bind:value={newItem.name}
    />
    <datalist id={`item-suggestions-${i}`}>
      {#each $itemDatabase as db}
        <option value={db.name}></option>
      {/each}
    </datalist>
    <label class="label mt-2" for={`new-item-amount-${i}`}>Amount</label>
    <input
      id={`new-item-amount-${i}`}
      type="number"
      class="input input-bordered"
      min="0"
      bind:value={newItem.amount}
    />
  </div>
  <div class="modal-action">
    <button class="btn" onclick={submitNewItem}>Add</button>
    <button class="btn btn-ghost" onclick={() => (addItemModalOpen = false)}>Cancel</button>
  </div>
</Modal>

<!-- Move Item Modal -->
<Modal bind:open={moveModalOpen} title="Move Item">
  <div class="form-control">
    <label class="label" for={`move-dest-${i}`}>Destination</label>
    <select id={`move-dest-${i}`} class="select select-bordered w-full" bind:value={moveDest}>
      {#each $characters as c, idx}
        <option value={idx}>{c.name}</option>
      {/each}
    </select>
  </div>
  <div class="form-control mt-2">
    <label class="label" for={`move-qty-${i}`}>Quantity</label>
    <input
      id={`move-qty-${i}`}
      type="number"
      min="1"
      class="input input-bordered w-full"
      bind:value={moveQty}
    />
  </div>
  <div class="modal-action">
    <button class="btn" onclick={confirmMove}>Move</button>
    <button class="btn btn-ghost" onclick={() => (moveModalOpen = false)}>Cancel</button>
  </div>
</Modal>
