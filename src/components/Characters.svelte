<script>
  // Characters tab — ported from legacy character-manager.js renderCharacters() shell plus
  // the header controls (add / non-character / export / import / toggles) and the shared
  // character-level modals (add, rename, delete-confirm, badges).
  //
  // Per-card concerns (stats, custom params, inventory, avatar, badges, craft) live in
  // CharacterCard.svelte. Badge management lives in BadgesPanel.svelte.
  //
  // Legacy "Live Mode" polling is intentionally omitted — the persisted stores already
  // sync reactively across tabs, superseding the 1s interval.
  import { characters, badges, itemDatabase } from '../lib/stores.js';
  import { exportData, parseImport } from '../lib/io.js';
  import { validateItemDatabase } from '../lib/normalize.js';
  import CharacterCard from './CharacterCard.svelte';
  import BadgesPanel from './BadgesPanel.svelte';
  import Modal from './Modal.svelte';

  // Header toggles
  let hideParams = $state(false);
  let hideItems = $state(false);
  let tileMode = $state(false);

  let importInput; // hidden <input type=file>

  // --- header actions -----------------------------------------------------
  function exportAll() {
    exportData({
      characters: $characters,
      badges: $badges,
      itemDatabase: $itemDatabase
    });
  }

  async function onImportSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = parseImport(text);
      characters.set(data.characters);
      if (data.badges) badges.set(data.badges);
      if (data.itemDatabase) itemDatabase.set(validateItemDatabase(data.itemDatabase));
    } catch {
      alert('Invalid JSON');
    }
    e.target.value = null;
  }

  // --- add character / non-character -------------------------------------
  let addCharOpen = $state(false);
  let addNonCharOpen = $state(false);
  let newName = $state('');

  function openAddChar() {
    newName = '';
    addCharOpen = true;
  }
  function submitNewCharacter() {
    const name = newName.trim();
    if (name) {
      characters.update((list) => {
        list.push({ id: crypto.randomUUID(), name, hunger: 50, thirsty: 50, items: [], custom: {} });
        return list;
      });
    }
    addCharOpen = false;
  }

  function openAddNonChar() {
    newName = '';
    addNonCharOpen = true;
  }
  function submitNewNonCharacter() {
    const name = newName.trim();
    if (name) {
      characters.update((list) => {
        list.push({ id: crypto.randomUUID(), name, items: [], custom: {} });
        return list;
      });
    }
    addNonCharOpen = false;
  }

  // --- rename -------------------------------------------------------------
  let editOpen = $state(false);
  let editIndex = $state(null);
  let editName = $state('');
  function openEdit(i) {
    editIndex = i;
    editName = $characters[i].name;
    editOpen = true;
  }
  function confirmEdit() {
    const name = editName.trim();
    if (name && editIndex !== null) {
      characters.update((list) => {
        list[editIndex].name = name;
        return list;
      });
    }
    editOpen = false;
  }

  // --- delete -------------------------------------------------------------
  let deleteOpen = $state(false);
  let deleteIndex = $state(null);
  function openDelete(i) {
    deleteIndex = i;
    deleteOpen = true;
  }
  function confirmDelete() {
    if (deleteIndex !== null) {
      characters.update((list) => {
        list.splice(deleteIndex, 1);
        return list;
      });
    }
    deleteOpen = false;
  }

  // --- badges panel -------------------------------------------------------
  let badgesOpen = $state(false);
</script>

<div>
  <!-- Header / toolbar -->
  <div class="sticky top-0 bg-base-200 z-50 w-full p-4 flex flex-wrap gap-4 mb-4">
    <div class="flex items-center gap-4 w-full">
      <label class="flex items-center gap-2">
        <input type="checkbox" class="toggle toggle-primary" bind:checked={hideParams} />
        Hide Parameters
      </label>
      <label class="flex items-center gap-2">
        <input type="checkbox" class="toggle toggle-primary" bind:checked={tileMode} />
        Tile Mode
      </label>
      <label class="flex items-center gap-2">
        <input type="checkbox" class="toggle toggle-primary" bind:checked={hideItems} />
        Hide Items
      </label>
    </div>
    <button class="btn btn-primary" onclick={exportAll}>Export JSON</button>
    <button class="btn btn-secondary" onclick={() => importInput.click()}>Import JSON</button>
    <input
      type="file"
      accept=".json"
      class="hidden"
      bind:this={importInput}
      onchange={onImportSelected}
    />
    <button class="btn btn-secondary" onclick={openAddChar}>Add Character</button>
    <button class="btn btn-accent" onclick={openAddNonChar}>Add Non-Character</button>
    <button class="btn btn-info" onclick={() => (badgesOpen = true)}>Manage Badges</button>
  </div>

  <!-- Character list. The wrapper carries class:tile-mode so app.css
       (.tile-mode #character-list) can switch to the grid tile layout. -->
  <div class:tile-mode={tileMode}>
    <div id="character-list" class="grid gap-4">
      {#each $characters as char, i (char)}
        <CharacterCard {i} {hideParams} {hideItems} onEdit={openEdit} onDelete={openDelete} />
      {/each}
    </div>
  </div>
</div>

<!-- Add Character Modal -->
<Modal bind:open={addCharOpen} title="Add Character">
  <div class="form-control">
    <label class="label" for="new-character-name">Name</label>
    <input
      id="new-character-name"
      type="text"
      class="input input-bordered"
      placeholder="Character name"
      bind:value={newName}
    />
  </div>
  <div class="modal-action">
    <button class="btn" onclick={submitNewCharacter}>Add</button>
    <button class="btn btn-ghost" onclick={() => (addCharOpen = false)}>Cancel</button>
  </div>
</Modal>

<!-- Add Non-Character Modal -->
<Modal bind:open={addNonCharOpen} title="Add Non-Character">
  <div class="form-control">
    <label class="label" for="new-noncharacter-name">Name</label>
    <input
      id="new-noncharacter-name"
      type="text"
      class="input input-bordered"
      placeholder="Name"
      bind:value={newName}
    />
  </div>
  <div class="modal-action">
    <button class="btn" onclick={submitNewNonCharacter}>Add</button>
    <button class="btn btn-ghost" onclick={() => (addNonCharOpen = false)}>Cancel</button>
  </div>
</Modal>

<!-- Edit Character Name Modal -->
<Modal bind:open={editOpen} title="Edit Character Name">
  <div class="form-control">
    <label class="label" for="edit-character-name">Name</label>
    <input id="edit-character-name" type="text" class="input input-bordered" bind:value={editName} />
  </div>
  <div class="modal-action">
    <button class="btn" onclick={confirmEdit}>Save</button>
    <button class="btn btn-ghost" onclick={() => (editOpen = false)}>Cancel</button>
  </div>
</Modal>

<!-- Delete Character Confirmation Modal -->
<Modal bind:open={deleteOpen} title="Confirm Delete">
  <p class="py-4">
    Are you sure you want to delete
    <strong>{deleteIndex !== null ? $characters[deleteIndex]?.name : ''}</strong>?
  </p>
  <div class="modal-action">
    <button class="btn btn-error" onclick={confirmDelete}>Yes, Delete</button>
    <button class="btn" onclick={() => (deleteOpen = false)}>Cancel</button>
  </div>
</Modal>

<!-- Badge Management Panel -->
<BadgesPanel bind:open={badgesOpen} />
