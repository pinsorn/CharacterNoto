<script>
  // Badge management panel — ported from legacy renderBadgeList / submitNewBadge /
  // editBadge / removeBadge. Lives behind the "Manage Badges" modal in Characters.svelte.
  // Persists to the shared `badges` store.
  import { badges } from '../lib/stores.js';
  import Modal from './Modal.svelte';

  let { open = $bindable(false) } = $props();

  // null = adding a new badge; otherwise the index being edited.
  let editIndex = $state(null);
  let form = $state({ name: '', icon: '', color: 'primary', desc: '', cond: '' });

  const colors = [
    'primary', 'secondary', 'accent',
    'info', 'success', 'warning', 'error'
  ];

  function reset() {
    editIndex = null;
    form = { name: '', icon: '', color: 'primary', desc: '', cond: '' };
  }

  function startEdit(i) {
    editIndex = i;
    const b = $badges[i];
    form = {
      name: b.name ?? '',
      icon: b.icon ?? '',
      color: b.color ?? 'primary',
      desc: b.desc ?? '',
      cond: b.cond ?? ''
    };
  }

  function save() {
    const name = form.name.trim();
    const icon = form.icon.trim();
    const color = form.color;
    const desc = form.desc.trim();
    const cond = form.cond.trim();

    // Legacy guard: name AND condition required.
    if (!name || !cond) {
      alert('Name and condition required');
      return;
    }

    const entry = { name, icon, color, desc, cond };
    badges.update((list) => {
      if (editIndex !== null) list[editIndex] = entry;
      else list.push(entry);
      return list;
    });
    reset();
  }

  function remove(i) {
    badges.update((list) => {
      list.splice(i, 1);
      return list;
    });
    // If we were editing the removed one, drop back to add mode.
    if (editIndex === i) reset();
  }
</script>

<Modal bind:open title="Manage Badges">
  <div class="space-y-2 my-4 max-h-64 overflow-y-auto">
    {#each $badges as b, i}
      <div class="flex justify-between items-center py-1">
        <span class="badge badge-{b.color}">{b.icon} {b.name}</span>
        <div class="flex gap-1">
          <button class="btn btn-xs btn-primary" onclick={() => startEdit(i)}>Edit</button>
          <button class="btn btn-xs btn-error" onclick={() => remove(i)}>Delete</button>
        </div>
      </div>
    {/each}
  </div>

  <hr />

  <div class="form-control mt-4">
    <label class="label" for="badge-name">Name</label>
    <input
      id="badge-name"
      type="text"
      class="input input-bordered"
      placeholder="Badge name"
      bind:value={form.name}
    />

    <label class="label mt-2" for="badge-icon">Icon (emoji) use win+;</label>
    <input
      id="badge-icon"
      type="text"
      class="input input-bordered"
      placeholder="😀"
      maxlength="2"
      bind:value={form.icon}
    />

    <label class="label mt-2" for="badge-color">Color</label>
    <select id="badge-color" class="select select-bordered" bind:value={form.color}>
      {#each colors as c}
        <option value={c}>{c}</option>
      {/each}
    </select>

    <label class="label mt-2" for="badge-desc">Description</label>
    <textarea
      id="badge-desc"
      class="textarea textarea-bordered"
      placeholder="Description"
      bind:value={form.desc}
    ></textarea>

    <label class="label mt-2" for="badge-cond">
      Condition (JS expression, use hunger, thirsty, custom['key'].value (can be value,
      type[range,checkbox],min,max))
    </label>
    <textarea
      id="badge-cond"
      class="textarea textarea-bordered"
      placeholder="e.g. hunger>50 && custom['Health'].value==true"
      bind:value={form.cond}
    ></textarea>
  </div>

  <div class="modal-action">
    <button class="btn" onclick={save}>
      {editIndex === null ? 'Save Badge' : 'Update Badge'}
    </button>
    <button class="btn btn-ghost" onclick={() => (open = false)}>Close</button>
  </div>
</Modal>
