<script>
  // Character-crafting modal — mounted at app ROOT so it escapes the hidden tab container.
  // Reacts to craftingFor (set by a character card's Craft button on any tab).
  import { craftingRecipes, characters } from '../lib/stores.js';
  import { maxCraftable, craft } from '../lib/crafting.js';
  import { craftingFor } from '../lib/ui.js';
  import { toast } from '../lib/toast.js';
  import Modal from './Modal.svelte';

  let craftOpen = $state(false);
  let charIndex = $state(null);
  let recipeIndex = $state(''); // '' → none chosen
  let quantity = $state(1);

  craftingFor.subscribe((idx) => {
    if (idx !== null && idx !== undefined) {
      charIndex = idx;
      recipeIndex = '';
      quantity = 1;
      craftOpen = true;
    }
  });

  const character = $derived(charIndex !== null ? $characters[charIndex] : null);
  const selectedRecipe = $derived(
    recipeIndex !== '' && !isNaN(parseInt(recipeIndex)) ? $craftingRecipes[parseInt(recipeIndex)] : null
  );
  const qty = $derived(parseInt(quantity) || 1);

  const materialPreview = $derived(
    selectedRecipe && character
      ? selectedRecipe.materials.map((m) => {
          const it = character.items.find((i) => i.name === m.name);
          const have = it ? it.amount : 0;
          const required = m.quantity * qty;
          return { name: m.name, required, have, enough: have >= required };
        })
      : []
  );
  const outputPreview = $derived(
    selectedRecipe ? selectedRecipe.outputs.map((o) => ({ name: o.name, total: o.quantity * qty })) : []
  );
  const canCraftNow = $derived(materialPreview.length > 0 && materialPreview.every((m) => m.enough));

  function setMax() {
    if (selectedRecipe && character) quantity = maxCraftable(character, selectedRecipe);
  }

  function doCraft() {
    if (!selectedRecipe || !character) return;
    if (craft(character, selectedRecipe, qty)) {
      characters.update((list) => list); // persist in-place mutation
      const suffix = qty === 1 ? '' : ` (${qty}x)`;
      toast(`Successfully crafted ${selectedRecipe.name}${suffix}!`);
      closeCraft();
    } else {
      alert(`You don't have enough materials to craft this recipe ${qty} time(s)!`);
    }
  }

  function closeCraft() {
    craftOpen = false;
    craftingFor.set(null);
  }
</script>

<Modal bind:open={craftOpen} title={`Crafting - ${character?.name ?? ''}`}>
  <div class="form-control mb-4">
    <label class="label" for="craft-recipe">Select Recipe</label>
    <select id="craft-recipe" class="select select-bordered w-full" bind:value={recipeIndex}>
      <option value="">Choose a recipe...</option>
      {#each $craftingRecipes as recipe, i}
        <option value={String(i)}>{recipe.name}</option>
      {/each}
    </select>
  </div>

  <div class="form-control mb-4">
    <label class="label" for="craft-qty">Quantity to Craft</label>
    <div class="flex gap-2">
      <input id="craft-qty" type="number" class="input input-bordered flex-1" min="1" max="999" bind:value={quantity} />
      <button type="button" class="btn btn-outline btn-sm" onclick={setMax} disabled={!selectedRecipe}>Max</button>
    </div>
  </div>

  {#if selectedRecipe}
    <div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <h4 class="font-bold text-sm mb-2">Required Materials</h4>
          <div class="space-y-1">
            {#each materialPreview as m}
              <div class="text-sm {m.enough ? 'text-success' : 'text-error'}">
                {m.name} x{m.required} (have: {m.have}) {m.enough ? '✓' : '✗'}
              </div>
            {/each}
          </div>
        </div>
        <div>
          <h4 class="font-bold text-sm mb-2">Output</h4>
          <div class="space-y-1">
            {#each outputPreview as o}
              <div class="text-sm text-success">{o.name} x{o.total}</div>
            {/each}
          </div>
        </div>
      </div>

      <div class="mb-4">
        {#if canCraftNow}
          <div class="alert alert-success"><span>✓ You have all required materials to craft {qty} time(s)!</span></div>
        {:else}
          <div class="alert alert-error"><span>✗ Missing required materials for {qty}x crafting</span></div>
        {/if}
      </div>
    </div>
  {/if}

  <div class="modal-action">
    <button class="btn btn-primary" onclick={doCraft} disabled={!canCraftNow}>
      {qty === 1 ? 'Craft' : `Craft ${qty}x`}
    </button>
    <button class="btn btn-ghost" onclick={closeCraft}>Cancel</button>
  </div>
</Modal>
