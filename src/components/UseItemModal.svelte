<script>
  // Shared "use item on character" modal. Triggered from both the Characters inventory
  // and the Items wiki via the useItemFor store. Applies item effects via the ported engine.
  import { characters } from '../lib/stores.js';
  import { useItemFor } from '../lib/ui.js';
  import { applyItemEffects } from '../lib/effects.js';
  import { toast } from '../lib/toast.js';
  import Modal from './Modal.svelte';

  let open = $state(false);
  let item = $state(null);
  let selectedIndex = $state(0);

  useItemFor.subscribe((req) => {
    if (req && req.item) {
      item = req.item;
      selectedIndex = req.characterIndex ?? 0;
      open = true;
    }
  });

  function close() {
    open = false;
    useItemFor.set(null);
  }

  function confirm() {
    characters.update((list) => {
      const ch = list[selectedIndex];
      if (ch && item) {
        applyItemEffects(ch, item);
        toast(`Used ${item.name} on ${ch.name}!`);
      }
      return list;
    });
    close();
  }
</script>

<Modal bind:open title="Use Item">
  {#if item}
    <p class="mb-2">Use <strong>{item.name}</strong> on:</p>
    <select class="select select-bordered w-full mb-4" bind:value={selectedIndex}>
      {#each $characters as ch, i}
        <option value={i}>{ch.name}</option>
      {/each}
    </select>
    <div class="modal-action">
      <button class="btn" onclick={close}>Cancel</button>
      <button class="btn btn-primary" onclick={confirm}>Use</button>
    </div>
  {/if}
</Modal>
